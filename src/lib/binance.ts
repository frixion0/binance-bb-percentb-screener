// Server-side Binance Futures USDⓈ-M API client.
// All network calls happen here (Node runtime) so the browser never hits
// Binance directly — eliminating CORS / extension requirements entirely.
//
// Vercel compatibility:
// - Tries multiple Binance API endpoints (fapi.binance.com may return HTTP 451
//   from Vercel's geo-restricted IPs; fapi1–4 + .me are alternatives).
// - Per-request timeout prevents hanging on unresponsive endpoints.
// - Sequential endpoint fallback: tries each endpoint until one works.

import { calculateBB } from "./bb";

// Multiple Binance Futures API endpoints to try.
// fapi.binance.com returns 451 from many Vercel regions; the numbered
// endpoints (fapi1–4) are regional load balancers; .me is an alternative domain.
const BASE_URLS = [
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
  "https://fapi4.binance.com",
  "https://fapi.binance.com",
  "https://fapi.binance.me",
];

// Per-request timeout (ms). Must be well under Vercel's function timeout.
const FETCH_TIMEOUT = 10_000;
const PING_TIMEOUT = 5_000;

// In-memory cache for the working base URL (survives within a single
// serverless invocation; will be re-resolved on each cold start).
let resolvedBase: string | null = null;

/**
 * Find a reachable Binance Futures API endpoint by pinging /fapi/v1/ping.
 * Tries endpoints sequentially and caches the first working one.
 * This is more reliable than Promise.race which could pick a null result.
 */
async function getBaseUrl(): Promise<string> {
  if (resolvedBase) return resolvedBase;

  for (const url of BASE_URLS) {
    try {
      const res = await fetch(`${url}/fapi/v1/ping`, {
        cache: "no-store",
        signal: AbortSignal.timeout(PING_TIMEOUT),
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        resolvedBase = url;
        return url;
      }
    } catch {
      // try next endpoint
    }
  }

  // If ALL endpoints fail to ping, default to first and let the
  // actual request surface a meaningful error.
  resolvedBase = BASE_URLS[0];
  return resolvedBase;
}

/**
 * Fetch with timeout. If the current endpoint returns 451 or a server error,
 * invalidate the cached base and try the NEXT endpoint automatically.
 */
async function binanceFetch(path: string): Promise<Response> {
  // Try each endpoint until one works
  for (let attempt = 0; attempt < BASE_URLS.length; attempt++) {
    const base = await getBaseUrl();
    try {
      const res = await fetch(`${base}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      // If we get 451 or 5xx, this endpoint is blocked/down — try next
      if (res.status === 451 || res.status >= 500) {
        resolvedBase = null; // force re-detection
        // Move to the next endpoint in the list
        const currentIdx = BASE_URLS.indexOf(base);
        if (currentIdx < BASE_URLS.length - 1) {
          resolvedBase = BASE_URLS[currentIdx + 1];
        }
        continue;
      }

      return res;
    } catch {
      // Network error — try next endpoint
      resolvedBase = null;
      const currentIdx = BASE_URLS.indexOf(base);
      if (currentIdx < BASE_URLS.length - 1) {
        resolvedBase = BASE_URLS[currentIdx + 1];
      }
    }
  }

  // All endpoints exhausted — reset for next attempt and throw
  resolvedBase = null;
  throw new Error(
    `All ${BASE_URLS.length} Binance API endpoints are unreachable from this server. ` +
    `This typically means the server region is geo-restricted. ` +
    `Visit /api/debug for detailed connectivity diagnostics.`
  );
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

  const res = await binanceFetch("/fapi/v1/exchangeInfo");
  if (!res.ok) {
    resolvedBase = null;
    throw new Error(
      `Binance exchangeInfo returned HTTP ${res.status}. ` +
      `Visit /api/debug for connectivity diagnostics.`
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
