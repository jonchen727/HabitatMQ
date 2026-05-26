"use client";

import { useState, useEffect } from "react";

/**
 * Widget Registry — maps PaneDef.displayType → React widget component.
 *
 * Each widget renders inside a glass card. The registry pattern
 * makes it trivial to add new visualization types.
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Slider } from "@/components/ui/slider";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  ToggleLeft,
  BarChart3,
  Hash,
  Gauge,
  Settings2,
  Video,
} from "lucide-react";
import type { SensorDef, PaneDef, ControlDef, DisplayType, ColorTheme } from "@/lib/schema";
import { staggerItem as item } from "@/lib/animations";
import { PIDCard } from "./dashboard-widgets";
import { useDashboardStore } from "@/store/use-dashboard-store";

// ─── Color Theme Map ─────────────────────────────────────────────────────────

const THEME_COLORS: Record<ColorTheme, { accent: string; glow: string; bg: string }> = {
  warm:    { accent: "#f97316", glow: "rgba(249,115,22,0.12)", bg: "bg-orange-400/[0.04]" },
  cool:    { accent: "#06b6d4", glow: "rgba(6,182,212,0.12)", bg: "bg-cyan-400/[0.04]" },
  amber:   { accent: "#f59e0b", glow: "rgba(245,158,11,0.12)", bg: "bg-amber-400/[0.04]" },
  green:   { accent: "#10b981", glow: "rgba(16,185,129,0.12)", bg: "bg-emerald-400/[0.04]" },
  neutral: { accent: "#94a3b8", glow: "rgba(148,163,184,0.08)", bg: "bg-white/[0.02]" },
};

// ─── Display Type Icons ──────────────────────────────────────────────────────

export const DISPLAY_TYPE_ICONS: Record<DisplayType, React.ElementType> = {
  gauge: Gauge,
  number: Hash,
  chart: Activity,
  bar: BarChart3,
  switch: ToggleLeft,
  stream: Video,
};

// ─── Widget Props ────────────────────────────────────────────────────────────

interface WidgetProps {
  pane: PaneDef;
  sensor: SensorDef;
  value: number | boolean | null;
  control?: ControlDef;
  onPublish?: (topic: string, payload: string) => void;
  onModeChange?: (controlId: string, mode: "on" | "off" | "auto") => void;
}

/** Props for the outer PaneCard wrapper — sensor can be null (resolved inside). */
interface PaneCardProps {
  pane: PaneDef;
  sensor: SensorDef | null;
  value: number | boolean | null;
  control?: ControlDef;
  onPublish?: (topic: string, payload: string) => void;
  onModeChange?: (controlId: string, mode: "on" | "off" | "auto") => void;
}

// ─── Gauge Widget ────────────────────────────────────────────────────────────

function GaugeWidget({ pane, sensor, value }: WidgetProps) {
  const theme = THEME_COLORS[pane.colorTheme];
  const numVal = typeof value === "number" ? value : 0;
  const min = pane.minOverride ?? sensor.min ?? 0;
  const max = pane.maxOverride ?? sensor.max ?? 100;
  const label = pane.labelOverride ?? sensor.label;

  return (
    <div className="flex flex-col items-center -my-1">
      <p className="text-[13px] font-semibold text-white/85 text-center mb-0.5">
        {label}
      </p>
      <RadialGauge
        value={numVal}
        min={min}
        max={max}
        unit={sensor.unit}
        color={theme.accent}
        size={140}
      />
    </div>
  );
}

// ─── Number Widget ───────────────────────────────────────────────────────────

function NumberWidget({ pane, sensor, value }: WidgetProps) {
  const theme = THEME_COLORS[pane.colorTheme];
  const numVal = typeof value === "number" ? value : 0;
  const label = pane.labelOverride ?? sensor.label;

  // Simple trend: compare to threshold midpoint
  const mid = ((sensor.min ?? 0) + (sensor.max ?? 100)) / 2;
  const TrendIcon = numVal > mid * 1.1 ? TrendingUp : numVal < mid * 0.9 ? TrendingDown : Minus;

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <span className="text-[10px] text-white/30 font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color: theme.accent }}
        >
          {numVal.toFixed(sensor.unit === "hrs" ? 2 : 1)}
        </span>
        <span className="text-[11px] text-white/25 font-medium">{sensor.unit}</span>
      </div>
      <TrendIcon className="w-3.5 h-3.5 text-white/15" />
    </div>
  );
}

// ─── Bar Widget ──────────────────────────────────────────────────────────────

