// Debug endpoint: tests connectivity to all Binance API endpoints.
// GET /api/debug
//
// This helps diagnose why the screener might fail on Vercel by showing
// which endpoints are reachable and which return errors (e.g. HTTP 451).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINTS = [
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
  "https://fapi4.binance.com",
  "https://fapi.binance.com",
  "https://fapi.binance.me",
];

interface EndpointResult {
  url: string;
  ping: "ok" | "fail" | "timeout";
  status?: number;
  latencyMs?: number;
  error?: string;
}

export async function GET() {
  const results: EndpointResult[] = [];

  for (const url of ENDPOINTS) {
    const start = Date.now();
    try {
      const res = await fetch(`${url}/fapi/v1/ping`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        results.push({ url, ping: "ok", status: res.status, latencyMs });
      } else {
        results.push({
          url,
          ping: "fail",
          status: res.status,
          latencyMs,
          error: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
      results.push({
        url,
        ping: isTimeout ? "timeout" : "fail",
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const working = results.filter((r) => r.ping === "ok");

  return Response.json({
    timestamp: new Date().toISOString(),
    summary: {
      total: ENDPOINTS.length,
      working: working.length,
      recommended: working.length > 0 ? working[0].url : null,
    },
    endpoints: results,
  });
}
