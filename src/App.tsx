import { useEffect, useMemo, useRef, useState } from "react";
import { PieceEngine } from "./audio/engine";
import { looksLikeAudio, REQUIRED_STEMS, STEM_FILES } from "./audio/loadStems";
import { describeState, desiredState, markerLabel } from "./composition/arrange";
import { majorityMood, waitRemaining } from "./composition/persist";
import { HOME_STATE, PRESETS, presetById, type MusicalState, type PresetId } from "./composition/types";
import { analyzeAt } from "./market/analyze";
import { cashSession } from "./market/cashSession";
import { applyQuotes, barsFromSnapshot, fetchLiveQuotes, fetchSnapshot, overridesFor, vendorRolling } from "./market/live";
import { localRolling } from "./market/rollingView";
import {
  BOLLINGER_WINDOWS,
  CALM_CONDITIONS,
  LONG_WINDOWS,
  PRICE_WINDOWS,
  SHORT_WINDOWS,
  defaultSettings,
  type Bar,
  type Conditions,
  type ReferenceKind,
  type SeriesSettings,
  type SignalSettings,
  type SymbolId,
} from "./market/types";
import type { MarketSnapshot } from "../server/twelve";
import { buildScenario, segmentAt } from "./mock/scenario";
import {
  applyLive,
  applyThrough,
  indexAt,
  initialMemory,
  onPhrase,
  queuedMusic,
  scenarioDuration,
  walkConditions,
  type Marker,
  type Memory,
} from "./playback";
import { Chart } from "./ui/Chart";

