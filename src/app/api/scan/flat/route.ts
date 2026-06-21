// SSE streaming endpoint for the BB %B "nearly straight line" detector.
// GET /api/scan/flat?interval=1h&bbPeriod=20&bbStddev=2&tolerance=0.03&maxSlope=0.05&minRunLength=3&lookback=30
//
// Emits: status, meta, progress, match, done, error events.

import { scanSymbolFlat } from "@/lib/binance";
import { clampNumber, runScanStream, SSE_HEADERS } from "@/lib/scan-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INTERVALS = new Set(["1m", "15m", "1h", "4h", "1d"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const interval = searchParams.get("interval") || "1h";
  const bbPeriod = clampNumber(searchParams.get("bbPeriod"), 20, 2, 200);
  const bbStddev = clampNumber(searchParams.get("bbStddev"), 2, 0.1, 10);
  const tolerance = clampNumber(searchParams.get("tolerance"), 0.03, 0.0005, 2);
  const maxSlope = clampNumber(searchParams.get("maxSlope"), 0.05, 0, 5);
  const minRunLength = clampNumber(searchParams.get("minRunLength"), 3, 2, 100);
  const lookback = clampNumber(searchParams.get("lookback"), 30, 5, 200);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await runScanStream(request, controller, encoder, {
        interval,
        validIntervals: VALID_INTERVALS,
        scanOne: (sym, intv) =>
          scanSymbolFlat(sym, intv, {
            bbPeriod,
            bbStddev,
            tolerance,
            maxSlope,
            minRunLength,
            lookback,
          }),
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
