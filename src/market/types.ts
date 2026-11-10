export type SymbolId = "spy" | "tlt" | "gld" | "vix";

export type ReferenceKind = "session" | "sma" | "ema" | "bbands";

export type Trend = "resting" | "rising" | "falling";
export type Relationship = "familiar" | "shifted";
export type Volatility = "calm" | "elevated";

export type SeriesSettings = {
  reference: ReferenceKind;
  window: number;
};

export type RelationshipMode = "short-long" | "session-long";

export type RelationshipSettings = {
  mode: RelationshipMode;
  shortWindow: number;
  longWindow: number;
};

export type SignalSettings = {
  spy: SeriesSettings;
  tlt: SeriesSettings;
  gld: SeriesSettings;
  vix: SeriesSettings;
  relationship: RelationshipSettings;
};

export const PRICE_WINDOWS = [5, 10, 20, 30, 50, 200] as const;
export const BOLLINGER_WINDOWS = [10, 20, 30] as const;
export const SHORT_WINDOWS = [5, 10, 20] as const;
export const LONG_WINDOWS = [30, 60, 90] as const;

export const defaultSettings: SignalSettings = {
  spy: { reference: "sma", window: 30 },
  tlt: { reference: "sma", window: 30 },
  gld: { reference: "sma", window: 50 },
  vix: { reference: "sma", window: 20 },
  relationship: { mode: "short-long", shortWindow: 10, longWindow: 60 },
};

export type Bar = {
  date: string;
  spy: number;
  tlt: number;
  gld: number;
  vix: number;
};

export type SeriesSnapshot = {
  last: number;
  previous: number;
  rolling: number | null;
  upperBand: number | null;
  middleBand: number | null;
  gap: number | null;
};

export type Conditions = {
  stockTrend: Trend;
  bondTrend: Trend;
  goldTrend: Trend;
  relationship: Relationship;
  volatility: Volatility;
};

export const CALM_CONDITIONS: Conditions = {
  stockTrend: "resting",
  bondTrend: "resting",
  goldTrend: "resting",
  relationship: "familiar",
  volatility: "calm",
};

export type SignalFrame = Conditions & {
  spy: SeriesSnapshot;
  tlt: SeriesSnapshot;
  gld: SeriesSnapshot;
  vix: SeriesSnapshot;
  rhoShort: number | null;
  rhoLong: number | null;
  session: "open" | "closed" | "scenario";
};

export type RollingOverride = {
  rolling: number | null;
  upperBand?: number | null;
  middleBand?: number | null;
};
