// Server-side Binance Futures USDⓈ-M API client.
// All network calls happen here (Node runtime) so the browser never hits
// Binance directly — eliminating CORS / extension requirements entirely.

import {
  calculateBB,
  computePctBSeries,
  detectStraightRun,
} from "./bb";
import {
  computeWaveTrend,
  findLatestSignals,
  RSI_PERIOD,
  WT_N1,
  WT_N2,
} from "./wavetrend";

const BASE_URL = "https://fapi.binance.com";

// Short in-memory cache for exchangeInfo (it's large and rarely changes).
let symbolsCache: { symbols: string[]; ts: number } | null = null;
const SYMBOLS_TTL = 60_000;

export type SignalType = "current" | "delayed";

export interface CrossoverMatch {
  symbol: string;
  currentPrice: number;
  twoAgoBB: number;
  prevBB: number;
  currentBB: number;
  signalType: SignalType;
}

export interface FlatMatch {
  symbol: string;
  currentPrice: number;
  runLength: number;
  avgBB: number;
  slope: number;
  maxDeviation: number;
  endOffset: number;
  /** Recent %B series for sparkline rendering. */
  recentBBs: number[];
  /** Whether a bullish engulfing pattern was found in the recent window. */
  bullishEngulfing: boolean;
  /** Candles ago the engulfing's bullish candle occurred (0 = current). null if none. */
  beOffset: number | null;
}

export interface CrossoverOptions {
  bbPeriod: number;
  bbStddev: number;
  target: number;
}

export interface FlatOptions {
  bbPeriod: number;
  bbStddev: number;
  tolerance: number;
  maxSlope: number;
  minRunLength: number;
  lookback: number;
  /** When true, only return matches that also show a bullish engulfing. */
  requireBullishEngulfing: boolean;
  /** How many recent candle-pairs to scan for the engulfing pattern. */
  beWindow: number;
}

export type WaveTrendSignalType = "positive" | "negative";

export interface WaveTrendMatch {
  symbol: string;
  currentPrice: number;
  /** Latest wt1 value. */
  wt1: number;
  /** Latest wt2 value. */
  wt2: number;
  /** Latest wt1 - wt2 ("YellowWave"). */
  yellowWave: number;
  /** Latest RSI(14). */
  rsi14: number;
  /** Which signal fired: "positive" (green) or "negative" (red). */
  signalType: WaveTrendSignalType;
  /** Candles ago the signal fired (0 = current candle). */
  signalOffset: number;
}

export interface WaveTrendOptions {
  /** Which signal types to include. */
  signals: "positive" | "negative" | "both";
  /** How many recent candles to scan for a signal. */
  lookback: number;
}

