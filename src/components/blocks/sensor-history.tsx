"use client";

/**
 * SensorHistory — History panel with control state status bars.
 *
 * Sensor trend lines with an iPhone-style control status strip below
 * the chart. Each control gets a thin bar showing ON periods with
 * an icon indicator — inspired by the iOS battery usage chart.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Activity, ChevronDown, ChevronUp, Sun, Flame, Lightbulb, Droplets, Zap, AlertTriangle, Eye, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { staggerItem as item } from "@/lib/animations";
import type { SensorDef, ControlDef } from "@/lib/schema";

interface ReadingPoint {
  ts: number;
  [sensorId: string]: number;
}

interface RawPoint {
  value: number;
  ts: number;
}

// Color palette for overlaid sensor lines
const LINE_COLORS = [
  "#f97316", // orange
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
];

// Colors for control status bars
const CTRL_COLORS = ["#f97316", "#06b6d4", "#10b981", "#a855f7", "#f59e0b"];

/** Moving-average smoothing — window-based average to eliminate sensor noise */
function smoothData(
  data: ReadingPoint[],
  sensorIds: string[],
  windowSize = 5,
): ReadingPoint[] {
  if (data.length <= windowSize) return data;
  return data.map((point, i) => {
    const smoothed: ReadingPoint = { ts: point.ts };
    for (const id of sensorIds) {
      const halfW = Math.floor(windowSize / 2);
      const start = Math.max(0, i - halfW);
      const end = Math.min(data.length - 1, i + halfW);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= end; j++) {
        const v = data[j][id];
        if (v != null) { sum += v; count++; }
      }
      if (count > 0) smoothed[id] = Math.round((sum / count) * 100) / 100;
    }
    return smoothed;
  });
}

/** Threshold reference line config */
interface ThresholdLine {
  value: number;
  label: string;
  color: string;
  dash: string;
}

// Icon lookup by control icon name or label keyword
const ICON_MAP: Record<string, LucideIcon> = {
  sun: Sun, light: Sun, basking: Sun, bulb: Lightbulb,
  flame: Flame, heat: Flame, pad: Flame,
  droplets: Droplets, water: Droplets, mist: Droplets, fish: Droplets,
  zap: Zap, power: Zap,
};

function getControlIcon(ctrl: ControlDef): LucideIcon {
  // Check explicit icon field first
  if (ctrl.icon) {
    const mapped = ICON_MAP[ctrl.icon.toLowerCase()];
    if (mapped) return mapped;
  }
  // Fall back to label-based guessing
  const label = ctrl.label.toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (label.includes(key)) return icon;
  }
  return Zap; // default
}

interface ControlBand {
  controlId: string;
  x1: number; // start ts (fraction 0-1 of time range)
  x2: number; // end ts (fraction 0-1 of time range)
}

/** Motion band with optional snapshot filmstrip URLs */
interface MotionBand {
  cameraId: string;
  x1: number;
  x2: number;
  snapshots: string[]; // snapshot URLs for hover filmstrip
  startTs: number;
}

/** Motion camera data from /api/history/motion */
interface MotionCameraData {
  label: string;
  events: Array<{ ts: number; motion: number; snapshots: string[] }>;
  beforeRange: { ts: number; motion: number } | null;
}

const RANGES = ["1h", "6h", "24h", "7d"] as const;
type Range = (typeof RANGES)[number];

const RANGE_MS: Record<Range, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

interface SensorHistoryProps {
  sensors: SensorDef[];
  controls?: ControlDef[];
  defaultExpanded?: boolean;
}

