"use client";

import { Radar } from "lucide-react";

import { CrossoverView } from "@/components/screener/crossover-view";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center size-9 rounded-lg bg-binance-yellow text-background">
              <Radar className="size-5" />
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-binance-yellow">
            Binance Futures BB %B Screener
          </h1>
          <p className="text-binance-muted mt-2 text-sm sm:text-base">
            Fully customizable Bollinger Bands %B scanner — crossover signal detection. All scanning runs server-side.
          </p>
        </header>

        {/* Setup note */}
        <div className="rounded-lg border border-binance-green/30 bg-[#1b2621] px-4 py-3 mb-6 text-sm text-[#c5ebd4]">
          <p className="leading-relaxed">
            <span className="font-semibold text-binance-green">No browser setup required.</span>{" "}
            All Binance API requests run on the server, so no CORS extension is
            needed. Tune the settings below and run a scan.
          </p>
        </div>

        <CrossoverView />

        <p className="text-[11px] text-binance-muted mt-4 text-center">
          Data sourced live from the Binance USDⓈ-M Futures API. For research
          purposes only — not financial advice.
        </p>
      </main>

      <footer className="mt-auto border-t border-border bg-card/60 backdrop-blur">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-binance-muted">
          <p>Binance Futures BB %B Screener · customizable · server-side scanning</p>
          <p>Live data · No API key required</p>
        </div>
      </footer>
    </div>
  );
}
