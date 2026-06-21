// Wave Trend indicator — TypeScript port of the provided Pine Script v4 study.
//
// Pine Script reference:
//   ap  = hlc3
//   n1  = 9,  n2 = 12
//   esa = ema(ap, n1)
//   de  = ema(abs(ap - esa), n1)
//   ci  = (ap - esa) / (0.015 * de)
//   tci = ema(ci, n2)
//   wt1 = tci
//   wt2 = sma(wt1, 3)
//   YellowWave = wt1 - wt2
//   obLevel2 = 60, osLevel2 = -60
//   RSI14 = rsi(close, 14)
//
// Signals (the "circles" plotted at 138.5):
//   Positive Pressure (green) = (RSI14 < 30 OR prev RSI14 < 30) AND wt1 < -60 AND YellowWave > prev YellowWave
//   Negative Pressure (red)   = (RSI14 > 70 OR prev RSI14 > 70) AND wt1 >  60 AND NOT(YellowWave > prev YellowWave)

/**
 * Exponential Moving Average over a full series. Returns an array the same
 * length as the input; the first value is seeded with the input value.
 * Mirrors Pine Script `ema()`.
 */
export function ema(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  const k = 2 / (period + 1);
  out[0] = values[0];
  for (let i = 1; i < n; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/**
 * Simple Moving Average over a full series. Pine Script `sma()` returns `na`
 * until enough data; here we still emit a value from the start using the
 * available window (length = min(i+1, period)) which is fine for our scan
 * because we always feed plenty of historical candles.
 */
export function sma(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    const len = Math.min(i + 1, period);
    out[i] = sum / len;
  }
  return out;
}

/**
 * RSI (Wilder's smoothing) over a full close series. Matches Pine `rsi()`.
 * Returns an array the same length as `closes`; early values are seeded with
 * the simple mean of gains/losses for the first `period` candles.
 */
export function rsi(closes: number[], period: number): number[] {
  const n = closes.length;
  if (n === 0) return [];
  const out = new Array<number>(n).fill(NaN);
  if (n <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export const WT_N1 = 9;
export const WT_N2 = 12;
export const RSI_PERIOD = 14;
export const OB_LEVEL = 60;
export const OS_LEVEL = -60;
export const RSI_OB = 70;
export const RSI_OS = 30;

export interface WaveTrendResult {
  wt1: number;
  wt2: number;
  /** wt1 - wt2 (the "YellowWave"). */
  yellowWave: number;
  rsi14: number;
  /** Positive Pressure signal (green circle) — fires on the current candle. */
  positivePressure: boolean;
  /** Negative Pressure signal (red circle) — fires on the current candle. */
  negativePressure: boolean;
}

/**
 * Compute the Wave Trend series and detect the most recent signal candles.
 * Returns the per-candle series plus `signalsAt` for each of the last
 * `signalLookback` candles (true/false for each signal type).
 */
export interface WaveTrendSeries {
  wt1: number[];
  wt2: number[];
  yellowWave: number[];
  rsi14: number[];
  /** Per-candle positive pressure flag (aligned to the input length). */
  positivePressure: boolean[];
  /** Per-candle negative pressure flag (aligned to the input length). */
  negativePressure: boolean[];
}

/**
 * Full Wave Trend computation over HLC + close arrays. `highs`, `lows`,
 * `closes` must be equal length. Returns the indicator series and the
 * per-candle signal flags.
 */
export function computeWaveTrend(
  highs: number[],
  lows: number[],
  closes: number[]
): WaveTrendSeries {
  const n = closes.length;
  const ap = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    ap[i] = (highs[i] + lows[i] + closes[i]) / 3;
  }

  const esa = ema(ap, WT_N1);
  const de = ema(ap.map((v, i) => Math.abs(v - esa[i])), WT_N1);
  const ci = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    ci[i] = de[i] === 0 ? 0 : (ap[i] - esa[i]) / (0.015 * de[i]);
  }
  const tci = ema(ci, WT_N2);
  const wt1 = tci;
  const wt2 = sma(wt1, 3);
  const yellowWave = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    yellowWave[i] = wt1[i] - wt2[i];
  }
  const rsi14 = rsi(closes, RSI_PERIOD);

  const positivePressure = new Array<boolean>(n).fill(false);
  const negativePressure = new Array<boolean>(n).fill(false);

  for (let i = 1; i < n; i++) {
    if (Number.isNaN(rsi14[i]) || Number.isNaN(rsi14[i - 1])) continue;
    const wtVOS = wt1[i] < OS_LEVEL;
    const wtVOB = wt1[i] > OB_LEVEL;
    const yellowUp = yellowWave[i] > yellowWave[i - 1];
    const rsiOSNow = rsi14[i] < RSI_OS;
    const rsiOSPrev = rsi14[i - 1] < RSI_OS;
    const rsiOBNow = rsi14[i] > RSI_OB;
    const rsiOBPrev = rsi14[i - 1] > RSI_OB;

    // Positive Pressure: RSI oversold (now or prev) AND WT oversold AND yellow pointing up.
    if ((rsiOSNow || rsiOSPrev) && wtVOS && yellowUp) {
      positivePressure[i] = true;
    }
    // Negative Pressure: RSI overbought (now or prev) AND WT overbought AND yellow NOT pointing up.
    if ((rsiOBNow || rsiOBPrev) && wtVOB && !yellowUp) {
      negativePressure[i] = true;
    }
  }

  return { wt1, wt2, yellowWave, rsi14, positivePressure, negativePressure };
}

/**
 * Inspect the last `lookback` candles of a computed series and return the most
 * recent signal occurrence (if any) for each type. `offset` is candles ago
 * (0 = current candle).
 */
export interface WaveTrendSignalOccurrence {
  found: boolean;
  offset: number | null;
}

export function findLatestSignals(
  series: WaveTrendSeries,
  lookback: number
): {
  positive: WaveTrendSignalOccurrence;
  negative: WaveTrendSignalOccurrence;
} {
  const n = series.positivePressure.length;
  const minIdx = Math.max(1, n - lookback);
  let posOffset: number | null = null;
  let negOffset: number | null = null;

  for (let i = n - 1; i >= minIdx; i--) {
    if (posOffset === null && series.positivePressure[i]) {
      posOffset = n - 1 - i;
    }
    if (negOffset === null && series.negativePressure[i]) {
      negOffset = n - 1 - i;
    }
    if (posOffset !== null && negOffset !== null) break;
  }

  return {
    positive: { found: posOffset !== null, offset: posOffset },
    negative: { found: negOffset !== null, offset: negOffset },
  };
}

/** Convenience: compute the latest result values (last candle) for display. */
export function latestWaveTrend(series: WaveTrendSeries): WaveTrendResult {
  const i = series.wt1.length - 1;
  return {
    wt1: series.wt1[i],
    wt2: series.wt2[i],
    yellowWave: series.yellowWave[i],
    rsi14: series.rsi14[i],
    positivePressure: series.positivePressure[i],
    negativePressure: series.negativePressure[i],
  };
}
