import type { MarketSnapshot, SymbolKey } from "../../server/twelve";
import type { Bar, RollingOverride, SeriesSettings, SignalSettings, SymbolId } from "./types";

const IDS: SymbolId[] = ["spy", "tlt", "gld", "vix"];

export function snapshotQuery(settings: SignalSettings): string {
  const piece = (id: SymbolId, series: SeriesSettings) => `${id}=${series.reference}:${series.window}`;
  return [piece("spy", settings.spy), piece("tlt", settings.tlt), piece("gld", settings.gld), piece("vix", settings.vix)].join("&");
}

export async function fetchSnapshot(settings: SignalSettings): Promise<MarketSnapshot> {
  const response = await fetch(`/api/snapshot?${snapshotQuery(settings)}`);
  const body = (await response.json()) as MarketSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Live market data is unavailable");
  return body;
}

export async function fetchLiveQuotes(): Promise<Partial<Record<SymbolKey, { last: number; previousClose: number }>>> {
  const response = await fetch("/api/quotes");
  const body = (await response.json()) as {
    error?: string;
    quotes?: Partial<Record<SymbolKey, { last: number; previousClose: number }>>;
  };
  if (!response.ok) throw new Error(body.error ?? "Quote request failed");
  return body.quotes ?? {};
}

export function barsFromSnapshot(snapshot: MarketSnapshot): Bar[] {
  const dates = snapshot.symbols.spy.closes.map((point) => point.date);
  const maps = Object.fromEntries(IDS.map((id) => [id, new Map(snapshot.symbols[id].closes.map((point) => [point.date, point.value]))])) as Record<
    SymbolId,
    Map<string, number>
  >;
  const last: Record<SymbolId, number> = { spy: 0, tlt: 0, gld: 0, vix: 0 };
  return dates.map((date) => {
    for (const id of IDS) {
      const value = maps[id].get(date);
      if (value != null) last[id] = value;
    }
    return { date, spy: last.spy, tlt: last.tlt, gld: last.gld, vix: last.vix };
  });
}

export function applyQuotes(bars: Bar[], quotes: Partial<Record<SymbolKey, { last: number; previousClose: number }>>): Bar[] {
  if (bars.length === 0) return bars;
  const next = bars.slice();
  const last = { ...next[next.length - 1] };
  for (const id of IDS) {
    const quote = quotes[id];
    if (quote) last[id] = quote.last;
  }
  next[next.length - 1] = last;
  return next;
}

export function overridesFor(
  snapshot: MarketSnapshot,
  settings: SignalSettings,
  quotes: Partial<Record<SymbolKey, { last: number; previousClose: number }>>,
): Partial<Record<SymbolId, RollingOverride>> {
  const overrides: Partial<Record<SymbolId, RollingOverride>> = {};
  for (const id of IDS) {
    const symbol = snapshot.symbols[id];
    const quote = quotes[id];
    if (settings[id].reference === "session") {
      overrides[id] = { rolling: quote?.previousClose ?? symbol.previousClose };
      continue;
    }
    if (settings[id].reference === "bbands") {
      const upper = symbol.upperBand.at(-1)?.value ?? null;
      const middle = symbol.middleBand.at(-1)?.value ?? null;
      overrides[id] = { rolling: middle, upperBand: upper, middleBand: middle };
      continue;
    }
    const rolling = symbol.rolling.at(-1)?.value;
    if (rolling != null) overrides[id] = { rolling };
  }
  return overrides;
}

export function vendorRolling(snapshot: MarketSnapshot, bars: Bar[]): Record<SymbolId, (number | null)[]> {
  const aligned = { spy: [], tlt: [], gld: [], vix: [] } as Record<SymbolId, (number | null)[]>;
  for (const id of IDS) {
    const byDate = new Map(snapshot.symbols[id].rolling.map((point) => [point.date, point.value]));
    if (snapshot.symbols[id].reference === "bbands") {
      for (const point of snapshot.symbols[id].upperBand) byDate.set(point.date, point.value);
    }
    aligned[id] = bars.map((bar) => byDate.get(bar.date) ?? null);
  }
  return aligned;
}
