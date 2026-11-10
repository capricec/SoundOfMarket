export type PartMotion = "home" | "rising" | "falling";
export type Percussion = "out" | "in" | "resolving";

export type MusicalState = {
  cello: PartMotion;
  guitar: PartMotion;
  bass: PartMotion;
  percussion: Percussion;
};

export const HOME_STATE: MusicalState = {
  cello: "home",
  guitar: "home",
  bass: "home",
  percussion: "out",
};

export type Dwell = {
  cello: number;
  guitar: number;
  bass: number;
  percussion: number;
};

export const OPEN_DWELL: Dwell = { cello: 0, guitar: 0, bass: 0, percussion: 0 };

export type PresetId = "reactive" | "balanced" | "patient" | "session";

export type Preset = {
  id: PresetId;
  label: string;
  phraseBars: number;
  /** How long a raw condition must hold before it may change the music. */
  persistenceMs: number;
  freeze: boolean;
  note: string;
};

export const PRESETS: Preset[] = [
  {
    id: "reactive",
    label: "Reactive",
    phraseBars: 4,
    persistenceMs: 0,
    freeze: false,
    note: "Answers on the next 12-second phrase.",
  },
  {
    id: "balanced",
    label: "Balanced",
    phraseBars: 8,
    persistenceMs: 2 * 60 * 1000,
    freeze: false,
    note: "A condition must hold for about two minutes.",
  },
  {
    id: "patient",
    label: "Patient",
    phraseBars: 16,
    persistenceMs: 10 * 60 * 1000,
    freeze: false,
    note: "A condition must hold for about ten minutes.",
  },
  {
    id: "session",
    label: "Session",
    phraseBars: 8,
    persistenceMs: 0,
    freeze: true,
    note: "One arrangement for the whole scenario, from its dominant character.",
  },
];

export function presetById(id: PresetId): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[1];
}
