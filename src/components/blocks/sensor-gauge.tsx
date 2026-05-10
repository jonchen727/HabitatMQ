"use client";

import { Card, CardContent } from "@/components/ui/card";

interface SensorGaugeProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  targetMin: number;
  targetMax: number;
  icon: string;
  status: string;
}

export function SensorGauge({
  label,
  value,
  unit,
  min,
  max,
  targetMin,
  targetMax,
  icon,
  status,
}: SensorGaugeProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const targetPctMin = ((targetMin - min) / (max - min)) * 100;
  const targetPctMax = ((targetMax - min) / (max - min)) * 100;

  const statusColor =
    status === "critical"
      ? "text-red-400"
      : status === "warning"
        ? "text-amber-400"
        : "text-emerald-400";

  const statusGlow =
    status === "critical"
      ? "glow-critical"
      : status === "warning"
        ? "glow-warn"
        : "";

  const barColor =
    status === "critical"
      ? "bg-red-500"
      : status === "warning"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <Card
      className={`bg-card/30 backdrop-blur-md border-border/40 hover:bg-card/50 transition-all duration-500 touch-card ${statusGlow}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {icon} {label}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wider font-bold ${statusColor}`}
          >
            {status === "normal" ? "✓ OK" : status.toUpperCase()}
          </span>
        </div>

        <div className={`text-3xl font-bold tabular-nums mb-3 ${statusColor}`}>
          {value.toFixed(1)}
          <span className="text-sm text-muted-foreground ml-1">{unit}</span>
        </div>

        {/* Gauge bar */}
        <div className="relative h-2 bg-secondary/50 rounded-full overflow-hidden">
          {/* Target range */}
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/20 border-l border-r border-emerald-500/40"
            style={{
              left: `${targetPctMin}%`,
              width: `${targetPctMax - targetPctMin}%`,
            }}
          />
          {/* Current value */}
          <div
            className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-1000 ${barColor}`}
            style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground tabular-nums">{min}</span>
          <span className="text-[9px] text-emerald-500/60 tabular-nums">
            {targetMin}–{targetMax}
          </span>
          <span className="text-[9px] text-muted-foreground tabular-nums">{max}</span>
        </div>
      </CardContent>
    </Card>
  );
}
