// Shared SSE scan runner used by the crossover endpoint.
// Handles: interval validation, symbol fetching, chunked parallel scanning,
// progress/match/done/error event emission, and client-abort handling.
//
// Vercel compatibility:
// - Each chunk of symbols is scanned with a timeout so the function
//   doesn't hang indefinitely if Binance is slow.
// - Reduces chunk size from 15→6 to lower per-chunk latency on Vercel.
// - SSE headers are Vercel-proxy-compatible (no Connection: keep-alive).

import { fetchTradingSymbols } from "./binance";

const DEFAULT_CHUNK = 6;
const CHUNK_TIMEOUT_MS = 15_000;

export type ScanMatchPayload = Record<string, unknown>;

export interface RunScanOptions {
  interval: string;
  validIntervals: Set<string>;
  chunkSize?: number;
  /** Returns a match payload, or null if the symbol doesn't qualify. */
  scanOne: (
    symbol: string,
    interval: string
  ) => Promise<ScanMatchPayload | null>;
}

function send(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  obj: unknown
) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  } catch {
    // controller already closed (client disconnected) — ignore.
  }
}

/**
 * Run a scan with a per-chunk timeout so we don't block forever on
// unresponsive Binance API calls.
 */
async function scanChunkWithTimeout(
  chunk: string[],
  interval: string,
  scanOne: RunScanOptions["scanOne"]
): Promise<ScanMatchPayload[]> {
  const results = await Promise.all(
    chunk.map(async (sym) => {
      try {
        return await Promise.race([
          scanOne(sym, interval),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), CHUNK_TIMEOUT_MS)
          ),
        ]);
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is ScanMatchPayload => r !== null);
}

export async function runScanStream(
  request: Request,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  opts: RunScanOptions
) {
  let interval = opts.interval;
  if (!opts.validIntervals.has(interval)) interval = "1h";
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;

  try {
    send(controller, encoder, {
      type: "status",
      message: "Connecting to Binance Futures API…",
    });

    const symbols = await fetchTradingSymbols();
    send(controller, encoder, { type: "meta", total: symbols.length, interval });

    let scanned = 0;
    let matchCount = 0;

    for (let i = 0; i < symbols.length; i += chunkSize) {
      if (request.signal.aborted) break;

      const chunk = symbols.slice(i, i + chunkSize);
      const matches = await scanChunkWithTimeout(chunk, interval, opts.scanOne);
      scanned += chunk.length;

      for (const r of matches) {
        matchCount += 1;
        send(controller, encoder, { type: "match", data: r });
      }

      send(controller, encoder, {
        type: "progress",
        scanned,
        total: symbols.length,
        matches: matchCount,
      });
    }

    send(controller, encoder, {
      type: "done",
      matches: matchCount,
      total: symbols.length,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Scan failed unexpectedly.";
    send(controller, encoder, { type: "error", message });
  } finally {
    try {
      controller.close();
    } catch {
      // already closed
    }
  }
}

// SSE headers compatible with Vercel's proxy.
// NOTE: Do NOT include "Connection: keep-alive" — Vercel's proxy manages
// connections and this header can cause streaming to fail.
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

/** Clamp a number into [min, max]; falls back to `fallback` on NaN. */
export function clampNumber(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
