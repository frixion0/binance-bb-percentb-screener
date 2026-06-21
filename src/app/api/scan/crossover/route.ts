// SSE streaming endpoint for the BB %B Crossover screener.
// GET /api/scan/crossover?interval=1h&bbPeriod=20&bbStddev=2&target=0
//
// Emits: status, meta, progress, match, done, error events.

import { scanSymbolCrossover } from "@/lib/binance";
import { clampNumber, runScanStream, SSE_HEADERS } from "@/lib/scan-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INTERVALS = new Set(["1m", "15m", "1h", "4h", "1d"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const interval = searchParams.get("interval") || "1h";
  const bbPeriod = clampNumber(searchParams.get("bbPeriod"), 20, 2, 200);
  const bbStddev = clampNumber(searchParams.get("bbStddev"), 2, 0.1, 10);
  const target = clampNumber(searchParams.get("target"), 0, -10, 10);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await runScanStream(request, controller, encoder, {
        interval,
        validIntervals: VALID_INTERVALS,
        scanOne: (sym, intv) =>
          scanSymbolCrossover(sym, intv, { bbPeriod, bbStddev, target }),
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
