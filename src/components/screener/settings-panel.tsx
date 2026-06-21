"use client";

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface SettingSpec {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}

const INTERVALS = [
  { value: "1m", label: "1m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

/** Decide how many decimals to display/show in the input from the step size. */
function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, s.length - dot - 1);
}

/**
 * Lenient numeric input paired with a slider. Users can type a value directly
 * (allowing intermediate states like "0." or "-") and the value is clamped to
 * [min, max] on blur / Enter. The slider stays in sync and vice-versa.
 */
function SettingSlider({
  spec,
  disabled,
}: {
  spec: SettingSpec;
  disabled: boolean;
}) {
  const { label, value, min, max, step, hint, onChange } = spec;
  const digits = decimalsFor(step);

  // Local string buffer so typing isn't interrupted by number formatting.
  const [text, setText] = useState(value.toFixed(digits));

  // Keep the buffer in sync when the value changes externally (e.g. Reset).
  useEffect(() => {
    setText(value.toFixed(digits));
  }, [value, digits]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      // Empty / partial -> revert to current value.
      setText(value.toFixed(digits));
      return;
    }
    let n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setText(value.toFixed(digits));
      return;
    }
    // Clamp into range, then snap to the nearest step.
    n = Math.min(max, Math.max(min, n));
    if (step > 0) {
      n = Math.round(n / step) * step;
    }
    n = Math.min(max, Math.max(min, n));
    // Round away float drift from snapping.
    n = Number(n.toFixed(digits));
    onChange(n);
    setText(n.toFixed(digits));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-binance-muted">
          {label}
        </Label>
        <Input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "h-7 w-20 px-2 py-1 text-xs font-mono font-semibold text-right tabular-nums",
            "bg-secondary border-border text-binance-yellow focus-visible:border-binance-yellow",
            "focus-visible:ring-binance-yellow/30"
          )}
          aria-label={label}
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
        className="[&_[data-slot=slider-range]]:bg-binance-yellow [&_[data-slot=slider-thumb]]:border-binance-yellow"
      />
      {hint && (
        <span className="text-[10px] text-binance-muted/80 leading-tight">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Collapsible-style settings card. Renders the shared controls (timeframe, BB
 * period, BB stddev) plus any mode-specific `SettingSpec` rows passed in.
 */
export function SettingsPanel({
  interval,
  onIntervalChange,
  commonSettings,
  extraSettings,
  disabled,
  onReset,
  description,
}: {
  interval: string;
  onIntervalChange: (v: string) => void;
  commonSettings: SettingSpec[];
  extraSettings: SettingSpec[];
  disabled: boolean;
  onReset: () => void;
  description?: string;
}) {
  const allSettings = [...commonSettings, ...extraSettings];

  return (
    <section className="rounded-xl bg-card border border-border shadow-xl p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-binance-yellow" />
          <h2 className="text-sm font-semibold">Scan Settings</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="text-binance-muted hover:text-binance-yellow"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {description && (
        <p className="text-xs text-binance-muted mb-4 leading-relaxed">
          {description}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Timeframe */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-binance-muted">
            Timeframe
          </Label>
          <Select
            value={interval}
            onValueChange={onIntervalChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Numeric sliders with typeable inputs */}
        {allSettings.map((s) => (
          <SettingSlider key={s.key} spec={s} disabled={disabled} />
        ))}
      </div>
    </section>
  );
}