function BarWidget({ pane, sensor, value }: WidgetProps) {
  const theme = THEME_COLORS[pane.colorTheme];
  const numVal = typeof value === "number" ? value : 0;
  const min = pane.minOverride ?? sensor.min ?? 0;
  const max = pane.maxOverride ?? sensor.max ?? 100;
  const pct = Math.max(0, Math.min(100, ((numVal - min) / (max - min)) * 100));
  const label = pane.labelOverride ?? sensor.label;

  return (
    <div className="flex flex-col gap-2.5 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 font-semibold uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: theme.accent }}>
          {numVal.toFixed(1)} <span className="text-[9px] text-white/20 font-medium">{sensor.unit}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: theme.accent }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-white/15 font-medium">
        <span>{min}{sensor.unit}</span>
        <span>{max}{sensor.unit}</span>
      </div>
    </div>
  );
}

import { PidDetailSheet } from "./pid-detail-sheet";

function SwitchWidget({ pane, sensor, value, control, onPublish, onModeChange }: WidgetProps) {
  const pidData = useDashboardStore((s) => s.pidData);
  const [pidSheetOpen, setPidSheetOpen] = useState(false);

  // Determine ON state: respect control's onValue mapping (e.g. heat pad has onValue="false")
  let isOn: boolean;
  if (typeof value === "boolean") {
    isOn = value;
  } else if (control?.mqtt?.onValue !== undefined) {
    isOn = String(value) === String(control.mqtt.onValue);
  } else {
    isOn = value === 1;
  }
  const label = pane.labelOverride ?? sensor.label;
  const mode = control?.mode ?? "off";

  // Schedule countdown — bidirectional (time till off when on, time till on when off)
  const isAutoScheduled = mode === "auto" && !!control?.schedule;
  const schedType = control?.schedule?.type;
  const [scheduleTimes, setScheduleTimes] = useState<{ onTime: Date; offTime: Date } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isAutoScheduled || !control?.schedule) { setScheduleTimes(null); return; }
    const sched = control.schedule;

    const parseTime12 = (str: string): Date | null => {
      const parts = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!parts) return null;
      let h = parseInt(parts[1], 10);
      const m = parseInt(parts[2], 10);
      if (parts[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (parts[3].toUpperCase() === "AM" && h === 12) h = 0;
      const d = new Date(); d.setHours(h, m, 0, 0);
      return d;
    };

    const parseTime24 = (str: string): Date | null => {
      const [hStr, mStr] = str.split(":");
      if (!hStr || !mStr) return null;
      const d = new Date(); d.setHours(parseInt(hStr), parseInt(mStr), 0, 0);
      return d;
    };

    if (schedType === "solar") {
      const srOff = sched.sunriseOffset ?? 0;
      const ssOff = sched.sunsetOffset ?? 0;
      fetch(`/api/solar?sunriseOffset=${srOff}&sunsetOffset=${ssOff}`)
        .then(r => r.json())
        .then(data => {
          const onD = parseTime12(data.adjusted?.sunrise ?? "");
          const offD = parseTime12(data.adjusted?.sunset ?? "");
          if (onD && offD) setScheduleTimes({ onTime: onD, offTime: offD });
        })
        .catch(() => {});
    } else if (schedType === "manual" && sched.onTime && sched.offTime) {
      const onD = parseTime24(sched.onTime);
      const offD = parseTime24(sched.offTime);
      if (onD && offD) setScheduleTimes({ onTime: onD, offTime: offD });
    }
  }, [isAutoScheduled, schedType, control?.schedule?.sunriseOffset, control?.schedule?.sunsetOffset, control?.schedule?.onTime, control?.schedule?.offTime]);

  useEffect(() => {
    if (!isAutoScheduled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isAutoScheduled]);

  // Format countdown
  const fmtCountdown = (ms: number) => {
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  let countdownLabel: string | null = null;
  if (isAutoScheduled && scheduleTimes) {
    if (isOn) {
      const diff = scheduleTimes.offTime.getTime() - now;
      if (diff > 0) countdownLabel = `off in ${fmtCountdown(diff)}`;
    } else {
      // If light is off, show time until it turns on
      let diff = scheduleTimes.onTime.getTime() - now;
      if (diff < 0) diff += 24 * 60 * 60_000; // tomorrow's sunrise
      if (diff > 0) countdownLabel = `on in ${fmtCountdown(diff)}`;
    }
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden min-w-0">
      {/* Header — label + status */}
      <div>
        <p className={cn(
          "text-[13px] font-semibold transition-colors",
          isOn ? "text-white/85" : "text-white/30"
        )}>
          {label}
        </p>
        <p className="text-[9px] text-white/15 font-medium mt-0.5">
          {isOn ? "On" : "Off"}
          {mode === "auto" && " · Auto"}
          {countdownLabel && (
            <span className={cn("ml-1", isOn ? "text-amber-400/40" : "text-emerald-400/40")}> · {countdownLabel}</span>
          )}
        </p>
        {/* PID setpoint chip — shown when auto+pid is configured */}
        {mode === "auto" && control?.pid?.inputSensorId && (
          <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-400/15 max-w-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 shrink-0" />
            <span className="text-[8px] font-semibold text-blue-300/70 tabular-nums truncate">
              {control.pid.setpoint}{sensor.unit ? ` ${sensor.unit}` : "°"}
            </span>
            <span className="text-[7px] text-blue-300/40 font-medium shrink-0">setpoint</span>
          </div>
        )}
      </div>

      {/* Mode Buttons — Off / Auto / On */}
      {control && onModeChange && (
        <div className="flex gap-1.5 min-w-0">
          {(["off", "auto", "on"] as const).map((m) => {
            // In auto mode, highlight on/off to reflect live state
            const isAutoLive = mode === "auto" && (
              (m === "on" && isOn) || (m === "off" && !isOn)
            );

            return (
              <button
                key={m}
                onClick={() => onModeChange(control.id, m)}
                className={cn(
                  "relative flex-1 py-1.5 rounded-lg text-[9px] font-semibold uppercase tracking-[0.12em] transition-all",
                  mode === m
                    ? m === "auto"
                      ? "bg-blue-500/15 text-blue-400 border border-blue-400/15"
                      : m === "on"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-400/15"
                        : "bg-white/[0.08] text-white/50 border border-white/[0.06]"
                    : isAutoLive
                      ? m === "on"
                        ? "bg-emerald-500/8 text-emerald-400/50 border border-emerald-400/8"
                        : "bg-white/[0.04] text-white/30 border border-white/[0.04]"
                      : "bg-white/[0.02] text-white/15 hover:text-white/30 border border-transparent"
                )}
              >
                {m}
                {isAutoLive && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500/20 text-blue-400 text-[6px] font-bold flex items-center justify-center">
                    A
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* PWM Slider */}
      {control?.kind === "pwm" && isOn && (
        <Slider
          value={[typeof value === "number" ? value : 0]}
          onValueChange={(v) => {
            if (control && onPublish) {
              const num = Array.isArray(v) ? v[0] : v;
              onPublish(control.mqtt.controlTopic, String(num));
            }
          }}
          max={100}
          step={1}
          className="w-full"
        />
      )}

      {/* PID Chip — tap to open detail sheet */}
      {control?.autoStrategy === "pid" && pidData[control.id] && (() => {
        const p = pidData[control.id];
        const chipErrorColor =
          Math.abs(p.error) < 1 ? "text-emerald-400" : Math.abs(p.error) < 3 ? "text-amber-400" : "text-red-400";
        return (
          <>
            <button
              onClick={() => setPidSheetOpen(true)}
              className="mt-2 w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all active:scale-[0.98] min-w-0 overflow-hidden"
            >
              <span className="text-[8px] font-bold text-white/25 tracking-wider shrink-0">PID</span>
              <span className={cn("text-[9px] font-mono font-semibold tabular-nums shrink-0", chipErrorColor)}>
                {p.error > 0 ? "+" : ""}{p.error.toFixed(1)}°
              </span>
              <span className="text-[9px] font-mono font-semibold tabular-nums text-emerald-400/60 shrink-0">
                {p.output.toFixed(0)}%
              </span>
              <Settings2 className="w-2.5 h-2.5 text-white/20 shrink-0" />
            </button>
            <PidDetailSheet
              open={pidSheetOpen}
              onClose={() => setPidSheetOpen(false)}
              pid={p}
              controlId={control.id}
              controlLabel={control.label}
            />
          </>
        );
      })()}
    </div>
  );
}

// ─── Chart Widget ────────────────────────────────────────────────────────────

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HistoryPoint {
  value: number;
  ts: number;
}

function ChartWidget({ pane, sensor, value }: WidgetProps) {
  const theme = THEME_COLORS[pane.colorTheme];
  const numVal = typeof value === "number" ? value : 0;
  const label = pane.labelOverride ?? sensor.label;
  const range = pane.chartRange ?? "24h";
  const [points, setPoints] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`/api/history/batch?sensors=${sensor.id}&range=${range}`)
        .then((r) => r.json())
        .then((d) => {
          if (active && d.sensors?.[sensor.id]) {
            setPoints(d.sensors[sensor.id]);
          }
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000); // refresh every 30s
    return () => { active = false; clearInterval(iv); };
  }, [sensor.id, range]);

  // Format time labels
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return range === "7d"
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 font-semibold uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: theme.accent }}>
          {numVal.toFixed(1)} {sensor.unit}
        </span>
      </div>
      <div className="h-24 rounded-xl bg-white/[0.02] overflow-hidden">
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${pane.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={theme.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                tickFormatter={formatTime}
                tick={{ fontSize: 7, fill: "rgba(255,255,255,0.15)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 10,
                  color: "white",
                }}
                labelFormatter={(l: unknown) => formatTime(l as number)}
                formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${sensor.unit}`, label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={theme.accent}
                strokeWidth={1.5}
                fill={`url(#grad-${pane.id})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full gap-1.5">
            <Activity className="w-4 h-4 text-white/10" />
            <span className="text-[9px] text-white/10 font-medium">
              Collecting data…
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <span className="text-[8px] text-white/15 font-medium">{range} range</span>
      </div>
    </div>
  );
}

// ─── Widget Factory ──────────────────────────────────────────────────────────

import { StreamWidget } from "./stream-widget";

// Stream widget wrapper to match WidgetProps signature
function StreamWidgetWrapper({ pane }: WidgetProps) {
  return <StreamWidget pane={pane} />;
}

const WIDGET_MAP: Record<DisplayType, React.ComponentType<WidgetProps>> = {
  gauge: GaugeWidget,
  number: NumberWidget,
  chart: ChartWidget,
  bar: BarWidget,
  switch: SwitchWidget,
  stream: StreamWidgetWrapper,
};

// ─── Temperature Conversion ──────────────────────────────────────────────────

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

/** Apply unit conversion if sensor has a displayUnit preference */
function convertValue(value: number | boolean | null, sensor: SensorDef): {
  displayValue: number | boolean | null;
  displayUnitLabel: string;
} {
  if (
    typeof value === "number" &&
    sensor.displayUnit === "F" &&
    (sensor.unit === "°C" || sensor.unit === "C")
  ) {
    return { displayValue: celsiusToFahrenheit(value), displayUnitLabel: "°F" };
  }
  return { displayValue: value, displayUnitLabel: sensor.unit };
}

// ─── Pane Card Wrapper ───────────────────────────────────────────────────────

export function PaneCard({
  pane,
  sensor,
  value,
  control,
  onPublish,
  onModeChange,
}: PaneCardProps) {
  const Widget = WIDGET_MAP[pane.displayType];
  const theme = THEME_COLORS[pane.colorTheme];

  if (!Widget) return null;

  // Stream panes don't need a sensor — render directly
  if (pane.displayType === "stream") {
    return (
      <motion.div
        variants={item}
        layout
        className={cn(
          "glass rounded-[20px] p-5 transition-all duration-300",
          pane.colSpan === 2 && "col-span-2",
        )}
        style={{ boxShadow: `0 0 24px ${theme.glow}` }}
      >
        <StreamWidget pane={pane} />
      </motion.div>
    );
  }

  // If no sensor, build a stub from control data
  const resolvedSensor: SensorDef = sensor ?? {
    id: control?.id ?? pane.id,
    label: control?.label ?? pane.labelOverride ?? "Control",
    kind: "digital",
    direction: "input",
    mqtt: {
      topic: control?.mqtt.statusTopic ?? "",
      payloadType: "json" as const,
      trueValue: control?.mqtt.onValue ?? "true",
      falseValue: control?.mqtt.offValue ?? "false",
    },
    unit: "",
    min: 0,
    max: 1,
  };

  // When a control is present, use the control's label (not the sensor's)
  const labeledSensor = control
    ? { ...resolvedSensor, label: control.label }
    : resolvedSensor;

  // Apply temperature conversion if configured
  const { displayValue, displayUnitLabel } = convertValue(value, labeledSensor);
  const displaySensor = displayUnitLabel !== labeledSensor.unit
    ? { ...labeledSensor, unit: displayUnitLabel }
    : labeledSensor;

  return (
    <motion.div
      variants={item}
      layout
      className={cn(
        "glass rounded-[20px] p-5 transition-all duration-300",
        pane.colSpan === 2 && "col-span-2",
      )}
      style={{ boxShadow: `0 0 24px ${theme.glow}` }}
    >
      <Widget
        pane={pane}
        sensor={displaySensor}
        value={displayValue}
        control={control}
        onPublish={onPublish}
        onModeChange={onModeChange}
      />
    </motion.div>
  );
}
