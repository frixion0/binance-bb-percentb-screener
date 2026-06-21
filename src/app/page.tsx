"use client";

import { Activity, LineChart, Radar } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CrossoverView } from "@/components/screener/crossover-view";
import { FlatView } from "@/components/screener/flat-view";
import { WaveTrendView } from "@/components/screener/wavetrend-view";

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
            Fully customizable Bollinger Bands %B scanner — crossover signals and
            straight-line detection. All scanning runs server-side.
          </p>
        </header>

        {/* Setup note */}
        <div className="rounded-lg border border-binance-green/30 bg-[#1b2621] px-4 py-3 mb-6 text-sm text-[#c5ebd4]">
          <p className="leading-relaxed">
            <span className="font-semibold text-binance-green">No browser setup required.</span>{" "}
            All Binance API requests run on the server, so no CORS extension is
            needed. Tune the settings below and run a scan for either signal
            type.
          </p>
        </div>

        {/* Mode tabs */}
        <Tabs defaultValue="crossover" className="gap-4">
          <TabsList className="bg-card border border-border h-auto p-1.5">
            <TabsTrigger
              value="crossover"
              className="data-[state=active]:bg-binance-yellow data-[state=active]:text-background data-[state=active]:shadow-md px-4 py-2 text-sm font-semibold gap-2"
            >
              <Radar className="size-4" />
              %B Crossover
            </TabsTrigger>
            <TabsTrigger
              value="flat"
              className="data-[state=active]:bg-binance-yellow data-[state=active]:text-background data-[state=active]:shadow-md px-4 py-2 text-sm font-semibold gap-2"
            >
              <LineChart className="size-4" />
              Straight-Line Detector
            </TabsTrigger>
            <TabsTrigger
              value="wavetrend"
              className="data-[state=active]:bg-binance-yellow data-[state=active]:text-background data-[state=active]:shadow-md px-4 py-2 text-sm font-semibold gap-2"
            >
              <Activity className="size-4" />
              Wave Trend Signals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="crossover">
            <CrossoverView />
          </TabsContent>
          <TabsContent value="flat">
            <FlatView />
          </TabsContent>
          <TabsContent value="wavetrend">
            <WaveTrendView />
          </TabsContent>
        </Tabs>

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
