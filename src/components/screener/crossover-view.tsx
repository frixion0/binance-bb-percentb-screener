"use client";

import { useMemo, useState } from "react";
import { Activity, Download, ExternalLink, TrendingUp } from "lucide-react";

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
import {
  EmptyState,
  formatBB,
  formatPrice,
  ProgressBar,
  ScanButton,
  StatChip,
} from "./shared";
import { useScanStream } from "./use-scan-stream";

interface CrossoverMatch {
  symbol: string;
  currentPrice: number;
  twoAgoBB: number;
  prevBB: number;
  currentBB: number;
  signalType: "current" | "delayed";
}

type SortKey = "symbol" | "price" | "currentBB" | "signalType";
type SortDir = "asc" | "desc";

const DEFAULTS = {
  interval: "1h",
  bbPeriod: 20,
  bbStddev: 2,
  target: 0,
};

export function CrossoverView() {
  const [interval, setIntervalValue] = useState(DEFAULTS.interval);
  const [bbPeriod, setBbPeriod] = useState(DEFAULTS.bbPeriod);
  const [bbStddev, setBbStddev] = useState(DEFAULTS.bbStddev);
  const [target, setTarget] = useState(DEFAULTS.target);
  const [sortKey, setSortKey] = useState<SortKey>("signalType");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const scan = useScanStream<CrossoverMatch>();
  const scanning = scan.status === "scanning";
  const matchCount = scan.matches.length;
  const progressPct =
    scan.total > 0 ? Math.min(100, Math.round((scan.scanned / scan.total) * 100)) : 0;

  const startScan = () => {
    const params = new URLSearchParams({
      interval,
      bbPeriod: String(bbPeriod),
      bbStddev: String(bbStddev),
      target: String(target),
    });
    scan.start(`/api/scan/crossover?${params.toString()}`);
  };

  const reset = () => {
    setIntervalValue(DEFAULTS.interval);
    setBbPeriod(DEFAULTS.bbPeriod);
    setBbStddev(DEFAULTS.bbStddev);
    setTarget(DEFAULTS.target);
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
      key: "target",
      label: "Crossover Target (%B)",
      value: target,
      min: -10,
      max: 10,
      step: 0.01,
      hint: "%B level the close must cross above (0 = middle band). Any value allowed.",
      onChange: setTarget,
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
        case "currentBB":
          cmp = a.currentBB - b.currentBB;
          break;
        case "signalType":
          cmp =
            (a.signalType === "current" ? 1 : 0) -
            (b.signalType === "current" ? 1 : 0);
          if (cmp === 0) cmp = b.currentBB - a.currentBB;
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
      "2 Candles Ago %B",
      "Prev Candle %B",
      "Current %B",
      "Signal",
      "Timeframe",
      "BB Period",
      "BB StdDev",
      "Target",
    ];
    const rows = sortedMatches.map((m) => [
      m.symbol,
      m.currentPrice,
      m.twoAgoBB.toFixed(6),
      m.prevBB.toFixed(6),
      m.currentBB.toFixed(6),
      m.signalType === "current" ? "Just Crossed (Current)" : "Crossed 1 Candle Ago",
      interval,
      bbPeriod,
      bbStddev,
      target,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bb-crossover-${interval}-${new Date()
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
        description="Detects %B crossing above the target line on the current candle, or up to 2 candles ago."
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
            {scanning && <TrendingUp className="size-4 text-binance-yellow animate-pulse" />}
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
            <StatChip label="Timeframe" value={interval} />
            <StatChip label="BB" value={`${bbPeriod} / ${bbStddev}σ`} />
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
            <h2 className="text-sm font-semibold">Crossover Results</h2>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-binance-muted">
            <LegendDot color="#0ecb81" label="Just crossed (current)" />
            <LegendDot color="#f3ba2f" label="Crossed 1 candle ago" />
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
                  Current Price{sortArrow("price")}
                </SortableTh>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  2 Candles Ago %B
                </TableHead>
                <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                  Prev Candle %B
                </TableHead>
                <SortableTh onClick={() => toggleSort("currentBB")} className="text-right">
                  Current %B{sortArrow("currentBB")}
                </SortableTh>
                <SortableTh onClick={() => toggleSort("signalType")} className="text-right">
                  Signal{sortArrow("signalType")}
                </SortableTh>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMatches.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center">
                    <EmptyState status={scan.status} error={scan.error} />
                  </TableCell>
                </TableRow>
              ) : (
                sortedMatches.map((m) => (
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
                        "text-right font-mono tabular-nums",
                        m.twoAgoBB > target ? "text-binance-green/90" : "text-binance-red/90"
                      )}
                    >
                      {formatBB(m.twoAgoBB)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        m.prevBB > target ? "text-binance-green/90" : "text-binance-red/90"
                      )}
                    >
                      {formatBB(m.prevBB)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums font-semibold",
                        m.currentBB > target ? "text-binance-green" : "text-binance-red"
                      )}
                    >
                      {formatBB(m.currentBB)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.signalType === "current" ? (
                        <Badge className="bg-binance-green text-background hover:bg-binance-green/90 border-transparent">
                          Just Crossed · Current
                        </Badge>
                      ) : (
                        <Badge className="bg-binance-yellow text-background hover:bg-binance-yellow/90 border-transparent">
                          Crossed 1 Candle Ago
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
