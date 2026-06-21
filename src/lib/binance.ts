// Server-side Binance Futures USDⓈ-M API client.
// All network calls happen here (Node runtime) so the browser never hits
// Binance directly — eliminating CORS / extension requirements entirely.
//
// Vercel compatibility:
// - Tries multiple Binance API endpoints (fapi.binance.com may return HTTP 451
//   from Vercel's geo-restricted IPs; fapi1–4 are regional alternatives).
// - Per-request timeout prevents hanging on unresponsive endpoints.
// - Retry logic with backoff for transient network failures.

import { calculateBB } from "./bb";

// Multiple Binance Futures API endpoints to try.
// fapi.binance.com returns 451 from many Vercel regions; the numbered
// endpoints (fapi1–4) are regional load balancers that are more permissive.
const BASE_URLS = [
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
  "https://fapi4.binance.com",
  "https://fapi.binance.com",
];

// Per-request timeout (ms). Must be well under Vercel's function timeout.
const FETCH_TIMEOUT = 10_000;

// In-memory cache for the working base URL (survives within a single
// serverless invocation; will be re-resolved on each cold start).
let resolvedBase: string | null = null;

/**
 * Find a reachable Binance Futures API endpoint by pinging /fapi/v1/ping.
 * Results are cached for the lifetime of the serverless invocation.
 */
async function getBaseUrl(): Promise<string> {
  if (resolvedBase) return resolvedBase;

  // Race all endpoints concurrently — first OK response wins.
  const controller = new AbortController();
  const winner = await Promise.race(
    BASE_URLS.map(async (url) => {
      try {
        const res = await fetch(`${url}/fapi/v1/ping`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (res.ok) return url;
      } catch {
        // unreachable — skip
      }
      // Return a sentinel that will never win a race against a real URL
      return null;
    })
  );

  if (winner) {
    resolvedBase = winner;
    return winner;
  }

  // If no endpoint responded to ping, try them sequentially for real requests.
  // Default to fapi1 which is the most widely accessible.
  resolvedBase = BASE_URLS[0];
  return resolvedBase;
}

/**
 * Fetch with timeout and automatic endpoint fallback.
 * If the current endpoint returns an error (e.g. 451, 503), it resets
 * the cached base URL so the next call will re-detect.
 */
async function binanceFetch(path: string): Promise<Response> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  // If we get a 451 or server error, invalidate the cached base so we
  // re-detect on the next request.
  if (res.status === 451 || res.status >= 500) {
    resolvedBase = null;
  }

  return res;
}

/**
 * Fetch with retry — up to `retries` attempts with exponential backoff.
 * On each retry, the base URL is re-resolved (since we invalidated it above).
 */
async function binanceFetchWithRetry(
  path: string,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await binanceFetch(path);
      // If we got a non-transient error, don't retry
      if (res.status === 451 || res.status >= 500) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("All retries exhausted");
}

// Short in-memory cache for exchangeInfo (survives within one invocation).
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

  const res = await binanceFetchWithRetry("/fapi/v1/exchangeInfo");
  if (!res.ok) {
    resolvedBase = null; // force re-detect on next attempt
    throw new Error(
      `Binance exchangeInfo returned HTTP ${res.status}. ` +
        `This usually means the Binance API is geo-restricted in the server region. ` +
        `All ${BASE_URLS.length} endpoint alternatives were tried.`
    );
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
  try {
    const res = await binanceFetch(
      `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) return null;
    const klines = (await res.json()) as unknown;
    if (!Array.isArray(klines) || klines.length < limit) return null;
    const closes = (klines as unknown[][]).map((k) =>
      parseFloat(String(k[4]))
    );
    if (closes.some((c) => Number.isNaN(c))) return null;
    return closes;
  } catch {
    return null;
  }
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
