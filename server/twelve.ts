const BASE = "https://api.twelvedata.com";

const SYMBOLS = {
  spy: "SPY",
  tlt: "TLT",
  gld: "GLD",
  vix: "VIX",
} as const;

export type SymbolKey = keyof typeof SYMBOLS;

export type SnapshotQuery = Record<SymbolKey, string>;

export type Point = { date: string; value: number };

export type SymbolSnapshot = {
  closes: Point[];
  rolling: Point[];
  upperBand: Point[];
  middleBand: Point[];
  last: number;
  previousClose: number;
  reference: string;
  window: number;
};

export type MarketSnapshot = {
  fetchedAt: string;
  provisionalLast: boolean;
  warning?: string;
  symbols: Record<SymbolKey, SymbolSnapshot>;
};

type CacheEntry = { at: number; body: unknown };

const cache = new Map<string, CacheEntry>();
const recentCalls: number[] = [];
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function parseSpec(spec: string): { reference: string; window: number } {
  const [reference = "sma", windowRaw = "30"] = spec.split(":");
  const window = Number(windowRaw);
  return { reference, window: Number.isFinite(window) ? window : 30 };
}

async function vendor(path: string, key: string, ttlMs = 6 * 60 * 60 * 1000): Promise<unknown> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < ttlMs) return cached.body;

  return enqueue(async () => {
    const fresh = cache.get(path);
    if (fresh && Date.now() - fresh.at < ttlMs) return fresh.body;
    const now = Date.now();
    while (recentCalls.length > 0 && now - recentCalls[0] >= 60_000) recentCalls.shift();
    if (recentCalls.length >= 8) {
      const wait = 60_000 - (now - recentCalls[0]) + 40;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    recentCalls.push(Date.now());
    return request(path, key);
  });
}

async function request(path: string, key: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${key}`);
  if (!response.ok) throw new Error(`Twelve Data returned ${response.status}`);
  const body = (await response.json()) as { code?: number; message?: string; status?: string };
  if (body.code || body.status === "error") {
    throw new Error(body.message ?? "Twelve Data rejected the request");
  }
  cache.set(path, { at: Date.now(), body });
  return body;
}

function asPoints(values: unknown, field: string): Point[] {
  if (!Array.isArray(values)) return [];
  const points: Point[] = [];
  for (const row of values) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, string>;
    const raw = record[field];
    const value = Number(raw);
    if (!record.datetime || !Number.isFinite(value)) continue;
    points.push({ date: record.datetime.slice(0, 10), value });
  }
  return points.reverse();
}

async function loadSymbol(key: string, symbol: string, spec: string): Promise<SymbolSnapshot> {
  const { reference, window } = parseSpec(spec);
  const seriesPath = `/time_series?symbol=${symbol}&interval=1day&outputsize=220`;
  const series = (await vendor(seriesPath, key)) as { values?: unknown };
  const closes = asPoints(series.values, "close");
  if (closes.length < 2) throw new Error(`No daily closes for ${symbol}`);

  let rolling: Point[] = [];
  let upperBand: Point[] = [];
  let middleBand: Point[] = [];

  if (reference === "sma" || reference === "ema") {
    const path = `/${reference}?symbol=${symbol}&interval=1day&time_period=${window}&outputsize=220`;
    const payload = (await vendor(path, key)) as { values?: unknown };
    rolling = asPoints(payload.values, reference);
  } else if (reference === "bbands") {
    const path = `/bbands?symbol=${symbol}&interval=1day&time_period=${window}&sd=2&outputsize=220`;
    const payload = (await vendor(path, key)) as { values?: unknown };
    upperBand = asPoints(payload.values, "upper_band");
    middleBand = asPoints(payload.values, "middle_band");
    rolling = middleBand;
  }

  const last = closes[closes.length - 1].value;
  const previousClose = closes[closes.length - 2].value;
  return { closes, rolling, upperBand, middleBand, last, previousClose, reference, window };
}

export async function fetchSnapshot(key: string, query: SnapshotQuery): Promise<MarketSnapshot> {
  const entries = await Promise.all(
    (Object.keys(SYMBOLS) as SymbolKey[]).map(async (id) => {
      try {
        return [id, await loadSymbol(key, SYMBOLS[id], query[id])] as const;
      } catch (error) {
        if (id !== "vix") throw error;
        const message = error instanceof Error ? error.message : "VIX request failed";
        return [id, { failed: message } as const] as const;
      }
    }),
  );

  let warning: string | undefined;
  const symbols = {} as Record<SymbolKey, SymbolSnapshot>;
  for (const entry of entries) {
    const [id, value] = entry;
    if ("failed" in value) {
      warning = `${value.failed} Volatility is using the range of SPY until the VIX symbol is confirmed.`;
      const spy = symbols.spy;
      if (!spy) throw new Error(value.failed);
      const range = spy.closes.map((point, index) => {
        const start = Math.max(0, index - 19);
        let high = point.value;
        let low = point.value;
        for (let i = start; i <= index; i += 1) {
          high = Math.max(high, spy.closes[i].value);
          low = Math.min(low, spy.closes[i].value);
        }
        const middle = (high + low) / 2 || 1;
        return { date: point.date, value: (high - low) / middle };
      });
      symbols.vix = {
        closes: range,
        rolling: [],
        upperBand: [],
        middleBand: [],
        last: range[range.length - 1]?.value ?? 0,
        previousClose: range[range.length - 2]?.value ?? 0,
        reference: "session",
        window: 20,
      };
    } else {
      symbols[id] = value;
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    provisionalLast: true,
    warning,
    symbols,
  };
}

export async function fetchQuotes(key: string): Promise<Partial<Record<SymbolKey, { last: number; previousClose: number }>>> {
  const out: Partial<Record<SymbolKey, { last: number; previousClose: number }>> = {};
  for (const id of Object.keys(SYMBOLS) as SymbolKey[]) {
    const payload = (await vendor(`/quote?symbol=${SYMBOLS[id]}`, key, 4 * 60 * 1000)) as {
      close?: string;
      previous_close?: string;
    };
    const last = Number(payload.close);
    const previousClose = Number(payload.previous_close);
    if (Number.isFinite(last)) out[id] = { last, previousClose: Number.isFinite(previousClose) ? previousClose : last };
  }
  return out;
}
