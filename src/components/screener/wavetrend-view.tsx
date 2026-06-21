"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  ExternalLink,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { SettingSpec, SettingsPanel } from "./settings-panel";
import {
  EmptyState,
  formatPrice,
  ProgressBar,
  ScanButton,
  StatChip,
} from "./shared";
import { useScanStream } from "./use-scan-stream";

interface WaveTrendMatch {
  symbol: string;
  currentPrice: number;
  wt1: number;
  wt2: number;
  yellowWave: number;
  rsi14: number;
  signalType: "positive" | "negative";
  signalOffset: number;
}

type SignalFilter = "both" | "positive" | "negative";
type SortKey =
  | "symbol"
  | "price"
  | "wt1"
  | "rsi"
  | "signalType"
  | "offset";
type SortDir = "asc" | "desc";

const DEFAULTS = {
  interval: "1h",
  signals: "both" as SignalFilter,
  lookback: 3,
};

const SIGNAL_OPTIONS = [
  { value: "both", label: "Both Signals" },
  { value: "positive", label: "Positive (Green)" },
  { value: "negative", label: "Negative (Red)" },
];

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function WaveTrendView() {
  const [interval, setIntervalValue] = useState(DEFAULTS.interval);
  const [signals, setSignals] = useState<SignalFilter>(DEFAULTS.signals);
  const [lookback, setLookback] = useState(DEFAULTS.lookback);
  const [sortKey, setSortKey] = useState<SortKey>("signalType");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const scan = useScanStream<WaveTrendMatch>();
  const scanning = scan.status === "scanning";
  const matchCount = scan.matches.length;
  const positiveCount = scan.matches.filter((m) => m.signalType === "positive").length;
  const negativeCount = scan.matches.filter((m) => m.signalType === "negative").length;
  const progressPct =
    scan.total > 0 ? Math.min(100, Math.round((scan.scanned / scan.total) * 100)) : 0;

  const startScan = () => {
    const params = new URLSearchParams({
      interval,
      signals,
      lookback: String(lookback),
    });
    scan.start(`/api/scan/wavetrend?${params.toString()}`);
  };

  const reset = () => {
    setIntervalValue(DEFAULTS.interval);
    setSignals(DEFAULTS.signals);
    setLookback(DEFAULTS.lookback);
  };

  const extraSettings: SettingSpec[] = [
    {
      key: "lookback",
      label: "Signal Lookback",
      value: lookback,
      min: 1,
      max: 50,
      step: 1,
      hint: "How many recent candles to scan for a Pressure signal circle.",
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
        case "wt1":
          cmp = a.wt1 - b.wt1;
          break;
        case "rsi":
          cmp = a.rsi14 - b.rsi14;
          break;
        case "signalType":
          // positive (buy-side) above negative (sell-side)
          cmp =
            (a.signalType === "positive" ? 1 : 0) -
            (b.signalType === "positive" ? 1 : 0);
          if (cmp === 0) cmp = a.signalOffset - b.signalOffset;
          break;
        case "offset":
          cmp = a.signalOffset - b.signalOffset;
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
      "WT1",
      "WT2",
      "YellowWave (wt1-wt2)",
      "RSI14",
      "Signal",
      "Signal Offset",
      "Timeframe",
      "Lookback",
    ];
    const rows = sortedMatches.map((m) => [
      m.symbol,
      m.currentPrice,
      m.wt1.toFixed(6),
      m.wt2.toFixed(6),
      m.yellowWave.toFixed(6),
      m.rsi14.toFixed(6),
      m.signalType === "positive" ? "Positive Pressure (Green)" : "Negative Pressure (Red)",
      m.signalOffset,
      interval,
      lookback,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wavetrend-${interval}-${new Date()
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
        commonSettings={[]}
        extraSettings={extraSettings}
        disabled={scanning}
        onReset={reset}
        description="Scans for Wave Trend 'Positive/Negative Pressure' circle signals: Positive (green) = RSI14 oversold + WT1 < -60 + YellowWave pointing up. Negative (red) = RSI14 overbought + WT1 > 60 + YellowWave not pointing up. Uses WT(9,12), RSI(14), OB=60, OS=-60."
      />

      {/* Signal filter bar */}
      <section className="rounded-xl bg-card border border-border shadow-xl p-4 sm:p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-binance-muted">
              Signal Type
            </Label>
            <Select
              value={signals}
              onValueChange={(v) => setSignals(v as SignalFilter)}
              disabled={scanning}
            >
              <SelectTrigger className="w-[200px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
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
            <StatChip label="Positive" value={String(positiveCount)} accent="green" />
            <StatChip label="Negative" value={String(negativeCount)} accent="red" />
            <StatChip label="Lookback" value={`${lookback}c`} />
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
            <h2 className="text-sm font-semibold">Wave Trend Signals</h2>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-binance-muted">
            <LegendDot color="#0ecb81" label="Positive Pressure (buy)" />
            <LegendDot color="#f6465d" label="Negative Pressure (sell)" />
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
                <SortableTh onClick={() => toggleSort("wt1")} className="text-right">
                  WT1{sortArrow("wt1")}
                </SortableTh>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  WT2
                </TableHead>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  YellowWave
                </TableHead>
                <SortableTh onClick={() => toggleSort("rsi")} className="text-right">
                  RSI14{sortArrow("rsi")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("signalType")} className="text-center">
                  Signal{sortArrow("signalType")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("offset")} className="text-center">
                  Recency{sortArrow("offset")}
                </SortableTh>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMatches.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="text-center">
                    <EmptyState
                      status={scan.status}
                      error={scan.error}
                      idleText="No scan run yet. Pick a signal type and hit Start Scan."
                      doneText="No Wave Trend signals in the lookback window. Try increasing lookback or switching signal type."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedMatches.map((m) => {
                  const isPositive = m.signalType === "positive";
                  const signalColor = isPositive ? "#0ecb81" : "#f6465d";
                  const SignalIcon = isPositive ? ArrowUpCircle : ArrowDownCircle;
                  const wtZone =
                    m.wt1 > 60 ? "overbought" : m.wt1 < -60 ? "oversold" : "neutral";
                  const rsiZone =
                    m.rsi14 > 70 ? "overbought" : m.rsi14 < 30 ? "oversold" : "neutral";
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
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums font-semibold",
                          wtZone === "overbought"
                            ? "text-binance-red"
                            : wtZone === "oversold"
                            ? "text-binance-green"
                            : "text-foreground"
                        )}
                        title={`WT1 ${wtZone}`}
                      >
                        {fmt(m.wt1)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-binance-muted">
                        {fmt(m.wt2)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums",
                          m.yellowWave > 0 ? "text-binance-green/90" : "text-binance-red/90"
                        )}
                        title={m.yellowWave > 0 ? "Pointing up" : "Pointing down"}
                      >
                        {m.yellowWave >= 0 ? "+" : ""}
                        {fmt(m.yellowWave)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums font-semibold",
                          rsiZone === "overbought"
                            ? "text-binance-red"
                            : rsiZone === "oversold"
                            ? "text-binance-green"
                            : "text-foreground"
                        )}
                        title={`RSI ${rsiZone}`}
                      >
                        {fmt(m.rsi14)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className="gap-1 border"
                          style={{
                            backgroundColor: `${signalColor}22`,
                            color: signalColor,
                            borderColor: `${signalColor}66`,
                          }}
                          title={
                            isPositive
                              ? "Positive Pressure: RSI oversold + WT oversold + YellowWave up"
                              : "Negative Pressure: RSI overbought + WT overbought + YellowWave down"
                          }
                        >
                          <SignalIcon className="size-3.5" />
                          {isPositive ? "Positive" : "Negative"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {m.signalOffset === 0 ? (
                          <Badge className="bg-binance-yellow/15 text-binance-yellow border border-binance-yellow/30">
                            Live
                          </Badge>
                        ) : (
                          <span className="text-xs text-binance-muted">
                            {m.signalOffset} ago
                          </span>
                        )}
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