const LABELS: Record<SymbolId, string> = {
  spy: "SPY · cello",
  tlt: "TLT · guitar",
  gld: "Gold · bass",
  vix: "VIX · percussion",
};

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function gapText(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function App() {
  const scenario = useMemo(() => buildScenario(), []);
  const [settings, setSettings] = useState<SignalSettings>(defaultSettings);
  const [presetId, setPresetId] = useState<PresetId>("balanced");
  const [source, setSource] = useState<"scenario" | "live">("scenario");
  const [playing, setPlaying] = useState(false);
  const [memory, setMemory] = useState<Memory>(() => initialMemory(scenario, defaultSettings));
  const [elapsed, setElapsed] = useState(0);
  const [barInPhrase, setBarInPhrase] = useState(0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [forces, setForces] = useState({
    stockRising: false,
    stockFalling: false,
    bondRising: false,
    bondFalling: false,
    goldRising: false,
    goldFalling: false,
    volatility: false,
  });
  const [stemNote, setStemNote] = useState("Press play to start the clock. Audio joins when the stems are in public/stems.");
  const [liveNote, setLiveNote] = useState("");
  const [liveBars, setLiveBars] = useState<Bar[] | null>(null);
  const [liveRolling, setLiveRolling] = useState<ReturnType<typeof localRolling> | null>(null);

  const engineRef = useRef<PieceEngine | null>(null);
  const memoryRef = useRef(memory);
  const settingsRef = useRef(settings);
  const presetRef = useRef(presetId);
  const sourceRef = useRef(source);
  const forcesRef = useRef(forces);
  const offsetRef = useRef(0);
  const playingRef = useRef(false);
  const hasResolveRef = useRef(false);
  const moodRef = useRef<Conditions>(CALM_CONDITIONS);
  const quoteTimers = useRef<number[]>([]);
  const liveSnapshotRef = useRef<MarketSnapshot | null>(null);
  const liveDateRef = useRef("");
  const scenarioRef = useRef(scenario);

  memoryRef.current = memory;
  settingsRef.current = settings;
  presetRef.current = presetId;
  sourceRef.current = source;
  forcesRef.current = forces;
  scenarioRef.current = scenario;

  const preset = presetById(presetId);
  const duration = scenarioDuration(scenario);
  const sliceFrom = source === "live" && liveBars ? 0 : Math.max(0, scenario.playFrom - 40);
  const viewBars = source === "live" && liveBars ? liveBars : scenario.bars.slice(sliceFrom);
  const rollingAll = useMemo(() => localRolling(scenario.bars, settings), [scenario, settings]);
  const rolling = source === "live" && liveRolling ? liveRolling : rollingAll.slice(sliceFrom);

  function publish(next: Memory, transportElapsed = elapsed, bar = barInPhrase) {
    memoryRef.current = next;
    setMemory(next);
    setMarkers(next.markers);
    setElapsed(transportElapsed);
    setBarInPhrase(bar);
  }

  function withForces(conditions: Conditions): Conditions {
    const force = forcesRef.current;
    return {
      ...conditions,
      stockTrend: force.stockRising ? "rising" : force.stockFalling ? "falling" : conditions.stockTrend,
      bondTrend: force.bondRising ? "rising" : force.bondFalling ? "falling" : conditions.bondTrend,
      goldTrend: force.goldRising ? "rising" : force.goldFalling ? "falling" : conditions.goldTrend,
      volatility: force.volatility ? "elevated" : conditions.volatility,
    };
  }

  function frozenNow(committed: Conditions): MusicalState | null {
    if (presetRef.current !== "session") return null;
    return desiredState(withForces(committed), HOME_STATE, hasResolveRef.current);
  }

  function project(base: Memory): Memory {
    const committed = presetRef.current === "session" ? withForces(moodRef.current) : withForces(base.committed);
    return { ...base, committed };
  }

  useEffect(() => {
    const samples = walkConditions(scenario.bars, scenario.playFrom, scenario.playTo - 1, settings);
    moodRef.current = majorityMood(samples);
    const at = playingRef.current ? Math.min(duration, Math.max(0, (engineRef.current?.transport().elapsed ?? 0) + offsetRef.current)) : offsetRef.current;
    const index = indexAt(scenario, at);
    let next = applyThrough(initialMemory(scenario, settings), scenario, index, settings, preset.freeze ? 0 : preset.persistenceMs);
    if (preset.freeze) {
      next.committed = moodRef.current;
      next.pending = {};
      next.musical = desiredState(withForces(moodRef.current), HOME_STATE, hasResolveRef.current);
    }
    publish(next, at, engineRef.current?.transport().barInPhrase ?? 0);
    // Rebuild the walked state when the comparison or the preset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, presetId, scenario]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const transport = engine.transport();
      engine.setPhraseBars(presetById(presetRef.current).phraseBars);
      if (sourceRef.current !== "scenario") {
        publish(memoryRef.current, transport.elapsed, transport.barInPhrase);
        return;
      }
      const at = Math.min(scenarioDuration(scenarioRef.current), Math.max(0, transport.elapsed + offsetRef.current));
      const index = indexAt(scenarioRef.current, at);
      let next = memoryRef.current;
      if (index < next.lastIndex) next = initialMemory(scenarioRef.current, settingsRef.current);
      const chosen = presetById(presetRef.current);
      next = applyThrough(next, scenarioRef.current, index, settingsRef.current, chosen.freeze ? 0 : chosen.persistenceMs);
      if (chosen.freeze) {
        next.committed = moodRef.current;
        next.pending = {};
      }
      publish(next, at, transport.barInPhrase);
    }, 200);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    let cancel = false;
    void Promise.all(
      REQUIRED_STEMS.map(async (name) => {
        const response = await fetch(`/stems/${STEM_FILES[name]}`, { method: "HEAD" });
        return looksLikeAudio(response) ? null : STEM_FILES[name];
      }),
    ).then((missing) => {
      if (cancel) return;
      const absent = missing.filter((file) => file != null);
      if (absent.length > 0) {
        setStemNote(`Waiting for ${absent.join(", ")} in public/stems. The clock, chart, and arrangement still run.`);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => () => {
    engineRef.current?.stop();
    quoteTimers.current.forEach((id) => window.clearInterval(id));
  }, []);

  function clearQuotes() {
    quoteTimers.current.forEach((id) => window.clearInterval(id));
    quoteTimers.current = [];
  }

  async function refreshQuotes() {
    const snapshot = liveSnapshotRef.current;
    if (!snapshot || !playingRef.current || sourceRef.current !== "live") return;
    try {
      const quotes = await fetchLiveQuotes();
      const bars = applyQuotes(barsFromSnapshot(snapshot), quotes);
      liveDateRef.current = bars[bars.length - 1]?.date ?? "";
      setLiveBars(bars);
      const session = cashSession();
      const frame = analyzeAt(
        bars,
        bars.length - 1,
        settingsRef.current,
        memoryRef.current.schmitt,
        overridesFor(snapshot, settingsRef.current, quotes),
        session,
      );
      const chosen = presetById(presetRef.current);
      const next = applyLive(
        memoryRef.current,
        frame,
        (engineRef.current?.transport().elapsed ?? 0) * 1000,
        chosen.persistenceMs,
        session === "closed" || chosen.freeze,
      );
      publish(next, engineRef.current?.transport().elapsed ?? 0, engineRef.current?.transport().barInPhrase ?? 0);
      setLiveNote(session === "closed" ? "The cash session is closed. The arrangement holds." : "Live quotes are in.");
    } catch (error) {
      setLiveNote(error instanceof Error ? error.message : "Quote refresh failed");
    }
  }

  async function togglePlay() {
    const engine = engineRef.current ?? new PieceEngine();
    engineRef.current = engine;
    if (playingRef.current) {
      if (sourceRef.current === "scenario") {
        offsetRef.current = Math.min(duration, Math.max(0, engine.transport().elapsed + offsetRef.current));
      }
      clearQuotes();
      engine.stop();
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    const chosen = presetById(presetRef.current);
    if (sourceRef.current === "live") {
      try {
        setLiveNote("Loading quotes and rolling averages…");
        const snapshot = await fetchSnapshot(settingsRef.current);
        liveSnapshotRef.current = snapshot;
        const bars = barsFromSnapshot(snapshot);
        liveDateRef.current = bars[bars.length - 1]?.date ?? "";
        setLiveBars(bars);
        const vendor = vendorRolling(snapshot, bars);
        const local = localRolling(bars, settingsRef.current);
        setLiveRolling(
          local.map((point, index) => ({
            spy: vendor.spy[index] ?? point.spy,
            tlt: vendor.tlt[index] ?? point.tlt,
            gld: vendor.gld[index] ?? point.gld,
            vix: vendor.vix[index] ?? point.vix,
          })),
        );
        const walked = walkConditions(bars, 0, Math.max(0, bars.length - 2), settingsRef.current);
        const previous = walked.at(-1) ?? CALM_CONDITIONS;
        const session = cashSession();
        const frame = analyzeAt(bars, bars.length - 1, settingsRef.current, previous, overridesFor(snapshot, settingsRef.current, {}), session);
        const conditions: Conditions = {
          stockTrend: frame.stockTrend,
          bondTrend: frame.bondTrend,
          goldTrend: frame.goldTrend,
          relationship: frame.relationship,
          volatility: frame.volatility,
        };
        let next = initialMemory(scenarioRef.current, settingsRef.current);
        next = { ...next, schmitt: conditions, raw: conditions, committed: conditions, frame, lastIndex: bars.length - 1 };
        if (chosen.freeze || session === "closed") next.musical = desiredState(conditions, HOME_STATE, hasResolveRef.current);
        publish(next, 0, 0);
        setLiveNote(
          snapshot.warning ??
            (session === "closed"
              ? "The cash session is closed. The arrangement holds. Prices still load."
              : "Live lasts refresh about a minute after load, then every five minutes."),
        );
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Live market data is unavailable");
        return;
      }
    } else {
      const at = offsetRef.current;
      let next = applyThrough(initialMemory(scenarioRef.current, settingsRef.current), scenarioRef.current, indexAt(scenarioRef.current, at), settingsRef.current, chosen.freeze ? 0 : chosen.persistenceMs);
      if (chosen.freeze) {
        next.committed = moodRef.current;
        next.pending = {};
        next.musical = desiredState(withForces(moodRef.current), HOME_STATE, hasResolveRef.current);
      }
      publish(next, at, 0);
    }

    const report = await engine.start(chosen.phraseBars, memoryRef.current.musical, () => {
      const current = project(memoryRef.current);
      const queued = queuedMusic(current, hasResolveRef.current, frozenNow(current.committed));
      const date = sourceRef.current === "live" ? liveDateRef.current : (scenarioRef.current.bars[current.lastIndex]?.date ?? "");
      const landed = onPhrase(memoryRef.current, queued, date);
      memoryRef.current = landed;
      setMemory(landed);
      setMarkers(landed.markers);
      return landed.musical;
    });
    hasResolveRef.current = engine.hasResolveStem();
    if (report.missing.length === 0) {
      const change = report.directional.length > 0 ? ` Change takes: ${report.directional.join(", ")}.` : "";
      setStemNote(`Playing bed: ${report.loaded.join(", ")}.${change}`);
    } else {
      setStemNote(`Clock is running. Add ${report.missing.join(", ")} to public/stems and press play again to hear them.`);
    }
    playingRef.current = true;
    setPlaying(true);
    if (sourceRef.current === "live") {
      const first = window.setTimeout(() => void refreshQuotes(), 65_000);
      const poll = window.setInterval(() => void refreshQuotes(), 5 * 60 * 1000);
      quoteTimers.current = [first, poll];
    }
  }

  function scrub(seconds: number) {
    const engine = engineRef.current;
    offsetRef.current = playingRef.current && engine ? seconds - engine.transport().elapsed : seconds;
    const chosen = presetById(presetId);
    let next = applyThrough(initialMemory(scenario, settings), scenario, indexAt(scenario, seconds), settings, chosen.freeze ? 0 : chosen.persistenceMs);
    if (chosen.freeze) {
      next.committed = moodRef.current;
      next.pending = {};
      next.musical = desiredState(withForces(moodRef.current), HOME_STATE, hasResolveRef.current);
    }
    publish(next, seconds, engine?.transport().barInPhrase ?? 0);
    if (playingRef.current && engine) {
      const queued = queuedMusic(project(next), hasResolveRef.current, frozenNow(next.committed));
      engine.apply(queued, engine.transport().elapsed);
    }
  }

  function updateSeries(id: SymbolId, patch: Partial<SeriesSettings>) {
    setSettings((current) => {
      const series = { ...current[id], ...patch };
      if (series.reference === "bbands" && !(BOLLINGER_WINDOWS as readonly number[]).includes(series.window)) series.window = 20;
      return { ...current, [id]: series };
    });
  }

  const frame = memory.frame;
  const heard = preset.freeze ? withForces(moodRef.current) : withForces(memory.committed);
  const queued = queuedMusic({ ...memory, committed: heard }, hasResolveRef.current, frozenNow(heard));
  const upcoming = markerLabel(memory.musical, queued);
  const shownPlay = source === "live" && liveBars ? Math.max(0, liveBars.length - 1) : Math.max(0, memory.lastIndex - sliceFrom);

  return (
    <main className="page">
      <header>
        <h1>Sound of Market</h1>
        <p>D major · 80 BPM · one piece, rearranged by the market</p>
      </header>

      <section className="now">
        <div>
          <h2>{describeState(memory.musical)}</h2>
          <p className="next">{upcoming ? `On the next phrase: ${upcoming}` : "Holding this arrangement"}</p>
          <p className="segment">{source === "scenario" ? segmentAt(scenario, memory.lastIndex) : liveNote || "Live market"}</p>
        </div>
        <div className="meter" aria-label={`Bar ${barInPhrase + 1} of ${preset.phraseBars}`}>
          {Array.from({ length: preset.phraseBars }, (_, index) => (
            <i key={index} className={playing && index === barInPhrase ? "on" : ""} />
          ))}
        </div>
      </section>

      <Chart
        bars={viewBars}
        rolling={rolling}
        playIndex={shownPlay}
        markers={source === "scenario" ? markers : []}
        settings={settings}
        musical={queued}
        playing={playing}
      />

      <div className="transport">
        <button className="play" type="button" onClick={() => void togglePlay()}>
          {playing ? "Stop" : "Play"}
        </button>
        <button type="button" aria-pressed={source === "scenario"} onClick={() => setSource("scenario")}>
          Scenario
        </button>
        <button type="button" aria-pressed={source === "live"} onClick={() => setSource("live")}>
          Live
        </button>
        <span className="clock">{source === "scenario" ? `${clock(elapsed)} / ${clock(duration)}` : clock(elapsed)}</span>
        {source === "scenario" ? (
          <input
            type="range"
            min={0}
            max={duration}
            step={scenario.sampleSec}
            value={Math.min(duration, elapsed)}
            aria-label="Scenario time"
            onChange={(event) => scrub(Number(event.target.value))}
          />
        ) : null}
      </div>

      <div className="layout">
        <section className="panel">
          <h3>Response</h3>
          <div className="presets" role="group" aria-label="Response preset">
            {PRESETS.map((item) => (
              <button key={item.id} type="button" aria-pressed={item.id === presetId} onClick={() => setPresetId(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="note">{preset.note}</p>
          <div className="forces">
            <label>
              <input
                type="checkbox"
                checked={forces.stockRising}
                onChange={(event) => setForces((current) => ({ ...current, stockRising: event.target.checked, stockFalling: event.target.checked ? false : current.stockFalling }))}
              />
              Stocks rising
            </label>
            <label>
              <input
                type="checkbox"
                checked={forces.stockFalling}
                onChange={(event) => setForces((current) => ({ ...current, stockFalling: event.target.checked, stockRising: event.target.checked ? false : current.stockRising }))}
              />
              Stocks falling
            </label>
            <label>
              <input
                type="checkbox"
                checked={forces.bondRising}
                onChange={(event) => setForces((current) => ({ ...current, bondRising: event.target.checked, bondFalling: event.target.checked ? false : current.bondFalling }))}
              />
              Bonds rising
            </label>
            <label>
              <input
                type="checkbox"
                checked={forces.bondFalling}
                onChange={(event) => setForces((current) => ({ ...current, bondFalling: event.target.checked, bondRising: event.target.checked ? false : current.bondRising }))}
              />
              Bonds falling
            </label>
            <label>
              <input
                type="checkbox"
                checked={forces.goldRising}
                onChange={(event) => setForces((current) => ({ ...current, goldRising: event.target.checked, goldFalling: event.target.checked ? false : current.goldFalling }))}
              />
              Gold rising
            </label>
            <label>
              <input
                type="checkbox"
                checked={forces.goldFalling}
                onChange={(event) => setForces((current) => ({ ...current, goldFalling: event.target.checked, goldRising: event.target.checked ? false : current.goldRising }))}
              />
              Gold falling
            </label>
            <label>
              <input type="checkbox" checked={forces.volatility} onChange={(event) => setForces((current) => ({ ...current, volatility: event.target.checked }))} />
              Force storm
            </label>
          </div>
        </section>

        <section className="panel">
          <h3>Current against rolling</h3>
          <table>
            <thead>
              <tr>
                <th>Series</th>
                <th>Reference</th>
                <th>Window</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {(["spy", "tlt", "gld", "vix"] as SymbolId[]).map((id) => {
                const series = settings[id];
                const windows = series.reference === "bbands" ? BOLLINGER_WINDOWS : PRICE_WINDOWS;
                const snap = frame?.[id];
                return (
                  <tr key={id}>
                    <td>{LABELS[id]}</td>
                    <td>
                      <select aria-label={`${LABELS[id]} reference`} value={series.reference} onChange={(event) => updateSeries(id, { reference: event.target.value as ReferenceKind })}>
                        <option value="session">Session</option>
                        <option value="sma">SMA</option>
                        <option value="ema">EMA</option>
                        {id === "vix" ? <option value="bbands">Bollinger</option> : null}
                      </select>
                    </td>
                    <td>
                      <select aria-label={`${LABELS[id]} window`} value={series.window} disabled={series.reference === "session"} onChange={(event) => updateSeries(id, { window: Number(event.target.value) })}>
                        {windows.map((window) => (
                          <option key={window} value={window}>
                            {window}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={snap?.gap != null && snap.gap >= 0 ? "num up" : "num down"}>{gapText(snap?.gap ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="forces">
            <label>
              Relationship
              <select
                aria-label="Relationship mode"
                value={settings.relationship.mode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    relationship: { ...current.relationship, mode: event.target.value as SignalSettings["relationship"]["mode"] },
                  }))
                }
              >
                <option value="short-long">Short vs long correlation</option>
                <option value="session-long">Session vs long correlation</option>
              </select>
            </label>
            <label>
              Short
              <select
                aria-label="Short correlation window"
                value={settings.relationship.shortWindow}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    relationship: { ...current.relationship, shortWindow: Number(event.target.value) },
                  }))
                }
              >
                {SHORT_WINDOWS.map((window) => (
                  <option key={window} value={window}>
                    {window}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Long
              <select
                aria-label="Long correlation window"
                value={settings.relationship.longWindow}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    relationship: { ...current.relationship, longWindow: Number(event.target.value) },
                  }))
                }
              >
                {LONG_WINDOWS.map((window) => (
                  <option key={window} value={window}>
                    {window}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="note">
            ρ {frame?.rhoShort == null ? "—" : frame.rhoShort.toFixed(2)} short · ρ {frame?.rhoLong == null ? "—" : frame.rhoLong.toFixed(2)} long
          </p>
        </section>
      </div>

      <section className="readout">
        <Condition
          label="Cello"
          raw={memory.raw.stockTrend}
          committed={heard.stockTrend}
          wait={preset.freeze ? null : waitRemaining(memory.pending, elapsed * 1000, preset.persistenceMs, "stockTrend")}
        />
        <Condition
          label="Guitar"
          raw={memory.raw.bondTrend}
          committed={heard.bondTrend}
          wait={preset.freeze ? null : waitRemaining(memory.pending, elapsed * 1000, preset.persistenceMs, "bondTrend")}
        />
        <Condition
          label="Bass"
          raw={memory.raw.goldTrend}
          committed={heard.goldTrend}
          wait={preset.freeze ? null : waitRemaining(memory.pending, elapsed * 1000, preset.persistenceMs, "goldTrend")}
        />
        <Condition
          label="Percussion"
          raw={memory.raw.volatility}
          committed={heard.volatility}
          wait={preset.freeze ? null : waitRemaining(memory.pending, elapsed * 1000, preset.persistenceMs, "volatility")}
        />
      </section>

      <p className="foot">
        {stemNote} {liveNote ? <span className="warn"> {liveNote}</span> : null} The scenario is synthetic, so the default bands stay crossed long enough to hear.
      </p>
    </main>
  );
}

function Condition({ label, raw, committed, wait, extra }: { label: string; raw: string; committed: string; wait: number | null; extra?: string }) {
  const waiting = wait == null ? "" : ` · waiting ${clock(wait / 1000)}`;
  return (
    <div>
      <span>{label}</span>
      <strong>{committed}</strong>
      <em>
        raw {raw}
        {waiting}
        {extra ? ` · ${extra}` : ""}
      </em>
    </div>
  );
}