export function SensorHistory({ sensors, controls = [], defaultExpanded }: SensorHistoryProps) {
  const numericSensors = sensors.filter((s) => s.kind === "analog");

  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<Range>("1h");
  const [mergedData, setMergedData] = useState<ReadingPoint[]>([]);
  const [controlBandsRaw, setControlBandsRaw] = useState<Map<string, ControlBand[]>>(new Map());
  const [motionData, setMotionData] = useState<Map<string, { label: string; bands: MotionBand[] }>>(new Map());
  const [hoveredMotion, setHoveredMotion] = useState<{ cameraId: string; bandIdx: number; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);

  // Auto-enable ALL numeric sensors whenever sensor list changes (profile switch)
  const sensorKey = numericSensors.map((s) => s.id).join(",");
  useEffect(() => {
    if (numericSensors.length > 0) {
      setEnabledIds(new Set(numericSensors.map((s) => s.id)));
    }
  }, [sensorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSensor = useCallback((id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Unified batch fetch — sensors + controls in a single API call
  useEffect(() => {
    if (enabledIds.size === 0 && controls.length === 0) {
      setMergedData([]);
      setControlBandsRaw(new Map());
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const sensorIds = Array.from(enabledIds);
        const controlIds = controls.map((c) => c.id);

        // Single batch request replaces N+1 individual fetches
        const params = new URLSearchParams({ range });
        if (sensorIds.length > 0) params.set("sensors", sensorIds.join(","));
        if (controlIds.length > 0) params.set("controls", controlIds.join(","));

        const res = await fetch(`/api/history/batch?${params}`);
        const data = await res.json();
        if (!active) return;

        // ── Process sensor data ──
        if (sensorIds.length > 0) {
          const needsF = new Map<string, boolean>();
          for (const s of numericSensors) {
            needsF.set(s.id, s.displayUnit === "F" && (s.unit === "°C" || s.unit === "C"));
          }

          const timeMap = new Map<number, ReadingPoint>();
          for (const id of sensorIds) {
            const points = (data.sensors?.[id] ?? []) as RawPoint[];
            const convert = needsF.get(id) ?? false;
            let lastGood: number | null = null;

            for (const p of points) {
              let val = convert ? Math.round((p.value * 9 / 5 + 32) * 10) / 10 : p.value;

              // Spike filter: drop > 30% from last good reading
              if (lastGood !== null && lastGood > 0) {
                const dropPct = (lastGood - val) / lastGood;
                if (dropPct > 0.3) val = lastGood;
              }
              lastGood = val;

              const key = Math.round(p.ts / 5000) * 5000;
              const existing = timeMap.get(key) ?? { ts: key };
              existing[id] = val;
              timeMap.set(key, existing);
            }
          }

          setMergedData(Array.from(timeMap.values()).sort((a, b) => a.ts - b.ts));
        } else {
          setMergedData([]);
        }

        // ── Process control band data ──
        if (controlIds.length > 0) {
          const now = Date.now();
          const rangeMs = RANGE_MS[range];
          const windowStart = now - rangeMs;
          const bandsMap = new Map<string, ControlBand[]>();

          for (const id of controlIds) {
            const points = (data.controls?.[id] ?? []) as RawPoint[];

            const bands: ControlBand[] = [];
            let onStart: number | null = null;

            // Check if control was ON before the range start
            const beforePoint = data.controlBefore?.[id] as RawPoint | undefined;
            if (beforePoint?.value === 1) {
              onStart = windowStart; // was already ON at range start
            }

            for (const p of points) {
              if (p.value === 1 && onStart === null) {
                onStart = p.ts;
              } else if (p.value === 0 && onStart !== null) {
                bands.push({
                  controlId: id,
                  x1: Math.max(0, (onStart - windowStart) / rangeMs),
                  x2: Math.min(1, (p.ts - windowStart) / rangeMs),
                });
                onStart = null;
              }
            }
            // Still ON → extend to now
            if (onStart !== null) {
              bands.push({
                controlId: id,
                x1: Math.max(0, (onStart - windowStart) / rangeMs),
                x2: 1,
              });
            }
            if (bands.length > 0) bandsMap.set(id, bands);
          }

          setControlBandsRaw(bandsMap);
        } else {
          setControlBandsRaw(new Map());
        }

        // ── Fetch motion events (auto-discovered cameras) ──
        try {
          const motionRes = await fetch(`/api/history/motion?range=${range}`);
          const motionJson = await motionRes.json();
          if (!active) return;

          const motionMap = new Map<string, { label: string; bands: MotionBand[] }>();
          const now2 = Date.now();
          const rangeMs2 = RANGE_MS[range];
          const windowStart2 = now2 - rangeMs2;

          for (const [camId, camData] of Object.entries(motionJson.cameras ?? {})) {
            const cam = camData as MotionCameraData;
            const bands: MotionBand[] = [];
            let onStart: number | null = null;
            let currentSnapshots: string[] = [];
            let currentStartTs = 0;

            // Check if motion was active before range start
            if (cam.beforeRange?.motion === 1) {
              onStart = windowStart2;
              currentStartTs = cam.beforeRange.ts;
            }

            for (const ev of cam.events) {
              if (ev.motion === 1 && onStart === null) {
                onStart = ev.ts;
                currentSnapshots = ev.snapshots;
                currentStartTs = ev.ts;
              } else if (ev.motion === 0 && onStart !== null) {
                bands.push({
                  cameraId: camId,
                  x1: Math.max(0, (onStart - windowStart2) / rangeMs2),
                  x2: Math.min(1, (ev.ts - windowStart2) / rangeMs2),
                  snapshots: currentSnapshots,
                  startTs: currentStartTs,
                });
                onStart = null;
                currentSnapshots = [];
              }
            }
            // Still active → extend to now
            if (onStart !== null) {
              bands.push({
                cameraId: camId,
                x1: Math.max(0, (onStart - windowStart2) / rangeMs2),
                x2: 1,
                snapshots: currentSnapshots,
                startTs: currentStartTs,
              });
            }
            if (bands.length > 0) {
              motionMap.set(camId, { label: cam.label, bands });
            }
          }
          setMotionData(motionMap);
        } catch {
          setMotionData(new Map());
        }
      } catch { /* ignore */ }
      setLoading(false);
    };

    load();
    const iv = setInterval(load, 30_000);
    return () => { active = false; clearInterval(iv); };
  }, [enabledIds, range, controls]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return range === "7d"
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // Build per-control icon+color data
  const controlMeta = useMemo(() => {
    return controls.map((c, i) => ({
      ctrl: c,
      color: c.color ?? CTRL_COLORS[i % CTRL_COLORS.length],
      Icon: getControlIcon(c),
    }));
  }, [controls]);

  if (numericSensors.length === 0) return null;

  // Left margin must match chart YAxis width for alignment
  const chartLeftMargin = 32;

  /** Renders the chart or an empty state — extracted to avoid inline IIFE (Turbopack SWC compat) */
  function renderChart() {
    if (mergedData.length <= 1) {
      return (
        <div className="flex items-center justify-center h-full gap-1.5">
          <Activity className="w-4 h-4 text-white/10" />
          <span className="text-[9px] text-white/10 font-medium">
            {loading ? "Loading…" : enabledIds.size === 0 ? "Select a sensor above" : "Collecting data…"}
          </span>
        </div>
      );
    }

    // Compute Y-axis domain from sensor config
    // NOTE: min/max/warning/critical are stored in the DISPLAY unit (not native),
    // so no C→F conversion needed here.
    const enabledSensors = numericSensors.filter((s) => enabledIds.has(s.id));
    const sensorMin = enabledSensors.length > 0
      ? Math.min(...enabledSensors.map((s) => s.min ?? 0))
      : 0;
    const sensorMax = enabledSensors.length > 0
      ? Math.max(...enabledSensors.map((s) => s.max ?? 100))
      : 100;
    const yDomain: [number, number] = [Math.floor(sensorMin), Math.ceil(sensorMax)];

    // Collect threshold reference lines (values already in display unit)
    const thresholdLines: ThresholdLine[] = [];
    for (const s of enabledSensors) {
      if (s.warningLow != null) thresholdLines.push({ value: s.warningLow, label: `${s.label} Warn Low`, color: "#eab308", dash: "6 3" });
      if (s.warningHigh != null) thresholdLines.push({ value: s.warningHigh, label: `${s.label} Warn High`, color: "#eab308", dash: "6 3" });
      if (s.criticalLow != null) thresholdLines.push({ value: s.criticalLow, label: `${s.label} Crit Low`, color: "#ef4444", dash: "4 2" });
      if (s.criticalHigh != null) thresholdLines.push({ value: s.criticalHigh, label: `${s.label} Crit High`, color: "#ef4444", dash: "4 2" });
    }

    // Smooth data for enabled sensors
    const enabledIds_ = enabledSensors.map((s) => s.id);
    const windowSize = range === "1h" ? 5 : range === "6h" ? 7 : range === "24h" ? 9 : 11;
    const smoothedData = smoothData(mergedData, enabledIds_, windowSize);

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={smoothedData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {numericSensors.map((s, i) => (
              <linearGradient key={s.id} id={`hist-grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0.2} />
                <stop offset="95%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTime}
            tick={{ fontSize: 8, fill: "rgba(255,255,255,0.15)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={50}
            scale="time"
          />
          <YAxis
            tick={{ fontSize: 8, fill: "rgba(255,255,255,0.15)" }}
            axisLine={false}
            tickLine={false}
            width={chartLeftMargin}
            domain={yDomain}
          />
          {/* Threshold reference lines — only rendered when toggled on */}
          {showThresholds && thresholdLines.map((tl, i) => (
            <ReferenceLine
              key={`thresh-${i}`}
              y={tl.value}
              stroke={tl.color}
              strokeDasharray={tl.dash}
              strokeWidth={1}
              label={{
                value: tl.label,
                position: "right",
                fill: tl.color,
                fontSize: 7,
                opacity: 0.7,
              }}
            />
          ))}
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              fontSize: 10,
              color: "white",
              padding: "8px 12px",
            }}
            labelFormatter={(l: unknown) => formatTime(l as number)}
            formatter={(v: unknown, name: unknown) => {
              const sensor = numericSensors.find((s) => s.id === name);
              const unit = sensor?.displayUnit === "F" ? "°F" : sensor?.unit ?? "";
              const val = `${Number(v).toFixed(1)} ${unit}`;
              const label = sensor?.label ?? String(name);

              // Only append threshold rows when the lines are toggled on
              if (!showThresholds || !sensor) return [val, label];
              const parts: string[] = [val];
              if (sensor.warningLow != null)  parts.push(`⚠ Warn Low ${sensor.warningLow}${unit}`);
              if (sensor.warningHigh != null) parts.push(`⚠ Warn High ${sensor.warningHigh}${unit}`);
              if (sensor.criticalLow != null)  parts.push(`🔴 Crit Low ${sensor.criticalLow}${unit}`);
              if (sensor.criticalHigh != null) parts.push(`🔴 Crit High ${sensor.criticalHigh}${unit}`);
              return [parts.join("  ·  "), label];
            }}
          />
          {enabledSensors.map((s) => {
            const idx = numericSensors.indexOf(s);
            const color = LINE_COLORS[idx % LINE_COLORS.length];
            return (
              <Area
                key={s.id}
                type="basis"
                dataKey={s.id}
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#hist-grad-${s.id})`}
                isAnimationActive={false}
                dot={false}
                connectNulls
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <motion.div variants={item} className="glass rounded-[20px] overflow-hidden">
      {/* Header */}
      {!defaultExpanded && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-white/25" />
            <span className="text-[12px] font-semibold text-white/50">Sensor History</span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-white/20" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/20" />
          )}
        </button>
      )}

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Range picker + threshold toggle */}
          <div className="flex gap-1 items-center">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-semibold uppercase transition-all",
                  range === r
                    ? "bg-white/[0.08] text-white/60"
                    : "text-white/20 hover:text-white/30"
                )}
              >
                {r}
              </button>
            ))}
            {/* Threshold toggle — amber when active */}
            <button
              onClick={() => setShowThresholds((v) => !v)}
              title={showThresholds ? "Hide threshold lines" : "Show threshold lines"}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-semibold transition-all ml-auto",
                showThresholds
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                  : "text-white/20 hover:text-white/30 border border-transparent"
              )}
            >
              <AlertTriangle className="w-3 h-3" />
            </button>
          </div>

          {/* Sensor toggles */}
          <div className="flex flex-wrap gap-1.5">
            {numericSensors.map((s, i) => {
              const color = LINE_COLORS[i % LINE_COLORS.length];
              const on = enabledIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSensor(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-semibold transition-all",
                    on
                      ? "bg-white/[0.08] text-white/60"
                      : "text-white/20 hover:text-white/30"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: on ? color : "rgba(255,255,255,0.1)",
                    }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Chart */}
          <div className={cn("rounded-xl bg-white/[0.02] overflow-hidden", defaultExpanded ? "h-64" : "h-48")}>
            {renderChart()}
          </div>

          {/* Control status bars — iPhone-style strips below the chart */}
          {controlMeta.length > 0 && (
            <div className="space-y-1" style={{ paddingLeft: chartLeftMargin }}>
              {controlMeta.map(({ ctrl, color, Icon }) => {
                const bands = controlBandsRaw.get(ctrl.id) ?? [];
                return (
                  <div key={ctrl.id} className="flex items-center gap-2">
                    <div className="relative h-3 flex-1 rounded-full overflow-hidden bg-white/[0.03]">
                      {bands.map((band, i) => (
                        <div
                          key={i}
                          className="absolute top-0 h-full rounded-full"
                          style={{
                            left: `${band.x1 * 100}%`,
                            width: `${Math.max(0.5, (band.x2 - band.x1) * 100)}%`,
                            backgroundColor: color,
                            opacity: 0.5,
                          }}
                        >
                          {/* Icon centered in the band if wide enough */}
                          {(band.x2 - band.x1) > 0.03 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Icon className="w-2 h-2" style={{ color: "white", opacity: 0.9 }} />
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Show icon at the right edge if currently ON (last band extends to 1) */}
                      {bands.length > 0 && bands[bands.length - 1].x2 >= 0.99 && (
                        <div className="absolute right-0.5 top-0 h-full flex items-center">
                          <Icon className="w-2.5 h-2.5" style={{ color, opacity: 0.8 }} />
                        </div>
                      )}
                    </div>
                    <span className="text-[7px] text-white/20 font-medium w-12 text-right shrink-0 truncate">
                      {ctrl.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Motion detection strips — auto-discovered from ONVIF cameras */}
          {motionData.size > 0 && (
            <div className="space-y-1 relative" style={{ paddingLeft: chartLeftMargin }}>
              {Array.from(motionData.entries()).map(([camId, { label, bands }]) => (
                <div key={camId} className="flex items-center gap-2">
                  <div className="relative h-3 flex-1 rounded-full overflow-hidden bg-white/[0.03]">
                    {bands.map((band, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full rounded-full cursor-pointer transition-opacity"
                        style={{
                          left: `${band.x1 * 100}%`,
                          width: `${Math.max(0.5, (band.x2 - band.x1) * 100)}%`,
                          backgroundColor: "#f43f5e",
                          opacity: hoveredMotion?.cameraId === camId && hoveredMotion?.bandIdx === i ? 0.8 : 0.4,
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredMotion({ cameraId: camId, bandIdx: i, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setHoveredMotion(null)}
                      >
                        {(band.x2 - band.x1) > 0.03 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Eye className="w-2 h-2" style={{ color: "white", opacity: 0.9 }} />
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Active motion indicator */}
                    {bands.length > 0 && bands[bands.length - 1].x2 >= 0.99 && (
                      <div className="absolute right-0.5 top-0 h-full flex items-center">
                        <Eye className="w-2.5 h-2.5 animate-pulse" style={{ color: "#f43f5e", opacity: 0.8 }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[7px] text-white/20 font-medium w-12 text-right shrink-0 truncate">
                    {label}
                  </span>
                </div>
              ))}

              {/* Hover thumbnail popup */}
              {hoveredMotion && (() => {
                const camData = motionData.get(hoveredMotion.cameraId);
                const band = camData?.bands[hoveredMotion.bandIdx];
                if (!band || band.snapshots.length === 0) return null;
                // Show first snapshot as preview thumbnail
                const previewUrl = band.snapshots[0];
                const time = new Date(band.startTs);
                const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, "0")}:${String(time.getSeconds()).padStart(2, "0")}`;
                return (
                  <div
                    className="absolute z-50 -top-36 left-1/2 -translate-x-1/2 pointer-events-none"
                    style={{ left: hoveredMotion.x }}
                  >
                    <div className="bg-black/90 backdrop-blur-sm rounded-lg border border-white/10 p-1.5 shadow-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Motion snapshot"
                        className="w-32 h-24 object-cover rounded"
                      />
                      <div className="flex items-center justify-between mt-1 px-0.5">
                        <span className="text-[8px] text-white/50 font-mono">{timeStr}</span>
                        <span className="text-[8px] text-rose-400/70">{band.snapshots.length} frames</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
