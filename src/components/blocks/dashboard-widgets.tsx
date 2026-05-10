"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Droplets,
  Moon,
  CloudRain,
  Sun,
  Camera,
} from "lucide-react";
import { useState } from "react";
import type { Alert as AlertType, EnclosureState, ZoneDetection, ZoneId } from "@/lib/types";
import type { HeatmapPoint } from "@/lib/mock-data";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Alert Panel ─────────────────────────────────────────────────────────────

export function AlertPanel({ alerts }: { alerts: AlertType[] }) {
  const severityIcon = (s: AlertType["severity"]) =>
    s === "critical" ? (
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
    ) : s === "warning" ? (
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
    ) : (
      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
    );

  const severityBg = (s: AlertType["severity"]) =>
    s === "critical"
      ? "border-red-500/30 bg-red-500/5"
      : s === "warning"
        ? "border-amber-500/20 bg-amber-500/5"
        : "border-emerald-500/20 bg-emerald-500/5";

  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Alerts
          {alerts.some((a) => a.severity === "critical") && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-lg border touch-card ${severityBg(alert.severity)}`}
          >
            {severityIcon(alert.severity)}
            <div className="flex-1 min-w-0">
              <div className="text-xs">{alert.message}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── PID Card ────────────────────────────────────────────────────────────────

export function PIDCard({ pid, controlId }: { pid: import("@/lib/types").PIDState & { autoTuning?: boolean }, controlId?: string }) {
  const [tuningRequested, setTuningRequested] = useState(false);

  const errorColor =
    Math.abs(pid.error) < 1
      ? "text-emerald-400"
      : Math.abs(pid.error) < 3
        ? "text-amber-400"
        : "text-red-400";

  const handleAutoTune = async () => {
    if (!controlId) return;
    setTuningRequested(true);
    try {
      await fetch("/api/controls/autotune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId }),
      });
    } catch (err) {
      console.error("Failed to start auto-tune", err);
      setTuningRequested(false);
    }
  };

  const isTuning = pid.autoTuning || tuningRequested;

  return (
    <div className={`p-3 rounded-lg bg-secondary/20 border ${isTuning ? 'border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.2)]' : 'border-border/20'} space-y-2 touch-card relative overflow-hidden transition-all duration-500`}>
      {isTuning && (
        <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
      )}
      <div className="flex items-center justify-between relative z-10">
        <span className="text-xs font-medium flex items-center gap-2">
          {pid.label}
          {isTuning && (
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              Tuning...
            </span>
          )}
        </span>
        <span className={`text-xs font-mono tabular-nums ${errorColor}`}>
          err: {pid.error > 0 ? "+" : ""}
          {pid.error.toFixed(1)}°
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center relative z-10">
        <div>
          <div className="text-lg font-bold tabular-nums text-blue-400">{pid.setpoint}°</div>
          <div className="text-[9px] text-muted-foreground uppercase">Target</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums text-foreground">
            {pid.actual.toFixed(1)}°
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Actual</div>
        </div>
        <div>
          <div className={`text-lg font-bold tabular-nums ${isTuning ? "text-primary animate-pulse" : "text-primary"}`}>
            {pid.output.toFixed(0)}%
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Output</div>
        </div>
      </div>
      
      {/* Normalization Error Bar */}
      <div className="relative h-1 bg-secondary/50 rounded-full overflow-hidden my-1">
        <div 
          className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-foreground/20 z-10" 
          title="Setpoint Zero"
        />
        {/* Error visualization - goes left for negative error (too hot), right for positive error (too cold) */}
        {/* Actual visualization: pid.error = setpoint - actual. Positive means we are below setpoint. */}
        <div
          className={`absolute top-0 bottom-0 transition-all duration-1000 ${pid.error > 0 ? 'bg-blue-400 left-1/2' : 'bg-red-400 right-1/2'}`}
          style={{ width: `${Math.min(100, Math.abs(pid.error) * 10)}%` }}
        />
      </div>

      <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden relative z-10">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isTuning ? 'bg-gradient-to-r from-amber-500/60 to-amber-500' : 'bg-gradient-to-r from-primary/60 to-primary'}`}
          style={{ width: `${pid.output}%` }}
        />
      </div>
      <div className="flex justify-between items-center relative z-10">
        <div className="flex gap-2 text-[8px] text-muted-foreground font-mono">
          <span>Kp={pid.Kp.toFixed(1)}</span>
          <span>Ki={pid.Ki.toFixed(3)}</span>
          <span>Kd={pid.Kd.toFixed(1)}</span>
        </div>
        
        {controlId && !isTuning && (
          <button 
            onClick={handleAutoTune}
            className="text-[9px] px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors border border-border/50"
          >
            Auto-Tune
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

export function QuickActions({
  state,
  onShedMode,
  onNightMode,
  onMist,
}: {
  state: EnclosureState;
  onShedMode: () => void;
  onNightMode: () => void;
  onMist: () => void;
}) {
  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <Button
          variant={state.shedMode ? "default" : "secondary"}
          className="text-xs h-12 touch-target"
          onClick={onShedMode}
        >
          <Droplets className="w-4 h-4 mr-1.5" />
          {state.shedMode ? "Shed ON" : "Shed Mode"}
        </Button>
        <Button
          variant={state.nightOverride ? "default" : "secondary"}
          className="text-xs h-12 touch-target"
          onClick={onNightMode}
        >
          <Moon className="w-4 h-4 mr-1.5" />
          {state.nightOverride ? "Night ON" : "Night Mode"}
        </Button>
        <Button variant="secondary" className="text-xs h-12 touch-target" onClick={onMist}>
          <CloudRain className="w-4 h-4 mr-1.5" />
          Mist Now
        </Button>
        <Button variant="secondary" className="text-xs h-12 touch-target">
          <Sun className="w-4 h-4 mr-1.5" />
          Feed Log
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Camera Feed Mockup ──────────────────────────────────────────────────────

export function CameraFeed({ zone }: { zone: ZoneDetection }) {
  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          Camera Feed
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] text-red-400 uppercase tracking-wider font-bold">
              Live
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 rounded-lg overflow-hidden border border-border/30">
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
            }}
          />

          {/* Zone overlay */}
          <div className="absolute inset-0 grid grid-cols-3 gap-px p-1 opacity-30">
            <div className="rounded bg-orange-500/20 border border-orange-500/30" />
            <div className="rounded bg-yellow-500/10 border border-yellow-500/20" />
            <div className="rounded bg-blue-500/15 border border-blue-500/25" />
          </div>

          {/* Snake detection box */}
          {zone.confidence > 0 && (
            <div
              className="absolute border-2 border-emerald-400 rounded-lg animate-pulse"
              style={{
                left:
                  zone.currentZone.includes("warm") ||
                  zone.currentZone === "basking" ||
                  zone.currentZone === "burrow"
                    ? "8%"
                    : zone.currentZone.includes("cool") ||
                        zone.currentZone === "leaf_litter"
                      ? "62%"
                      : "35%",
                top: "25%",
                width: "28%",
                height: "50%",
              }}
            >
              <span className="absolute -top-5 left-0 text-[9px] text-emerald-400 font-mono bg-black/60 px-1 rounded">
                🐍 {(zone.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Bottom bar */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/80 font-mono">
                CAM-01 · {new Date().toLocaleTimeString()}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {zone.activity}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Activity Heatmap ────────────────────────────────────────────────────────

export function ActivityHeatmap({ data }: { data: HeatmapPoint[] }) {
  const zones: ZoneId[] = ["basking", "warm_hide", "transition", "cool_hide", "burrowed", "water"];
  const zoneLabels: Record<string, string> = {
    basking: "Bask",
    warm_hide: "Warm",
    transition: "Trans",
    cool_hide: "Cool",
    burrowed: "Buried",
    water: "Water",
  };

  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          24h Activity Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {zones.map((zone) => (
            <div key={zone} className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground w-10 text-right font-mono">
                {zoneLabels[zone]}
              </span>
              <div className="flex-1 flex gap-[1px]">
                {Array.from({ length: 24 }, (_, hour) => {
                  const point = data.find((d) => d.hour === hour && d.zone === zone);
                  const intensity = point?.intensity ?? 0;
                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger
                        className="flex-1 h-4 rounded-[2px] transition-colors cursor-pointer"
                        style={{
                          backgroundColor: `oklch(0.75 0.14 70 / ${intensity * 0.8})`,
                        }}
                      />
                      <TooltipContent className="text-xs">
                        {hour}:00 — {zoneLabels[zone]}: {(intensity * 100).toFixed(0)}%
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="w-10" />
            <div className="flex-1 flex justify-between text-[8px] text-muted-foreground font-mono">
              <span>0</span>
              <span>6</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
