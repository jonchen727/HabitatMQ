/**
 * PID Schedule Editor — Natural Cycle + Static mode switcher
 *
 * Renders inside the PID section of ControlEditor. Allows switching between
 * Static (single setpoint) and Natural Cycle (climate-driven seasonal/diurnal).
 * In Natural Cycle mode, fetches climate data from /api/climate, auto-derives
 * seasons, and lets the user set min/max safe bounds + per-season overrides.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Sun, Leaf, Snowflake, CloudSun, RefreshCw, ChevronDown, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PidConfig,
  NaturalCycleSeason,
  NaturalCycleSeasonId,
  ClimateDataCache,
  BrumationOverride,
} from "@/lib/schema";

interface PidScheduleEditorProps {
  pid: PidConfig;
  onChange: (updater: (prev: PidConfig) => PidConfig) => void;
}

// Season metadata for display
const SEASON_META: Record<NaturalCycleSeasonId, { label: string; icon: typeof Sun; color: string; months: string }> = {
  spring: { label: "Spring", icon: Leaf, color: "emerald", months: "Mar – May" },
  summer: { label: "Summer", icon: Sun, color: "amber", months: "Jun – Aug" },
  fall:   { label: "Fall",   icon: CloudSun, color: "orange", months: "Sep – Nov" },
  winter: { label: "Winter", icon: Snowflake, color: "sky", months: "Dec – Feb" },
};

const SEASON_ORDER: NaturalCycleSeasonId[] = ["spring", "summer", "fall", "winter"];

// Determine the current season based on date
function getCurrentSeasonId(): NaturalCycleSeasonId {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

// Build default seasons from climate data + bounds
function buildDefaultSeasons(
  climate: ClimateDataCache,
  minSP: number,
  maxSP: number,
): NaturalCycleSeason[] {
  const seasonMonths: Record<NaturalCycleSeasonId, number[]> = {
    spring: [2, 3, 4],
    summer: [5, 6, 7],
    fall:   [8, 9, 10],
    winter: [11, 0, 1],
  };

  function scale(raw: number): number {
    if (climate.annualMaxF === climate.annualMinF) return (minSP + maxSP) / 2;
    const normalized = (raw - climate.annualMinF) / (climate.annualMaxF - climate.annualMinF);
    const clamped = Math.max(0, Math.min(1, normalized));
    return Math.round((minSP + clamped * (maxSP - minSP)) * 10) / 10;
  }

  return SEASON_ORDER.map(id => {
    const months = seasonMonths[id];
    const avgHigh = months.reduce((a, m) => a + climate.monthlyAvgHighF[m], 0) / months.length;
    const avgLow = months.reduce((a, m) => a + climate.monthlyAvgLowF[m], 0) / months.length;
    return {
      id,
      dayPeakF: scale(avgHigh),
      nightLowF: scale(avgLow),
      peakOffsetMinutes: 60,
      ramp: true,
      enabled: true,
    };
  });
}

export function PidScheduleEditor({ pid, onChange }: PidScheduleEditorProps) {
  const mode = pid.scheduleMode === "natural" ? "natural" : "static";
  const [climateData, setClimateData] = useState<ClimateDataCache | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<NaturalCycleSeasonId | null>(null);
  const [brumationOpen, setBrumationOpen] = useState(false);

  const currentSeason = getCurrentSeasonId();

  // Fetch climate data from the cached API
  const fetchClimate = useCallback(async (force = false) => {
    // We need habitat location — for now read from /api/location
    setLoading(true);
    setError(null);
    try {
      const locRes = await fetch("/api/location");
      if (!locRes.ok) throw new Error("Location not configured");
      const loc = await locRes.json();
      const lat = loc.habitatLatitude ?? loc.latitude;
      const lng = loc.habitatLongitude ?? loc.longitude;

      const climateRes = await fetch(`/api/climate?lat=${lat}&lng=${lng}${force ? "&force=true" : ""}`);
      if (!climateRes.ok) throw new Error("Failed to fetch climate data");
      const data = await climateRes.json() as ClimateDataCache;
      setClimateData(data);

      // If we don't have natural cycle config yet, initialize from climate data
      if (!pid.naturalCycle) {
        const minSP = 75;
        const maxSP = 90;
        const seasons = buildDefaultSeasons(data, minSP, maxSP);
        onChange(p => ({
          ...p,
          naturalCycle: {
            minSetpointF: minSP,
            maxSetpointF: maxSP,
            seasons,
            transitionDays: 14,
          },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [pid.naturalCycle, onChange]);

  // Auto-fetch climate data when switching to natural mode
  useEffect(() => {
    if (mode === "natural" && !climateData && !loading) {
      fetchClimate();
    }
  }, [mode, climateData, loading, fetchClimate]);

  const nc = pid.naturalCycle;
  const brumation = pid.brumation;

  // Helper to update a single season
  const updateSeason = (seasonId: NaturalCycleSeasonId, updates: Partial<NaturalCycleSeason>) => {
    onChange(p => ({
      ...p,
      naturalCycle: p.naturalCycle ? {
        ...p.naturalCycle,
        seasons: p.naturalCycle.seasons.map(s =>
          s.id === seasonId ? { ...s, ...updates } : s
        ),
      } : p.naturalCycle,
    }));
  };

  // Recalculate all season temps from climate data when bounds change
  const recalculateFromBounds = (minSP: number, maxSP: number) => {
    if (!climateData) return;
    const seasons = buildDefaultSeasons(climateData, minSP, maxSP);
    onChange(p => ({
      ...p,
      naturalCycle: p.naturalCycle ? {
        ...p.naturalCycle,
        minSetpointF: minSP,
        maxSetpointF: maxSP,
        seasons,
      } : p.naturalCycle,
    }));
  };

  return (
    <div className="space-y-3">
      {/* ── Mode Toggle ── */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04]">
        <button
          onClick={() => onChange(p => ({ ...p, scheduleMode: "static" }))}
          className={cn(
            "flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all",
            mode === "static"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/30 hover:text-white/50"
          )}
        >
          Static
        </button>
        <button
          onClick={() => onChange(p => ({ ...p, scheduleMode: "natural" }))}
          className={cn(
            "flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all flex items-center justify-center gap-1",
            mode === "natural"
              ? "bg-gradient-to-r from-emerald-500/20 to-amber-500/20 text-emerald-300 shadow-sm"
              : "text-white/30 hover:text-white/50"
          )}
        >
          <Sun className="w-3 h-3" />
          Natural Cycle
        </button>
      </div>

      {/* ── Static Mode ── */}
      {mode === "static" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[9px] text-white/30 uppercase tracking-wider">Setpoint (°F)</span>
            <input
              type="text"
              inputMode="decimal"
              value={pid.setpoint}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '');
                onChange(p => ({ ...p, setpoint: parseFloat(v) || 0 }));
              }}
              className="input-field mt-1"
            />
          </label>
        </div>
      )}

      {/* ── Natural Cycle Mode ── */}
      {mode === "natural" && (
        <div className="space-y-3">
          {/* Fallback setpoint label */}
          <label className="block">
            <span className="text-[9px] text-white/20 uppercase tracking-wider">Fallback Setpoint (°F)</span>
            <input
              type="text"
              inputMode="decimal"
              value={pid.setpoint}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '');
                onChange(p => ({ ...p, setpoint: parseFloat(v) || 0 }));
              }}
              className="input-field mt-1 opacity-50"
            />
            <span className="text-[8px] text-white/15 mt-0.5 block">Used when natural cycle can't resolve</span>
          </label>

          {/* ── Safe Operating Range ── */}
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-2">
            <p className="text-[9px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1">
              <Thermometer className="w-3 h-3" />
              Safe Operating Range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] text-white/25">Min (°F)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={nc?.minSetpointF ?? 75}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 75;
                    recalculateFromBounds(val, nc?.maxSetpointF ?? 90);
                  }}
                  className="input-field mt-0.5"
                />
              </label>
              <label className="block">
                <span className="text-[9px] text-white/25">Max (°F)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={nc?.maxSetpointF ?? 90}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 90;
                    recalculateFromBounds(nc?.minSetpointF ?? 75, val);
                  }}
                  className="input-field mt-0.5"
                />
              </label>
            </div>
            <p className="text-[7px] text-white/15">
              All setpoints are clamped to this range. Climate data is scaled to fit.
            </p>
          </div>

          {/* ── Climate Data Status ── */}
          <div className="flex items-center justify-between">
            <div className="text-[8px] text-white/20">
              {loading ? (
                <span className="animate-pulse">Fetching climate data…</span>
              ) : climateData ? (
                <span>
                  Climate: {climateData.annualMinF}°F – {climateData.annualMaxF}°F
                  {Boolean((climateData as Record<string, unknown>).cached) && " (cached)"}
                </span>
              ) : error ? (
                <span className="text-red-400/60">{error}</span>
              ) : (
                <span>No climate data</span>
              )}
            </div>
            <button
              onClick={() => fetchClimate(true)}
              disabled={loading}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              title="Refresh climate data"
            >
              <RefreshCw className={cn("w-3 h-3 text-white/20", loading && "animate-spin")} />
            </button>
          </div>

          {/* ── Season Cards ── */}
          {nc && (
            <div className="space-y-2">
              {SEASON_ORDER.map(seasonId => {
                const season = nc.seasons.find(s => s.id === seasonId);
                if (!season) return null;
                const meta = SEASON_META[seasonId];
                const Icon = meta.icon;
                const isActive = currentSeason === seasonId;
                const isExpanded = expandedSeason === seasonId;

                // Find raw climate temps for hint display
                const seasonMonths: Record<NaturalCycleSeasonId, number[]> = {
                  spring: [2, 3, 4], summer: [5, 6, 7],
                  fall: [8, 9, 10], winter: [11, 0, 1],
                };
                let rawHighHint = "";
                let rawLowHint = "";
                if (climateData) {
                  const months = seasonMonths[seasonId];
                  const avgH = months.reduce((a, m) => a + climateData.monthlyAvgHighF[m], 0) / months.length;
                  const avgL = months.reduce((a, m) => a + climateData.monthlyAvgLowF[m], 0) / months.length;
                  rawHighHint = `raw: ${Math.round(avgH)}°F`;
                  rawLowHint = `raw: ${Math.round(avgL)}°F`;
                }

                return (
                  <div
                    key={seasonId}
                    className={cn(
                      "rounded-lg border transition-all",
                      isActive
                        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                        : "border-white/[0.06] bg-white/[0.02]",
                      !season.enabled && "opacity-40",
                    )}
                  >
                    {/* Season Header */}
                    <button
                      className="w-full flex items-center gap-2 p-3 text-left"
                      onClick={() => setExpandedSeason(isExpanded ? null : seasonId)}
                    >
                      <Icon className={cn("w-4 h-4", `text-${meta.color}-400/60`)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-white/70">{meta.label}</span>
                          <span className="text-[8px] text-white/20">{meta.months}</span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded-full text-[7px] font-bold bg-emerald-500/15 text-emerald-400">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-white/30 mt-0.5">
                          Day: {season.dayPeakF}°F · Night: {season.nightLowF}°F
                        </div>
                      </div>
                      <ChevronDown className={cn(
                        "w-3 h-3 text-white/15 transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </button>

                    {/* Expanded Season Config */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04]">
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <label className="block">
                            <span className="text-[8px] text-white/25">
                              Day Peak (°F)
                              {rawHighHint && <span className="text-white/15 ml-1">({rawHighHint})</span>}
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              value={season.dayPeakF}
                              onChange={(e) => updateSeason(seasonId, { dayPeakF: parseFloat(e.target.value) || 80 })}
                              className="input-field mt-0.5 text-[11px]"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[8px] text-white/25">
                              Night Low (°F)
                              {rawLowHint && <span className="text-white/15 ml-1">({rawLowHint})</span>}
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              value={season.nightLowF}
                              onChange={(e) => updateSeason(seasonId, { nightLowF: parseFloat(e.target.value) || 75 })}
                              className="input-field mt-0.5 text-[11px]"
                            />
                          </label>
                        </div>

                        {/* Peak Offset */}
                        <label className="block">
                          <span className="text-[8px] text-white/25">
                            Peak offset: +{season.peakOffsetMinutes ?? 60}min after solar noon
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={180}
                            step={15}
                            value={season.peakOffsetMinutes ?? 60}
                            onChange={(e) => updateSeason(seasonId, { peakOffsetMinutes: parseInt(e.target.value) })}
                            className="w-full accent-orange-400 mt-0.5"
                          />
                        </label>

                        {/* Ramp + Enable toggles */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={season.ramp ?? true}
                              onChange={(e) => updateSeason(seasonId, { ramp: e.target.checked })}
                              className="accent-orange-400"
                            />
                            <span className="text-[8px] text-white/25">Smooth ramp</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={season.enabled ?? true}
                              onChange={(e) => updateSeason(seasonId, { enabled: e.target.checked })}
                              className="accent-emerald-400"
                            />
                            <span className="text-[8px] text-white/25">Enabled</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Transition Blend ── */}
          {nc && (
            <label className="block">
              <span className="text-[8px] text-white/25">
                Season transition blend: {nc.transitionDays ?? 14} days
              </span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={nc.transitionDays ?? 14}
                onChange={(e) => onChange(p => ({
                  ...p,
                  naturalCycle: p.naturalCycle ? {
                    ...p.naturalCycle,
                    transitionDays: parseInt(e.target.value),
                  } : p.naturalCycle,
                }))}
                className="w-full accent-emerald-400 mt-0.5"
              />
            </label>
          )}
        </div>
      )}

      {/* ── Brumation Override (always visible) ── */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <button
          className="w-full flex items-center gap-2 p-3 text-left"
          onClick={() => setBrumationOpen(!brumationOpen)}
        >
          <Snowflake className="w-3.5 h-3.5 text-sky-400/50" />
          <span className="text-[9px] font-semibold text-white/40 flex-1">Brumation Override</span>
          {brumation?.enabled && (
            <span className="px-1.5 py-0.5 rounded-full text-[7px] font-bold bg-sky-500/15 text-sky-400">
              ACTIVE
            </span>
          )}
          <ChevronDown className={cn(
            "w-3 h-3 text-white/15 transition-transform",
            brumationOpen && "rotate-180"
          )} />
        </button>

        {brumationOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04]">
            <label className="flex items-center gap-2 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={brumation?.enabled ?? false}
                onChange={(e) => onChange(p => ({
                  ...p,
                  brumation: {
                    enabled: e.target.checked,
                    targetTempF: p.brumation?.targetTempF ?? 60,
                    rampDownDays: p.brumation?.rampDownDays ?? 7,
                    rampUpDays: p.brumation?.rampUpDays ?? 7,
                    photoperiodHours: p.brumation?.photoperiodHours ?? 8,
                    suppressFeedingReminders: p.brumation?.suppressFeedingReminders ?? true,
                    startDate: p.brumation?.startDate,
                    endDate: p.brumation?.endDate,
                  },
                }))}
                className="accent-sky-400"
              />
              <span className="text-[9px] text-white/40">Enable brumation mode</span>
            </label>

            {brumation?.enabled && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[8px] text-white/25">Target Temp (°F)</span>
                    <input
                      type="number"
                      step="1"
                      value={brumation.targetTempF}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, targetTempF: parseFloat(e.target.value) || 60 } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[8px] text-white/25">Photoperiod (hrs)</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="24"
                      value={brumation.photoperiodHours}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, photoperiodHours: parseFloat(e.target.value) || 8 } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[8px] text-white/25">Ramp Down (days)</span>
                    <input
                      type="number"
                      step="1"
                      value={brumation.rampDownDays}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, rampDownDays: parseInt(e.target.value) || 7 } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[8px] text-white/25">Ramp Up (days)</span>
                    <input
                      type="number"
                      step="1"
                      value={brumation.rampUpDays}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, rampUpDays: parseInt(e.target.value) || 7 } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[8px] text-white/25">Start Date</span>
                    <input
                      type="date"
                      value={brumation.startDate ?? ""}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, startDate: e.target.value || undefined } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[8px] text-white/25">End Date</span>
                    <input
                      type="date"
                      value={brumation.endDate ?? ""}
                      onChange={(e) => onChange(p => ({
                        ...p,
                        brumation: p.brumation ? { ...p.brumation, endDate: e.target.value || undefined } : p.brumation,
                      }))}
                      className="input-field mt-0.5 text-[11px]"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={brumation.suppressFeedingReminders ?? true}
                    onChange={(e) => onChange(p => ({
                      ...p,
                      brumation: p.brumation ? { ...p.brumation, suppressFeedingReminders: e.target.checked } : p.brumation,
                    }))}
                    className="accent-sky-400"
                  />
                  <span className="text-[8px] text-white/25">Suppress feeding reminders</span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sensor Offset ── */}
      <label className="block">
        <span className="text-[8px] text-white/25">
          Sensor Offset: {pid.sensorOffset >= 0 ? "+" : ""}{pid.sensorOffset}°F
          {pid.sensorOffsetLabel && ` (${pid.sensorOffsetLabel})`}
        </span>
        <input
          type="number"
          step="0.5"
          value={pid.sensorOffset ?? 0}
          onChange={(e) => onChange(p => ({ ...p, sensorOffset: parseFloat(e.target.value) || 0 }))}
          className="input-field mt-0.5"
        />
        <span className="text-[7px] text-white/15 block mt-0.5">
          Compensate for probe depth — e.g., +10 if probe reads 10°F below surface
        </span>
      </label>
    </div>
  );
}
