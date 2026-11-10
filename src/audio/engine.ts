import type { MusicalState, PartMotion } from "../composition/types";
import { loadStems, stemReport, type StemName, type StemSet } from "./loadStems";

const BPM = 80;
const BAR_SEC = (60 / BPM) * 4;
const BED = 0.34;
const PERC = 0.28;

const NAMES = [
  "cello",
  "celloRising",
  "celloFalling",
  "celloQuiet",
  "celloSolo",
  "guitar",
  "guitarRising",
  "guitarFalling",
  "guitarQuiet",
  "guitarSuperquiet",
  "bass",
  "bassRising",
  "bassFalling",
  "percussion",
  "percResolve",
] as const satisfies readonly StemName[];

function fadeCurve(from: number, to: number): Float32Array {
  const steps = 32;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const eased = to >= from ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
    const value = to >= from ? from + (to - from) * eased : to + (from - to) * eased;
    curve[i] = Math.max(0.0001, value);
  }
  return curve;
}

function pick(
  motion: PartMotion,
  home: StemName,
  rising: StemName,
  falling: StemName,
  stems: StemSet,
): StemName {
  if (motion === "rising" && stems[rising]) return rising;
  if (motion === "falling" && stems[falling]) return falling;
  return home;
}

function targets(state: MusicalState, stems: StemSet): Record<StemName, number> {
  const cello = pick(state.cello, "cello", "celloRising", "celloFalling", stems);
  const guitar = pick(state.guitar, "guitar", "guitarRising", "guitarFalling", stems);
  const bass = pick(state.bass, "bass", "bassRising", "bassFalling", stems);
  const percussionOn = state.percussion === "in" || (state.percussion === "resolving" && !stems.percResolve);
  const resolveOn = state.percussion === "resolving" && stems.percResolve;

  const levels = Object.fromEntries(NAMES.map((name) => [name, 0.0001])) as Record<StemName, number>;
  levels[cello] = BED;
  levels[guitar] = BED;
  levels[bass] = BED;
  levels.percussion = percussionOn ? PERC : 0.0001;
  levels.percResolve = resolveOn ? PERC : 0.0001;
  return levels;
}

export class PieceEngine {
  private ctx: AudioContext | null = null;
  private gains = new Map<StemName, GainNode>();
  private levels = new Map<StemName, number>();
  private stems: StemSet | null = null;
  private timer = 0;
  private origin = 0;
  private nextBoundary = 0;
  private phraseBars = 8;
  private sources: AudioBufferSourceNode[] = [];

  hasResolveStem(): boolean {
    return Boolean(this.stems?.percResolve);
  }

  phraseSeconds(): number {
    return BAR_SEC * this.phraseBars;
  }

  setPhraseBars(bars: number) {
    this.phraseBars = bars;
  }

  transport(): { elapsed: number; barInPhrase: number; phraseBars: number } {
    if (!this.ctx) return { elapsed: 0, barInPhrase: 0, phraseBars: this.phraseBars };
    const elapsed = Math.max(0, this.ctx.currentTime - this.origin);
    const bar = Math.floor(elapsed / BAR_SEC);
    return { elapsed, barInPhrase: bar % this.phraseBars, phraseBars: this.phraseBars };
  }

  async start(
    phraseBars: number,
    initial: MusicalState,
    onPhrase: () => MusicalState,
  ): Promise<{ loaded: string[]; missing: string[]; directional: string[] }> {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state !== "running") await ctx.resume();
    this.stems = await loadStems(ctx);
    this.phraseBars = phraseBars;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 8;
    compressor.ratio.value = 2;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const when = ctx.currentTime + 0.08;
    this.origin = when;
    this.gains.clear();
    this.levels.clear();
    this.sources = [];

    for (const name of NAMES) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(master);
      this.gains.set(name, gain);
      this.levels.set(name, 0.0001);
      const buffer = this.stems[name];
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(when);
      this.sources.push(source);
    }

    this.apply(initial, when);
    this.nextBoundary = when + this.phraseSeconds();
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      if (this.ctx.currentTime < this.nextBoundary - 0.04) return;
      const boundary = this.nextBoundary;
      this.nextBoundary += this.phraseSeconds();
      if (this.nextBoundary < this.ctx.currentTime) this.nextBoundary = this.ctx.currentTime + 0.05;
      this.apply(onPhrase(), boundary);
    }, 80);

    return stemReport(this.stems);
  }

  apply(state: MusicalState, when: number) {
    if (!this.ctx || !this.stems) return;
    const at = Math.max(when, this.ctx.currentTime);
    const next = targets(state, this.stems);
    for (const name of NAMES) {
      const node = this.gains.get(name);
      if (!node) continue;
      const from = this.levels.get(name) ?? 0.0001;
      const to = next[name];
      this.levels.set(name, to);
      node.gain.cancelScheduledValues(at);
      node.gain.setValueAtTime(Math.max(0.0001, from), at);
      node.gain.setValueCurveAtTime(fadeCurve(from, to), at, BAR_SEC);
    }
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.gains.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.stems = null;
  }
}
