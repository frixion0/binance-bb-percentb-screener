"use client";

import { useMemo, useState } from "react";
import { Activity, Download, ExternalLink, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { SettingSpec, SettingsPanel } from "./settings-panel";
import { Sparkline } from "./sparkline";
import {
  EmptyState,
  formatBB,
  formatPrice,
  ProgressBar,
  ScanButton,
  StatChip,
} from "./shared";
import { useScanStream } from "./use-scan-stream";

interface FlatMatch {
  symbol: string;
  currentPrice: number;
  runLength: number;
  avgBB: number;
  slope: number;
  maxDeviation: number;
  endOffset: number;
  recentBBs: number[];
}

type SortKey = "symbol" | "price" | "runLength" | "avgBB" | "deviation";
type SortDir = "asc" | "desc";

const DEFAULTS = {
  interval: "1h",
  bbPeriod: 20,
  bbStddev: 2,
  tolerance: 0.03,
  maxSlope: 0.05,
  minRunLength: 3,
  lookback: 30,
};

export function FlatView() {
  const [interval, setIntervalValue] = useState(DEFAULTS.interval);
  const [bbPeriod, setBbPeriod] = useState(DEFAULTS.bbPeriod);
  const [bbStddev, setBbStddev] = useState(DEFAULTS.bbStddev);
  const [tolerance, setTolerance] = useState(DEFAULTS.tolerance);
  const [maxSlope, setMaxSlope] = useState(DEFAULTS.maxSlope);
  const [minRunLength, setMinRunLength] = useState(DEFAULTS.minRunLength);
  const [lookback, setLookback] = useState(DEFAULTS.lookback);
  const [sortKey, setSortKey] = useState<SortKey>("runLength");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const scan = useScanStream<FlatMatch>();
  const scanning = scan.status === "scanning";
  const matchCount = scan.matches.length;
  const progressPct =
    scan.total > 0 ? Math.min(100, Math.round((scan.scanned / scan.total) * 100)) : 0;

  const startScan = () => {
    const params = new URLSearchParams({
      interval,
      bbPeriod: String(bbPeriod),
      bbStddev: String(bbStddev),
      tolerance: String(tolerance),
      maxSlope: String(maxSlope),
      minRunLength: String(minRunLength),
      lookback: String(lookback),
    });
    scan.start(`/api/scan/flat?${params.toString()}`);
  };

  const reset = () => {
    setIntervalValue(DEFAULTS.interval);
    setBbPeriod(DEFAULTS.bbPeriod);
    setBbStddev(DEFAULTS.bbStddev);
    setTolerance(DEFAULTS.tolerance);
    setMaxSlope(DEFAULTS.maxSlope);
    setMinRunLength(DEFAULTS.minRunLength);
    setLookback(DEFAULTS.lookback);
  };

  const commonSettings: SettingSpec[] = [
    {
      key: "bbPeriod",
      label: "BB Period",
      value: bbPeriod,
      min: 2,
      max: 200,
      step: 1,
      onChange: setBbPeriod,
    },
    {
      key: "bbStddev",
      label: "BB Std Dev",
      value: bbStddev,
      min: 0.1,
      max: 10,
      step: 0.1,
      onChange: setBbStddev,
    },
  ];

  const extraSettings: SettingSpec[] = [
    {
      key: "tolerance",
      label: "Straightness Tol.",
      value: tolerance,
      min: 0.0005,
      max: 2,
      step: 0.0005,
      hint: "Max %B deviation from the best-fit line. Lower = stricter. Any value allowed.",
      onChange: setTolerance,
    },
    {
      key: "maxSlope",
      label: "Max Slope / Candle",
      value: maxSlope,
      min: 0,
      max: 5,
      step: 0.005,
      hint: "Max allowed %B drift per candle. 0 = perfectly flat. Any value allowed.",
      onChange: setMaxSlope,
    },
    {
      key: "minRunLength",
      label: "Min Candles",
      value: minRunLength,
      min: 2,
      max: 100,
      step: 1,
      hint: "Minimum consecutive candles forming the line (≥2).",
      onChange: setMinRunLength,
    },
    {
      key: "lookback",
      label: "Lookback Candles",
      value: lookback,
      min: 5,
      max: 200,
      step: 1,
      hint: "How many recent %B candles to inspect for a straight segment.",
      onChange: setLookback,
    },
  ];

  const sortedMatches = useMemo(() => {
    const arr = [...scan.matches];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "price":
          cmp = a.currentPrice - b.currentPrice;
          break;
        case "runLength":
          cmp = a.runLength - b.runLength;
          break;
        case "avgBB":
          cmp = a.avgBB - b.avgBB;
          break;
        case "deviation":
          cmp = a.maxDeviation - b.maxDeviation;
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [scan.matches, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const exportCsv = () => {
    if (sortedMatches.length === 0) return;
    const header = [
      "Symbol",
      "Current Price",
      "Run Length",
      "Avg %B",
      "Slope / Candle",
      "Max Deviation",
      "End Offset",
      "Timeframe",
      "BB Period",
      "BB StdDev",
      "Tolerance",
      "Max Slope",
    ];
    const rows = sortedMatches.map((m) => [
      m.symbol,
      m.currentPrice,
      m.runLength,
      m.avgBB.toFixed(6),
      m.slope.toFixed(6),
      m.maxDeviation.toFixed(6),
      m.endOffset,
      interval,
      bbPeriod,
      bbStddev,
      tolerance,
      maxSlope,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bb-flatline-${interval}-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <SettingsPanel
        interval={interval}
        onIntervalChange={setIntervalValue}
        commonSettings={commonSettings}
        extraSettings={extraSettings}
        disabled={scanning}
        onReset={reset}
        description="Finds symbols whose recent BB %B values form a nearly-straight line (≥2 candles) at any level — using a best-fit line with tolerance and slope gates."
      />

      {/* Action + status bar */}
      <section className="rounded-xl bg-card border border-border shadow-xl p-4 sm:p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <ScanButton scanning={scanning} onStart={startScan} onStop={scan.stop} />
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={matchCount === 0 || scanning}
            className="h-10 px-4 border-border bg-secondary hover:bg-accent"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {scanning && <Activity className="size-4 text-binance-yellow animate-pulse" />}
            <span
              className={cn(
                "text-sm",
                scan.status === "error"
                  ? "text-binance-red"
                  : scanning
                  ? "text-binance-yellow"
                  : "text-binance-muted"
              )}
            >
              {scan.phase}
            </span>
          </div>
          <ProgressBar scanning={scanning} status={scan.status} progressPct={progressPct} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatChip label="Matches" value={String(matchCount)} accent="yellow" />
            <StatChip
              label="Scanned"
              value={scan.total > 0 ? `${scan.scanned} / ${scan.total}` : "—"}
            />
            <StatChip label="Progress" value={scan.total > 0 ? `${progressPct}%` : "—"} />
            <StatChip label="Min Candles" value={String(minRunLength)} />
            <StatChip label="Tol" value={tolerance.toFixed(3)} />
            {scan.lastUpdated && (
              <StatChip label="Updated" value={scan.lastUpdated.toLocaleTimeString()} />
            )}
          </div>
          {scan.error && (
            <p className="text-xs text-binance-red bg-binance-red/10 border border-binance-red/30 rounded-md px-3 py-2 mt-1">
              {scan.error}
            </p>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="rounded-xl bg-card border border-border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-binance-yellow" />
            <h2 className="text-sm font-semibold">Straight-Line Results</h2>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-binance-muted">
            <LegendDot color="#0ecb81" label="Rising" />
            <LegendDot color="#f3ba2f" label="Flat" />
            <LegendDot color="#f6465d" label="Falling" />
          </div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto binance-scroll">
          <table className="w-full text-sm">
            <TableHeader className="sticky top-0 z-10 bg-[#2b3139] shadow-[0_1px_0_rgba(0,0,0,0.4)]">
              <TableRow className="border-border hover:bg-transparent">
                <SortableTh onClick={() => toggleSort("symbol")}>
                  Symbol{sortArrow("symbol")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("price")} className="text-right">
                  Price{sortArrow("price")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("runLength")} className="text-right">
                  Run Length{sortArrow("runLength")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("avgBB")} className="text-right">
                  Avg %B{sortArrow("avgBB")}
                </SortableTh>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  Slope
                </TableHead>
                <SortableTh onClick={() => toggleSort("deviation")} className="text-right">
                  Max Dev{sortArrow("deviation")}
                </SortableTh>
                <TableHead className="text-center text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  Recency
                </TableHead>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  Recent %B
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMatches.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="text-center">
                    <EmptyState
                      status={scan.status}
                      error={scan.error}
                      idleText="No scan run yet. Tune tolerance & min candles, then Start Scan."
                      doneText="No assets currently show a straight %B line with these settings. Try loosening tolerance or lowering min candles."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedMatches.map((m) => {
                  const slopeColor =
                    Math.abs(m.slope) < 0.005
                      ? "#f3ba2f"
                      : m.slope > 0
                      ? "#0ecb81"
                      : "#f6465d";
                  const SlopeIcon =
                    Math.abs(m.slope) < 0.005
                      ? Minus
                      : m.slope > 0
                      ? TrendingUp
                      : TrendingDown;
                  const levelAccent =
                    m.avgBB > 0.8 ? "red" : m.avgBB < 0.2 ? "green" : undefined;
                  return (
                    <TableRow
                      key={m.symbol}
                      className="animate-in fade-in slide-in-from-bottom-1 duration-300 border-border"
                    >
                      <TableCell className="font-medium">
                        <a
                          href={`https://www.binance.com/en/futures/${m.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-foreground hover:text-binance-yellow transition-colors"
                        >
                          <span className="font-mono">{m.symbol}</span>
                          <ExternalLink className="size-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPrice(m.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block rounded-sm bg-binance-yellow/15 text-binance-yellow font-bold tabular-nums px-1.5 py-0.5 text-xs"
                            title={`${m.runLength} consecutive candles`}
                          >
                            {m.runLength}
                          </span>
                          <span className="text-[10px] text-binance-muted">candles</span>
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums font-semibold",
                          levelAccent === "red"
                            ? "text-binance-red"
                            : levelAccent === "green"
                            ? "text-binance-green"
                            : "text-foreground"
                        )}
                        title={
                          levelAccent === "red"
                            ? "Near upper band (overbought zone)"
                            : levelAccent === "green"
                            ? "Near lower band (oversold zone)"
                            : "Mid-band region"
                        }
                      >
                        {formatBB(m.avgBB)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className="inline-flex items-center gap-1 font-mono tabular-nums text-xs"
                          style={{ color: slopeColor }}
                        >
                          <SlopeIcon className="size-3.5" />
                          {m.slope >= 0 ? "+" : ""}
                          {m.slope.toFixed(4)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-binance-muted">
                        {formatBB(m.maxDeviation)}
                      </TableCell>
                      <TableCell className="text-center">
                        {m.endOffset === 0 ? (
                          <Badge className="bg-binance-green/15 text-binance-green border border-binance-green/30">
                            Live
                          </Badge>
                        ) : (
                          <span className="text-xs text-binance-muted">
                            {m.endOffset} ago
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Sparkline values={m.recentBBs} color={slopeColor} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function SortableTh({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "text-binance-muted text-[11px] uppercase tracking-wide font-semibold cursor-pointer select-none hover:text-binance-yellow transition-colors",
        className
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-left">
        {children}
      </button>
    </TableHead>
  );
}
