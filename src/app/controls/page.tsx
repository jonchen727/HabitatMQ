/**
 * Controls Page — Dynamic controls driven by ControlDef from the DB.
 *
 * Each control shows: label, MQTT status, mode switcher (On/Off/Auto),
 * and schedule info when in auto mode.
 */

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardStore } from "@/store/use-dashboard-store";
import { useProfileStore } from "@/store/use-profile-store";
import { ProfileSwitcher } from "@/components/blocks/profile-switcher";
import { cn } from "@/lib/utils";
import { ControlEditor } from "@/components/blocks/control-editor";
import {
  Sun, Moon, Clock, Plus, Pencil, Trash2,
  Power, Zap, Calendar, Settings2, Sunrise, Sunset,
  RotateCcw, Timer,
} from "lucide-react";
import type { ControlDef } from "@/lib/schema";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

interface SolarTimes {
  base: { sunrise: string; sunset: string };
  adjusted: { sunrise: string; sunset: string; sunriseOffset: number; sunsetOffset: number };
}

interface TimerData {
  [controlId: string]: { isOn: boolean; since: number; totalHours: number };
}

/** Format elapsed ms into "Xh Ym" or "Xm Ys" */
function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function ControlsPage() {
  const {
    sensors, controls, liveData, isLoaded,
    fetchAll, startPolling, publish, ingestReading,
    addControl, updateControl, removeControl,
  } = useDashboardStore();
  const { activeProfileId } = useProfileStore();

  // Reload data when profile switches
  useEffect(() => { fetchAll(activeProfileId); }, [fetchAll, activeProfileId]);

  // Build topic → sensorId map so we can look up liveData by control's statusTopic
  const topicToSensorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sensors) m[s.mqtt.topic] = s.id;
    return m;
  }, [sensors]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingControl, setEditingControl] = useState<ControlDef | null>(null);
  const [solarTimes, setSolarTimes] = useState<Record<string, SolarTimes>>({});
  const [timers, setTimers] = useState<TimerData>({});
  const [now, setNow] = useState(Date.now());
  const [editingTimerCtrl, setEditingTimerCtrl] = useState<string | null>(null);
  const [editingTimerValue, setEditingTimerValue] = useState("");

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!isLoaded) return;
    return startPolling();
  }, [isLoaded, startPolling]);

  // Fetch solar times for controls in solar auto mode
  useEffect(() => {
    if (!isLoaded) return;
    const solarControls = controls.filter(
      (c) => c.mode === "auto" && c.schedule?.type === "solar"
    );
    solarControls.forEach(async (ctrl) => {
      try {
        const srOff = ctrl.schedule?.sunriseOffset ?? 0;
        const ssOff = ctrl.schedule?.sunsetOffset ?? 0;
        const res = await fetch(`/api/solar?sunriseOffset=${srOff}&sunsetOffset=${ssOff}`);
        if (res.ok) {
          const data = await res.json();
          setSolarTimes((prev) => ({ ...prev, [ctrl.id]: data }));
        }
      } catch { /* silent */ }
    });
  }, [isLoaded, controls]);

  // Poll timers every 5s, tick display every 1s
  useEffect(() => {
    if (!isLoaded) return;
    const fetchTimers = async () => {
      try {
        const res = await fetch("/api/controls/timers");
        if (res.ok) setTimers(await res.json());
      } catch { /* silent */ }
    };
    fetchTimers();
    const timerPoll = setInterval(fetchTimers, 5000);
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timerPoll); clearInterval(tickInterval); };
  }, [isLoaded]);

  const handleModeChange = useCallback(
    async (ctrl: ControlDef, mode: "on" | "off" | "auto") => {
      const updated = { ...ctrl, mode };
      await updateControl(ctrl.id, updated);

      if (mode === "on" || mode === "off") {
        const shouldBeOn = mode === "on";
        // Only publish to controlTopic — statusTopic is the device's read-back topic (never written by us)
        publish(ctrl.mqtt.controlTopic, shouldBeOn ? ctrl.mqtt.onValue : ctrl.mqtt.offValue);
        // Optimistic UI update so we don't wait for the device to echo back on statusTopic
        const statusSensorId = sensors.find(s => s.mqtt.topic === ctrl.mqtt.statusTopic)?.id;
        if (statusSensorId) ingestReading(statusSensorId, shouldBeOn);
      }
      // Force an immediate scheduler tick so timers and state update instantly
      try { await fetch("/api/controls/tick", { method: "POST" }); } catch { /* next tick */ }
    },
    [updateControl, publish, ingestReading, sensors]
  );

  const handleResetTimer = useCallback(async (controlId: string) => {
    try {
      await fetch("/api/controls/timers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId }),
      });
      setTimers((prev) => ({
        ...prev,
        [controlId]: { ...prev[controlId], since: Date.now() },
      }));
    } catch { /* silent */ }
  }, []);

  const handleSetHours = useCallback(async (controlId: string, hours: number) => {
    try {
      await fetch("/api/controls/timers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId, hours }),
      });
      setTimers((prev) => ({
        ...prev,
        [controlId]: { ...prev[controlId], since: Date.now() - hours * 3_600_000 },
      }));
    } catch { /* silent */ }
    setEditingTimerCtrl(null);
  }, []);

  const handleSaveControl = useCallback(async (ctrl: ControlDef) => {
    if (editingControl) {
      await updateControl(ctrl.id, ctrl);
    } else {
      await addControl(ctrl);
    }
    setEditingControl(null);
  }, [editingControl, updateControl, addControl]);

  const handleDeleteControl = useCallback(async (id: string) => {
    await removeControl(id);
  }, [removeControl]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-white/15 animate-pulse text-sm font-light">Loading…</div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 pt-5 pb-24">
      <motion.div variants={item} className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none">Controls</h1>
          <ProfileSwitcher />
        </div>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => { setEditingControl(null); setEditorOpen(true); }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400/80 px-3.5 py-2 rounded-xl glass-green touch-card"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </motion.button>
      </motion.div>

      {controls.length === 0 ? (
        <motion.div variants={item} className="glass rounded-[20px] p-8 flex flex-col items-center gap-3 text-center">
          <Power className="w-8 h-8 text-white/10" />
          <p className="text-[12px] text-white/25">No controls configured</p>
          <button
            onClick={() => { setEditingControl(null); setEditorOpen(true); }}
            className="text-[11px] font-semibold text-emerald-400/60 hover:text-emerald-400"
          >
            + Add your first control
          </button>
        </motion.div>
      ) : (
        <motion.div variants={container} className="space-y-3">
          {controls.map((ctrl) => {
            const statusSensorId = topicToSensorId[ctrl.mqtt.statusTopic];
            const statusValue = statusSensorId ? liveData[statusSensorId]?.value : liveData[ctrl.mqtt.statusTopic]?.value;
            const timer = timers[ctrl.id];

            // Determine isOn: prefer live MQTT value, fall back to scheduler timer state
            let isOn: boolean;
            if (statusValue !== undefined && statusValue !== null) {
              isOn = statusValue === true || statusValue === 1 || String(statusValue) === ctrl.mqtt.onValue;
            } else if (timer) {
              // No MQTT sensor for this control — use scheduler's authoritative state
              isOn = timer.isOn;
            } else {
              isOn = ctrl.mode === "on"; // last resort: trust mode
            }

            // Compute on-hours: prefer API totalHours, fall back to MQTT sensor
            const mqttHoursValue = ctrl.hoursSensorId ? liveData[ctrl.hoursSensorId]?.value : null;
            const displayHours = mqttHoursValue != null ? Number(mqttHoursValue) : (timer?.totalHours ?? null);

            // Cycle elapsed (time in current state since last transition)
            const elapsed = timer ? now - timer.since : null;

            return (
              <motion.div
                key={ctrl.id}
                variants={item}
                className={cn(
                  "glass rounded-[20px] p-5 touch-card transition-all duration-300",
                  isOn && "!bg-white/[0.06] !border-emerald-400/12"
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center transition-all",
                      isOn ? "bg-emerald-500/10" : "bg-white/[0.03]"
                    )}>
                      <Zap className={cn("w-5 h-5", isOn ? "text-emerald-400" : "text-white/15")} />
                    </div>
                    <div>
                      <p className={cn(
                        "text-[13px] font-semibold",
                        isOn ? "text-white/85" : "text-white/30"
                      )}>
                        {ctrl.label}
                      </p>
                      <p className="text-[9px] text-white/15 font-medium mt-0.5">
                        {isOn ? "On" : "Off"} · {ctrl.mode === "auto" ? "Auto" : ctrl.mode.charAt(0).toUpperCase() + ctrl.mode.slice(1)}
                        {displayHours != null && ` · ${displayHours.toFixed(1)}h on`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingControl(ctrl); setEditorOpen(true); }}
                      className="p-2 rounded-xl hover:bg-white/[0.06]"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-white/20" />
                    </button>
                    <button
                      onClick={() => handleDeleteControl(ctrl.id)}
                      className="p-2 rounded-xl hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white/15" />
                    </button>
                  </div>
                </div>

                {/* Timer Bar — total hours + cycle elapsed */}
                <div className="flex items-center justify-between mt-3 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    {/* Total hours (tappable to edit) */}
                    {editingTimerCtrl === ctrl.id ? (
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-400/50" />
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          autoFocus
                          value={editingTimerValue}
                          onChange={(e) => setEditingTimerValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = parseFloat(editingTimerValue);
                              if (!isNaN(val) && val >= 0) handleSetHours(ctrl.id, val);
                            }
                            if (e.key === "Escape") setEditingTimerCtrl(null);
                          }}
                          onBlur={() => {
                            const val = parseFloat(editingTimerValue);
                            if (!isNaN(val) && val >= 0) handleSetHours(ctrl.id, val);
                            else setEditingTimerCtrl(null);
                          }}
                          className="w-16 text-[11px] font-semibold tabular-nums text-amber-400 bg-white/[0.06] border border-amber-400/20 rounded-lg px-2 py-0.5 outline-none focus:border-amber-400/40"
                        />
                        <span className="text-[8px] text-white/15">hrs</span>
                      </div>
                    ) : displayHours != null ? (
                      <button
                        onClick={() => {
                          setEditingTimerCtrl(ctrl.id);
                          setEditingTimerValue(displayHours.toFixed(1));
                        }}
                        className="flex items-center gap-1.5 hover:bg-white/[0.04] rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors group"
                        title="Click to edit hours"
                      >
                        <Zap className="w-3 h-3 text-amber-400/50" />
                        <span className="text-[11px] font-semibold tabular-nums text-amber-400/60">
                          {displayHours.toFixed(1)}h
                        </span>
                        <span className="text-[8px] text-white/15">on</span>
                        <Pencil className="w-2.5 h-2.5 text-white/0 group-hover:text-white/20 transition-colors" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTimerCtrl(ctrl.id);
                          setEditingTimerValue("0");
                        }}
                        className="flex items-center gap-1.5 text-[10px] text-white/20 hover:text-white/40 transition-colors"
                      >
                        <Zap className="w-3 h-3" />
                        Set hours
                      </button>
                    )}
                    {/* Cycle timer (time in current state) */}
                    {elapsed !== null && (
                      <div className="flex items-center gap-1.5">
                        <Timer className={cn("w-3 h-3", isOn ? "text-emerald-400/50" : "text-white/15")} />
                        <span className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          isOn ? "text-emerald-400/60" : "text-white/25"
                        )}>
                          {formatElapsed(elapsed)}
                        </span>
                        <span className="text-[8px] text-white/15">
                          {isOn ? "on" : "off"}
                        </span>
                      </div>
                    )}
                  </div>
                  {elapsed !== null && (
                    <button
                      onClick={() => handleResetTimer(ctrl.id)}
                      className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
                      title="Reset timer"
                    >
                      <RotateCcw className="w-3 h-3 text-white/20" />
                    </button>
                  )}
                </div>

                {/* Mode Buttons */}
                <div className="flex gap-2 mt-3">
                  {(["off", "on", "auto"] as const).map((m) => {
                    // In auto mode, show live state on the on/off buttons with "A" badge
                    const isAutoLive = ctrl.mode === "auto" && (
                      (m === "on" && isOn) || (m === "off" && !isOn)
                    );

                    return (
                      <button
                        key={m}
                        onClick={() => handleModeChange(ctrl, m)}
                        className={cn(
                          "relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all touch-card",
                          ctrl.mode === m
                            ? m === "auto" ? "bg-blue-500/15 text-blue-400 border border-blue-400/15"
                              : m === "on" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-400/15"
                              : "bg-white/[0.06] text-white/40 border border-white/[0.06]"
                            : isAutoLive
                              ? m === "on"
                                ? "bg-emerald-500/8 text-emerald-400/50 border border-emerald-400/10"
                                : "bg-white/[0.04] text-white/25 border border-white/[0.04]"
                              : "bg-white/[0.03] text-white/15 border border-white/[0.04]"
                        )}
                      >
                        {m === "auto" && <Clock className="w-3 h-3" />}
                        {m === "on" && <Power className="w-3 h-3" />}
                        {m === "off" && <Moon className="w-3 h-3" />}
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                        {isAutoLive && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500/25 text-blue-400 text-[7px] font-bold flex items-center justify-center border border-blue-400/20">
                            A
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Schedule info (auto mode) */}
                {ctrl.mode === "auto" && ctrl.schedule && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 pt-3 border-t border-white/[0.04]"
                  >
                    <div className="flex items-center gap-2">
                      {ctrl.schedule.type === "solar" && <Sun className="w-3 h-3 text-amber-400/50" />}
                      {ctrl.schedule.type === "manual" && <Clock className="w-3 h-3 text-blue-400/50" />}
                      {ctrl.schedule.type === "seasonal" && <Calendar className="w-3 h-3 text-purple-400/50" />}
                      <span className="text-[9px] font-semibold text-white/20 uppercase tracking-wider">
                        {ctrl.schedule.type} schedule
                      </span>
                    </div>
                    {ctrl.schedule.type === "manual" && (
                      <p className="text-[10px] text-white/30 mt-1 ml-5">
                        {ctrl.schedule.onTime} → {ctrl.schedule.offTime}
                      </p>
                    )}
                    {ctrl.schedule.type === "solar" && (() => {
                      const st = solarTimes[ctrl.id];
                      return (
                        <div className="mt-1.5 ml-5 space-y-1">
                          {st ? (
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <Sunrise className="w-3 h-3 text-amber-400/60" />
                                <span className="text-[11px] font-semibold text-amber-400/70 tabular-nums">
                                  {st.adjusted.sunrise}
                                </span>
                                {(ctrl.schedule?.sunriseOffset ?? 0) !== 0 && (
                                  <span className="text-[8px] text-white/15">
                                    ({(ctrl.schedule?.sunriseOffset ?? 0) >= 0 ? "+" : ""}{ctrl.schedule?.sunriseOffset ?? 0}m)
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-white/10">→</span>
                              <div className="flex items-center gap-1.5">
                                <Sunset className="w-3 h-3 text-orange-400/60" />
                                <span className="text-[11px] font-semibold text-orange-400/70 tabular-nums">
                                  {st.adjusted.sunset}
                                </span>
                                {(ctrl.schedule?.sunsetOffset ?? 0) !== 0 && (
                                  <span className="text-[8px] text-white/15">
                                    ({(ctrl.schedule?.sunsetOffset ?? 0) >= 0 ? "+" : ""}{ctrl.schedule?.sunsetOffset ?? 0}m)
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-white/20">
                              Sunrise {(ctrl.schedule?.sunriseOffset ?? 0) >= 0 ? "+" : ""}{ctrl.schedule?.sunriseOffset ?? 0}min
                              {" → "}
                              Sunset {(ctrl.schedule?.sunsetOffset ?? 0) >= 0 ? "+" : ""}{ctrl.schedule?.sunsetOffset ?? 0}min
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {ctrl.schedule.type === "seasonal" && (
                      <p className="text-[10px] text-white/30 mt-1 ml-5">
                        {ctrl.schedule.profiles?.length ?? 0} profiles configured
                      </p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Control Editor */}
      <ControlEditor
        open={editorOpen}
        initial={editingControl}
        sensors={sensors}
        onSave={handleSaveControl}
        onClose={() => { setEditorOpen(false); setEditingControl(null); }}
      />
    </motion.div>
  );
}