/** Fetch every actively trading USDT/USDC perpetual symbol (cached 60s). */
export async function fetchTradingSymbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.ts < SYMBOLS_TTL) {
    return symbolsCache.symbols;
  }
  const res = await fetch(`${BASE_URL}/fapi/v1/exchangeInfo`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Binance exchangeInfo returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    symbols: Array<{
      symbol: string;
      status: string;
      quoteAsset: string;
    }>;
  };
  const symbols = data.symbols
    .filter(
      (s) =>
        s.status === "TRADING" &&
        (s.quoteAsset === "USDT" || s.quoteAsset === "USDC")
    )
    .map((s) => s.symbol)
    .sort();
  symbolsCache = { symbols, ts: Date.now() };
  return symbols;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number
): Promise<Kline[] | null> {
  const res = await fetch(
    `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { cache: "no-store", headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const klines = (await res.json()) as unknown;
  if (!Array.isArray(klines) || klines.length < limit) return null;
  const out = (klines as unknown[][]).map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
  }));
  if (out.some((k) => Number.isNaN(k.open) || Number.isNaN(k.close))) return null;
  return out;
}

async function fetchCloses(
  symbol: string,
  interval: string,
  limit: number
): Promise<number[] | null> {
  const klines = await fetchKlines(symbol, interval, limit);
  if (!klines) return null;
  return klines.map((k) => k.close);
}

/**
 * Scan the most recent `window` candle-pairs for a bullish engulfing pattern:
 * the prior candle is bearish (open > close) and the current candle is bullish
 * (close > open) with its real body fully engulfing the prior body.
 * Returns the offset (candles ago) of the bullish candle, or null if none.
 */
export function detectBullishEngulfing(
  klines: Kline[],
  window: number
): { found: boolean; offset: number | null } {
  const n = klines.length;
  const lastIdx = n - 1;
  const minIdx = Math.max(1, n - window);
  for (let i = lastIdx; i >= minIdx; i--) {
    const prev = klines[i - 1];
    const curr = klines[i];
    const prevBearish = prev.open > prev.close;
    const currBullish = curr.close > curr.open;
    if (!prevBearish || !currBullish) continue;
    // Current bullish body fully engulfs the prior bearish body.
    if (curr.open <= prev.close && curr.close >= prev.open) {
      return { found: true, offset: lastIdx - i };
    }
  }
  return { found: false, offset: null };
}

/**
 * Decide whether a symbol qualifies as a BB %B crossover signal (current
 * candle or up to 2 candles ago) crossing above `target`.
 */
export async function scanSymbolCrossover(
  symbol: string,
  interval: string,
  opts: CrossoverOptions
): Promise<CrossoverMatch | null> {
  try {
    const limit = opts.bbPeriod + 8;
    const closes = await fetchCloses(symbol, interval, limit);
    if (!closes) return null;

    const len = closes.length;
    const { bbPeriod: P, bbStddev: S, target: T } = opts;

    const currentBB = calculateBB(
      closes.slice(len - P),
      closes[len - 1],
      P,
      S
    ).pctB;
    const prevBB = calculateBB(
      closes.slice(len - P - 1, len - 1),
      closes[len - 2],
      P,
      S
    ).pctB;
    const twoAgoBB = calculateBB(
      closes.slice(len - P - 2, len - 2),
      closes[len - 3],
      P,
      S
    ).pctB;

    if (prevBB <= T && currentBB > T) {
      return {
        symbol,
        currentPrice: closes[len - 1],
        twoAgoBB,
        prevBB,
        currentBB,
        signalType: "current",
      };
    }
    if (twoAgoBB <= T && prevBB > T && currentBB > T) {
      return {
        symbol,
        currentPrice: closes[len - 1],
        twoAgoBB,
        prevBB,
        currentBB,
        signalType: "delayed",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a symbol currently has a "nearly straight line" of %B values
 * (≥ minRunLength candles) anywhere in the recent lookback window.
 */
export async function scanSymbolFlat(
  symbol: string,
  interval: string,
  opts: FlatOptions
): Promise<FlatMatch | null> {
  try {
    const limit = opts.bbPeriod + opts.lookback + 2;
    const klines = await fetchKlines(symbol, interval, limit);
    if (!klines) return null;
    const closes = klines.map((k) => k.close);

    const pctBs = computePctBSeries(closes, opts.bbPeriod, opts.bbStddev);
    const run = detectStraightRun(pctBs, opts);
    if (!run) return null;

    // Check for a bullish engulfing pattern in the most recent candles.
    const be = detectBullishEngulfing(klines, opts.beWindow);
    if (opts.requireBullishEngulfing && !be.found) return null;

    return {
      symbol,
      currentPrice: closes[closes.length - 1],
      runLength: run.runLength,
      avgBB: run.avgBB,
      slope: run.slope,
      maxDeviation: run.maxDeviation,
      endOffset: run.endOffset,
      recentBBs: pctBs.slice(-Math.min(opts.lookback, pctBs.length)),
      bullishEngulfing: be.found,
      beOffset: be.offset,
    };
  } catch {
    return null;
  }
}

/**
 * Scan a symbol for Wave Trend "Positive/Negative Pressure" signals (the
 * circle plots in the Pine Script). Fetches enough klines for RSI(14) +
 * WaveTrend(9,12) to stabilize, computes the indicator, and looks for the most
 * recent signal within `lookback` candles.
 */
export async function scanSymbolWaveTrend(
  symbol: string,
  interval: string,
  opts: WaveTrendOptions
): Promise<WaveTrendMatch | null> {
  try {
    // Need enough candles for RSI(14) + EMA seeding + lookback window.
    const limit = Math.max(80, RSI_PERIOD + WT_N1 + WT_N2 + opts.lookback + 10);
    const klines = await fetchKlines(symbol, interval, limit);
    if (!klines) return null;

    const highs = klines.map((k) => k.high);
    const lows = klines.map((k) => k.low);
    const closes = klines.map((k) => k.close);

    const series = computeWaveTrend(highs, lows, closes);
    const { positive, negative } = findLatestSignals(series, opts.lookback);

    const wantPos = opts.signals === "positive" || opts.signals === "both";
    const wantNeg = opts.signals === "negative" || opts.signals === "both";

    // Pick the most recent qualifying signal (positive wins ties since they're
    // the bullish/buy-side signal).
    let signalType: WaveTrendSignalType | null = null;
    let signalOffset = Infinity;
    if (wantPos && positive.found && (positive.offset ?? Infinity) < signalOffset) {
      signalType = "positive";
      signalOffset = positive.offset!;
    }
    if (wantNeg && negative.found && (negative.offset ?? Infinity) < signalOffset) {
      // For "both" mode, if negative is more recent than positive, prefer it.
      if (negative.offset! < signalOffset) {
        signalType = "negative";
        signalOffset = negative.offset!;
      }
    }

    if (signalType === null) return null;

    const i = closes.length - 1;
    return {
      symbol,
      currentPrice: closes[i],
      wt1: series.wt1[i],
      wt2: series.wt2[i],
      yellowWave: series.yellowWave[i],
      rsi14: series.rsi14[i],
      signalType,
      signalOffset,
    };
  } catch {
    return null;
  }
}
