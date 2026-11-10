import { bollingerAt, column, emaAt, gap, pearson, returnsThrough, smaAt } from "./math";
import type {
  Bar,
  Conditions,
  ReferenceKind,
  Relationship,
  RollingOverride,
  SeriesSettings,
  SeriesSnapshot,
  SignalFrame,
  SignalSettings,
  SymbolId,
  Trend,
  Volatility,
} from "./types";

export type Bands = { enter: number; exit: number };

export function bandsFor(id: SymbolId, reference: ReferenceKind): Bands {
  if (id === "vix") {
    if (reference === "session") return { enter: 0.1, exit: 0.03 };
    return { enter: 0.15, exit: 0.05 };
  }
  if (reference === "session") return { enter: 0.0035, exit: 0.0015 };
  return { enter: 0.01, exit: 0.0025 };
}

export function schmittTrend(value: number | null, previous: Trend, bands: Bands): Trend {
  if (value == null) return previous;
  if (previous === "rising") return value < bands.exit ? "resting" : "rising";
  if (previous === "falling") return value > -bands.exit ? "resting" : "falling";
  if (value >= bands.enter) return "rising";
  if (value <= -bands.enter) return "falling";
  return "resting";
}

export function schmittVolatility(
  last: number,
  gapValue: number | null,
  upper: number | null,
  middle: number | null,
  reference: ReferenceKind,
  previous: Volatility,
): Volatility {
  if (reference === "bbands") {
    if (upper == null || middle == null) return previous;
    if (previous === "elevated") return last < middle ? "calm" : "elevated";
    return last > upper ? "elevated" : "calm";
  }
  if (gapValue == null) return previous;
  const bands = bandsFor("vix", reference);
  if (previous === "elevated") return gapValue < bands.exit ? "calm" : "elevated";
  return gapValue >= bands.enter ? "elevated" : "calm";
}

export function relationshipFrom(
  rhoShort: number | null,
  rhoLong: number | null,
  spyReturn: number | null,
  tltReturn: number | null,
  mode: SignalSettings["relationship"]["mode"],
): Relationship {
  if (mode === "session-long") {
    if (spyReturn == null || tltReturn == null || rhoLong == null) return "familiar";
    if (Math.abs(spyReturn) < 0.0015 || Math.abs(tltReturn) < 0.0015) return "familiar";
    if (Math.abs(rhoLong) < 0.2) return "familiar";
    const together = Math.sign(spyReturn) === Math.sign(tltReturn) ? 1 : -1;
    return together !== Math.sign(rhoLong) ? "shifted" : "familiar";
  }
  if (rhoShort == null || rhoLong == null) return "familiar";
  const opposite = Math.sign(rhoShort) !== Math.sign(rhoLong) && rhoShort !== 0 && rhoLong !== 0;
  const bothAway = Math.abs(rhoShort) >= 0.2 && Math.abs(rhoLong) >= 0.2;
  return opposite && bothAway ? "shifted" : "familiar";
}

function snapshot(
  values: number[],
  index: number,
  settings: SeriesSettings,
  override?: RollingOverride,
): SeriesSnapshot {
  const last = values[index];
  const previous = index > 0 ? values[index - 1] : last;
  if (settings.reference === "bbands") {
    const bands = bollingerAt(values, index, settings.window);
    const upper = override?.upperBand ?? bands?.upper ?? null;
    const middle = override?.middleBand ?? bands?.middle ?? null;
    return {
      last,
      previous,
      rolling: middle,
      upperBand: upper,
      middleBand: middle,
      gap: gap(last, middle),
    };
  }
  if (settings.reference === "session") {
    return {
      last,
      previous,
      rolling: previous,
      upperBand: null,
      middleBand: null,
      gap: gap(last, previous),
    };
  }
  const computed =
    settings.reference === "ema"
      ? emaAt(values, index, settings.window)
      : smaAt(values, index, settings.window);
  const rolling = override?.rolling ?? computed;
  return {
    last,
    previous,
    rolling,
    upperBand: null,
    middleBand: null,
    gap: gap(last, rolling),
  };
}

export function analyzeAt(
  bars: Bar[],
  index: number,
  settings: SignalSettings,
  previous: Conditions,
  overrides?: Partial<Record<SymbolId, RollingOverride>>,
  session: SignalFrame["session"] = "scenario",
): SignalFrame {
  const spy = column(bars, "spy");
  const tlt = column(bars, "tlt");
  const gld = column(bars, "gld");
  const vix = column(bars, "vix");
  const spySnap = snapshot(spy, index, settings.spy, overrides?.spy);
  const tltSnap = snapshot(tlt, index, settings.tlt, overrides?.tlt);
  const gldSnap = snapshot(gld, index, settings.gld, overrides?.gld);
  const vixSnap = snapshot(vix, index, settings.vix, overrides?.vix);

  const shortReturnsSpy = returnsThrough(spy, index, settings.relationship.shortWindow);
  const shortReturnsTlt = returnsThrough(tlt, index, settings.relationship.shortWindow);
  const longReturnsSpy = returnsThrough(spy, index, settings.relationship.longWindow);
  const longReturnsTlt = returnsThrough(tlt, index, settings.relationship.longWindow);
  const rhoShort =
    shortReturnsSpy && shortReturnsTlt ? pearson(shortReturnsSpy, shortReturnsTlt) : null;
  const rhoLong = longReturnsSpy && longReturnsTlt ? pearson(longReturnsSpy, longReturnsTlt) : null;
  const spyReturn = index > 0 ? spy[index] / spy[index - 1] - 1 : null;
  const tltReturn = index > 0 ? tlt[index] / tlt[index - 1] - 1 : null;

  const stockTrend = schmittTrend(spySnap.gap, previous.stockTrend, bandsFor("spy", settings.spy.reference));
  const bondTrend = schmittTrend(tltSnap.gap, previous.bondTrend, bandsFor("tlt", settings.tlt.reference));
  const goldTrend = schmittTrend(gldSnap.gap, previous.goldTrend, bandsFor("gld", settings.gld.reference));
  const volatility = schmittVolatility(
    vixSnap.last,
    vixSnap.gap,
    vixSnap.upperBand,
    vixSnap.middleBand,
    settings.vix.reference,
    previous.volatility,
  );
  const relationship = relationshipFrom(rhoShort, rhoLong, spyReturn, tltReturn, settings.relationship.mode);

  return {
    stockTrend,
    bondTrend,
    goldTrend,
    relationship,
    volatility,
    spy: spySnap,
    tlt: tltSnap,
    gld: gldSnap,
    vix: vixSnap,
    rhoShort,
    rhoLong,
    session,
  };
}
