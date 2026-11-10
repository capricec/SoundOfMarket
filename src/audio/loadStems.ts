export const STEM_FILES = {
  cello: "cello.wav",
  celloRising: "cello_rising.wav",
  celloFalling: "cello_falling.wav",
  celloQuiet: "cello_quiet.wav",
  celloSolo: "cello_solo.wav",
  guitar: "guitar.wav",
  guitarRising: "guitar_rising.wav",
  guitarFalling: "guitar_falling.wav",
  guitarQuiet: "guitar_quiet.wav",
  guitarSuperquiet: "guitar_superquiet.wav",
  bass: "bass.wav",
  bassRising: "bass_rising.wav",
  bassFalling: "bass_falling.wav",
  percussion: "percussion.wav",
  percResolve: "perc_resolve.wav",
} as const;

export type StemName = keyof typeof STEM_FILES;

export type StemSet = Record<StemName, AudioBuffer | null>;

export const REQUIRED_STEMS: StemName[] = ["cello", "guitar", "bass", "percussion"];

export const DIRECTIONAL_STEMS: StemName[] = [
  "celloRising",
  "celloFalling",
  "guitarRising",
  "guitarFalling",
  "bassRising",
  "bassFalling",
];

export function looksLikeAudio(response: Response): boolean {
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  return response.ok && !type.includes("text/html") && !type.includes("application/json");
}

async function fetchBuffer(file: string): Promise<ArrayBuffer | null> {
  const response = await fetch(`/stems/${file}`);
  if (!looksLikeAudio(response)) return null;
  return response.arrayBuffer();
}

export async function loadStems(ctx: AudioContext): Promise<StemSet> {
  const entries = await Promise.all(
    (Object.keys(STEM_FILES) as StemName[]).map(async (name) => {
      const data = await fetchBuffer(STEM_FILES[name]);
      if (!data) return [name, null] as const;
      try {
        const buffer = await ctx.decodeAudioData(data.slice(0));
        return [name, buffer] as const;
      } catch {
        return [name, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as StemSet;
}

export function stemReport(stems: StemSet): { loaded: string[]; missing: string[]; directional: string[] } {
  const loaded: string[] = [];
  const missing: string[] = [];
  const directional: string[] = [];
  for (const name of REQUIRED_STEMS) {
    const file = STEM_FILES[name];
    if (stems[name]) loaded.push(file);
    else missing.push(file);
  }
  for (const name of DIRECTIONAL_STEMS) {
    if (stems[name]) directional.push(STEM_FILES[name]);
  }
  return { loaded, missing, directional };
}
