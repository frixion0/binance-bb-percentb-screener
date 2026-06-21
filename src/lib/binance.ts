// Server-side Binance Futures USDⓈ-M API client.
// All network calls happen here (Node runtime) so the browser never hits
// Binance directly — eliminating CORS / extension requirements entirely.

import {
  calculateBB,
} from "./bb";

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

export interface CrossoverOptions {
  bbPeriod: number;
  bbStddev: number;
  target: number;
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

async function fetchCloses(
  symbol: string,
  interval: string,
  limit: number
): Promise<number[] | null> {
  const res = await fetch(
    `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { cache: "no-store", headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const klines = (await res.json()) as unknown;
  if (!Array.isArray(klines) || klines.length < limit) return null;
  const closes = (klines as unknown[][]).map((k) =>
    parseFloat(String(k[4]))
  );
  if (closes.some((c) => Number.isNaN(c))) return null;
  return closes;
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
