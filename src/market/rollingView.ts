import { bollingerAt, emaAt, smaAt } from "./math";
import type { Bar, SeriesSettings, SignalSettings, SymbolId } from "./types";

export type RollingPoint = Record<SymbolId, number | null>;

function valueAt(values: number[], index: number, settings: SeriesSettings): number | null {
  if (settings.reference === "session") return index > 0 ? values[index - 1] : null;
  if (settings.reference === "bbands") return bollingerAt(values, index, settings.window)?.upper ?? null;
  if (settings.reference === "ema") return emaAt(values, index, settings.window);
  return smaAt(values, index, settings.window);
}

export function localRolling(bars: Bar[], settings: SignalSettings): RollingPoint[] {
  const columns: Record<SymbolId, number[]> = {
    spy: bars.map((bar) => bar.spy),
    tlt: bars.map((bar) => bar.tlt),
    gld: bars.map((bar) => bar.gld),
    vix: bars.map((bar) => bar.vix),
  };
  return bars.map((_, index) => ({
    spy: valueAt(columns.spy, index, settings.spy),
    tlt: valueAt(columns.tlt, index, settings.tlt),
    gld: valueAt(columns.gld, index, settings.gld),
    vix: valueAt(columns.vix, index, settings.vix),
  }));
}

export function referenceLabel(settings: SeriesSettings): string {
  if (settings.reference === "session") return "previous close";
  if (settings.reference === "bbands") return `${settings.window}-day upper band`;
  if (settings.reference === "ema") return `${settings.window}-day EMA`;
  return `${settings.window}-day average`;
}
