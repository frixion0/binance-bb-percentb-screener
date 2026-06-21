// SSE streaming endpoint for the Wave Trend Pressure signal screener.
// GET /api/scan/wavetrend?interval=1h&signals=both&lookback=3
//
// Emits: status, meta, progress, match, done, error events.
// Scans all USDT/USDC perpetuals for the Pine Script's Positive/Negative
// Pressure circle signals within the last `lookback` candles.

import { scanSymbolWaveTrend } from "@/lib/binance";
import { clampNumber, runScanStream, SSE_HEADERS } from "@/lib/scan-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INTERVALS = new Set(["1m", "15m", "1h", "4h", "1d"]);
const VALID_SIGNALS = new Set(["positive", "negative", "both"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const interval = searchParams.get("interval") || "1h";
  let signals = searchParams.get("signals") || "both";
  if (!VALID_SIGNALS.has(signals)) signals = "both";
  const lookback = clampNumber(searchParams.get("lookback"), 3, 1, 50);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await runScanStream(request, controller, encoder, {
        interval,
        validIntervals: VALID_INTERVALS,
        scanOne: (sym, intv) =>
          scanSymbolWaveTrend(sym, intv, {
            signals: signals as "positive" | "negative" | "both",
            lookback,
          }),
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
