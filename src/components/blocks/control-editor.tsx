/**
 * Control Editor — Sheet for adding/editing controls with schedule configuration.
 *
 * Handles: label, MQTT topics, mode (on/off/auto), and schedule setup
 * (manual fixed times, solar sunrise/sunset + offsets, seasonal profiles).
 * Uses scrollable body + sticky save button for reliable UX.
 */

"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Sun, Clock, Calendar, Plus, Trash2, Thermometer, Cpu } from "lucide-react";
import type { ControlDef, ScheduleDef, SeasonalProfile, PidConfig, AutoStrategy, SensorDef } from "@/lib/schema";
import { PidScheduleEditor } from "./pid-schedule-editor";

interface ControlEditorProps {
  open: boolean;
  initial?: ControlDef | null;
  sensors?: SensorDef[];           // available sensors for PID input selection
  onSave: (control: ControlDef) => void;
  onClose: () => void;
}

const DEFAULT_SCHEDULE: ScheduleDef = {
  type: "manual",
  timezone: "America/Los_Angeles",
  onTime: "07:00",
  offTime: "19:00",
  sunriseOffset: 0,
  sunsetOffset: 0,
  profiles: [],
};

const DEFAULT_PID: PidConfig = {
  inputSensorId: "",
  setpoint: 90,
  hysteresis: 2,
  Kp: 2.0,
  Ki: 0.5,
  Kd: 1.0,
  tuned: false,
  scheduleMode: "static",
  sensorOffset: 0,
};

export function ControlEditor({ open, initial, sensors = [], onSave, onClose }: ControlEditorProps) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"toggle" | "pwm">("toggle");
  const [statusTopic, setStatusTopic] = useState("");
  const [controlTopic, setControlTopic] = useState("");
  const [onValue, setOnValue] = useState("true");
  const [offValue, setOffValue] = useState("false");
  const [mode, setMode] = useState<"on" | "off" | "auto">("off");
  const [autoStrategy, setAutoStrategy] = useState<AutoStrategy>("schedule");
  const [schedule, setSchedule] = useState<ScheduleDef>(DEFAULT_SCHEDULE);
  const [pid, setPid] = useState<PidConfig>(DEFAULT_PID);
  const [hoursSensorId, setHoursSensorId] = useState("");

  // Filter sensors for PID input: analog inputs only
  const analogInputSensors = sensors.filter(s => s.kind === "analog" && (s.direction ?? "input") === "input");

  useEffect(() => {
    if (initial) {
      setLabel(initial.label);
      setKind(initial.kind);
      setStatusTopic(initial.mqtt.statusTopic);
      setControlTopic(initial.mqtt.controlTopic);
      setOnValue(initial.mqtt.onValue);
      setOffValue(initial.mqtt.offValue);
      setMode(initial.mode);
      setAutoStrategy(initial.autoStrategy ?? "schedule");
      setSchedule(initial.schedule ?? DEFAULT_SCHEDULE);
      setPid(initial.pid ?? DEFAULT_PID);
      setHoursSensorId(initial.hoursSensorId ?? "");
    } else {
      setLabel("");
      setKind("toggle");
      setStatusTopic("");
      setControlTopic("");
      setOnValue("true");
      setOffValue("false");
      setMode("off");
      setAutoStrategy("schedule");
      setSchedule(DEFAULT_SCHEDULE);
      setPid(DEFAULT_PID);
      setHoursSensorId("");
    }
  }, [initial, open]);

  function handleSave() {
    const id = initial?.id ?? label.toLowerCase().replace(/\s+/g, "-");
    onSave({
      id,
      label,
      kind,
      mqtt: { statusTopic: statusTopic || "", controlTopic, onValue, offValue },
      mode,
      autoStrategy,
      schedule: mode === "auto" && autoStrategy === "schedule" ? schedule : undefined,
      pid: mode === "auto" && autoStrategy === "pid" ? pid : undefined,
      hoursSensorId: hoursSensorId || undefined,
    });
    onClose();
  }

  function updateScheduleField<K extends keyof ScheduleDef>(key: K, val: ScheduleDef[K]) {
    setSchedule((s) => ({ ...s, [key]: val }));
  }

  function addProfile() {
    const p: SeasonalProfile = {
      label: `Profile ${(schedule.profiles?.length ?? 0) + 1}`,
      startMonth: 1, startDay: 1, endMonth: 6, endDay: 30,
      type: "solar", sunriseOffset: 0, sunsetOffset: 0,
    };
    setSchedule((s) => ({ ...s, profiles: [...(s.profiles ?? []), p] }));
  }

  function updateProfile(idx: number, patch: Partial<SeasonalProfile>) {
    setSchedule((s) => ({
      ...s,
      profiles: (s.profiles ?? []).map((p, i) => i === idx ? { ...p, ...patch } : p),
    }));
  }

  function removeProfile(idx: number) {
    setSchedule((s) => ({
      ...s,
      profiles: (s.profiles ?? []).filter((_, i) => i !== idx),
    }));
  }

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-t-[28px] glass-heavy border-t border-white/[0.06] flex flex-col"
          style={{ maxHeight: "calc(100dvh - 60px)" }}
        >
          {/* ── Header (fixed) ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <div>
              <h2 className="text-[16px] font-bold text-white/90">
                {initial ? "Edit Control" : "Add Control"}
              </h2>
              <p className="text-[10px] text-white/25 mt-0.5">Configure device automation</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4 text-white/30" />
            </button>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-3 space-y-4 overscroll-contain">
            {/* Label */}
            <Field label="Label">
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Basking Light" className="input-field" />
            </Field>

            {/* Control Kind */}
            <Field label="Output Type">
              <div className="flex gap-2">
                {([
                  { key: "toggle" as const, label: "Toggle (On/Off)" },
                  { key: "pwm" as const, label: "PWM (Dimmer)" },
                ]).map((k) => (
                  <button key={k.key} onClick={() => setKind(k.key)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-[10px] font-semibold transition-all border",
                      kind === k.key
                        ? "bg-white/[0.08] text-white/60 border-white/[0.08]"
                        : "bg-white/[0.03] text-white/20 border-white/[0.04]"
                    )}>
                    {k.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* MQTT Topics */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status Topic (optional)">
                <input value={statusTopic} onChange={(e) => setStatusTopic(e.target.value)}
                  placeholder={controlTopic || "Same as control topic"} className="input-field" />
              </Field>
              <Field label="Control Topic">
                <input value={controlTopic} onChange={(e) => setControlTopic(e.target.value)}
                  placeholder="BaskingLightControl" className="input-field" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="On Value">
                <input value={onValue} onChange={(e) => setOnValue(e.target.value)} className="input-field" />
              </Field>
              <Field label="Off Value">
                <input value={offValue} onChange={(e) => setOffValue(e.target.value)} className="input-field" />
              </Field>
            </div>

            {/* Hours Sensor */}
            <Field label="Hours Sensor ID">
              <input value={hoursSensorId} onChange={(e) => setHoursSensorId(e.target.value)}
                placeholder="basking-light-hours" className="input-field" />
            </Field>

            {/* Mode Selector */}
            <Field label="Mode">
              <div className="flex gap-2">
                {([
                  { key: "off" as const, label: "Off", activeClass: "bg-white/[0.08] text-white/60 border-white/[0.12]" },
                  { key: "on" as const, label: "On", activeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-400/20" },
                  { key: "auto" as const, label: "Auto", activeClass: "bg-blue-500/20 text-blue-400 border-blue-400/20" },
                ]).map((m) => (
                  <button key={m.key} onClick={() => setMode(m.key)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all border",
                      mode === m.key ? m.activeClass : "bg-white/[0.04] text-white/20 border-white/[0.04]"
                    )}>
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Schedule/PID Config (auto mode only) */}
            {mode === "auto" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-3 border-t border-white/[0.04]"
              >
                {/* Auto Strategy Toggle */}
                <div className="flex gap-2">
                  {([
                    { key: "schedule" as const, icon: Clock, label: "Schedule" },
                    { key: "pid" as const, icon: Thermometer, label: "PID Loop" },
                  ]).map(({ key, icon: Icon, label: l }) => (
                    <button key={key}
                      onClick={() => setAutoStrategy(key)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-semibold transition-all border",
                        autoStrategy === key
                          ? "bg-blue-500/20 text-blue-400 border-blue-400/20"
                          : "bg-white/[0.03] text-white/20 border-white/[0.04]"
                      )}>
                      <Icon className="w-3 h-3" />
                      {l}
                    </button>
                  ))}
                </div>

                {/* ── Schedule Config ── */}
                {autoStrategy === "schedule" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-emerald-400/50 uppercase tracking-wider">
                      Schedule Configuration
                    </p>

                    {/* Schedule Type */}
                    <div className="flex gap-2">
                      {([
                        { key: "manual" as const, icon: Clock, label: "Manual" },
                        { key: "solar" as const, icon: Sun, label: "Solar" },
                        { key: "seasonal" as const, icon: Calendar, label: "Seasonal" },
                      ]).map(({ key, icon: Icon, label: l }) => (
                        <button key={key}
                          onClick={() => updateScheduleField("type", key)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-semibold transition-all border",
                            schedule.type === key
                              ? "bg-white/[0.08] text-white/60 border-white/[0.08]"
                              : "bg-white/[0.03] text-white/20 border-white/[0.04]"
                          )}>
                          <Icon className="w-3 h-3" />
                          {l}
                        </button>
                      ))}
                    </div>

                    {/* Manual: fixed times */}
                    {schedule.type === "manual" && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="On Time">
                          <input type="time" value={schedule.onTime ?? "07:00"}
                            onChange={(e) => updateScheduleField("onTime", e.target.value)}
                            className="input-field" />
                        </Field>
                        <Field label="Off Time">
                          <input type="time" value={schedule.offTime ?? "19:00"}
                            onChange={(e) => updateScheduleField("offTime", e.target.value)}
                            className="input-field" />
                        </Field>
                      </div>
                    )}

                    {/* Solar: offset sliders */}
                    {schedule.type === "solar" && (
                      <div className="space-y-3">
                        <Field label={`Sunrise Offset: ${schedule.sunriseOffset ?? 0} min`}>
                          <input type="range" min={-120} max={120} step={5}
                            value={schedule.sunriseOffset ?? 0}
                            onChange={(e) => updateScheduleField("sunriseOffset", parseInt(e.target.value))}
                            className="w-full accent-emerald-400" />
                        </Field>
                        <Field label={`Sunset Offset: ${schedule.sunsetOffset ?? 0} min`}>
                          <input type="range" min={-120} max={120} step={5}
                            value={schedule.sunsetOffset ?? 0}
                            onChange={(e) => updateScheduleField("sunsetOffset", parseInt(e.target.value))}
                            className="w-full accent-emerald-400" />
                        </Field>
                        <p className="text-[9px] text-white/15 text-center">
                          Set location in Settings → Location for solar calculations
                        </p>
                      </div>
                    )}

                    {/* Seasonal: profile list */}
                    {schedule.type === "seasonal" && (
                      <div className="space-y-3">
                        {(schedule.profiles ?? []).map((p, idx) => (
                          <div key={idx} className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <input value={p.label}
                                onChange={(e) => updateProfile(idx, { label: e.target.value })}
                                className="input-field !py-2 text-[11px] flex-1 mr-2" />
                              <button onClick={() => removeProfile(idx)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10">
                                <Trash2 className="w-3 h-3 text-red-400/50" />
                              </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <Field label="Start Mo">
                                <input type="number" min={1} max={12} value={p.startMonth}
                                  onChange={(e) => updateProfile(idx, { startMonth: parseInt(e.target.value) })}
                                  className="input-field !py-2 text-[11px]" />
                              </Field>
                              <Field label="Start Day">
                                <input type="number" min={1} max={31} value={p.startDay}
                                  onChange={(e) => updateProfile(idx, { startDay: parseInt(e.target.value) })}
                                  className="input-field !py-2 text-[11px]" />
                              </Field>
                              <Field label="End Mo">
                                <input type="number" min={1} max={12} value={p.endMonth}
                                  onChange={(e) => updateProfile(idx, { endMonth: parseInt(e.target.value) })}
                                  className="input-field !py-2 text-[11px]" />
                              </Field>
                              <Field label="End Day">
                                <input type="number" min={1} max={31} value={p.endDay}
                                  onChange={(e) => updateProfile(idx, { endDay: parseInt(e.target.value) })}
                                  className="input-field !py-2 text-[11px]" />
                              </Field>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateProfile(idx, { type: "solar" })}
                                className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-semibold transition-all",
                                  p.type === "solar" ? "bg-white/[0.08] text-white/50" : "bg-white/[0.02] text-white/15"
                                )}>Solar</button>
                              <button
                                onClick={() => updateProfile(idx, { type: "manual" })}
                                className={cn("flex-1 py-1.5 rounded-lg text-[9px] font-semibold transition-all",
                                  p.type === "manual" ? "bg-white/[0.08] text-white/50" : "bg-white/[0.02] text-white/15"
                                )}>Manual</button>
                            </div>
                          </div>
                        ))}
                        <button onClick={addProfile}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.04] text-[10px] font-semibold text-white/25 hover:text-white/40">
                          <Plus className="w-3 h-3" /> Add Profile
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PID Config ── */}
                {autoStrategy === "pid" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-orange-400/50 uppercase tracking-wider">
                      PID Loop Configuration
                    </p>

                    {/* Input Sensor */}
                    <Field label="Input Sensor">
                      <select
                        value={pid.inputSensorId}
                        onChange={(e) => setPid(p => ({ ...p, inputSensorId: e.target.value }))}
                        className="input-field">
                        <option value="">Select a sensor…</option>
                        {analogInputSensors.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.label} ({s.displayUnit === "F" ? "°F" : (s.unit || "no unit")})
                          </option>
                        ))}
                      </select>
                    </Field>

                    {/* PID Schedule + Setpoint Editor */}
                    <PidScheduleEditor pid={pid} onChange={setPid} />

                    {/* Hysteresis */}
                    <label className="block">
                      <span className="text-[9px] text-white/30 uppercase tracking-wider">Hysteresis: ±{pid.hysteresis}</span>
                      <input type="range" min={0.5} max={10} step={0.5}
                        value={pid.hysteresis}
                        onChange={(e) => setPid(p => ({ ...p, hysteresis: parseFloat(e.target.value) }))}
                        className="w-full accent-orange-400 mt-1" />
                    </label>

                    {/* Tuning Status */}
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "px-2 py-1 rounded-lg text-[9px] font-semibold",
                        pid.tuned
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      )}>
                        {pid.tuned ? "✓ Tuned" : "Using defaults"}
                      </div>
                      <p className="text-[8px] text-white/15">
                        Use Auto-Tune on the controls page after saving
                      </p>
                    </div>

                    {/* Advanced: Kp/Ki/Kd */}
                    <details className="group">
                      <summary className="text-[9px] text-white/20 cursor-pointer hover:text-white/30 transition-colors">
                        Advanced PID Gains
                      </summary>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <label className="block">
                          <span className="text-[8px] text-white/25">Kp</span>
                          <input type="number" step="0.1" value={pid.Kp}
                            onChange={(e) => setPid(p => ({ ...p, Kp: parseFloat(e.target.value) || 0 }))}
                            className="input-field text-[11px]" />
                        </label>
                        <label className="block">
                          <span className="text-[8px] text-white/25">Ki</span>
                          <input type="number" step="0.1" value={pid.Ki}
                            onChange={(e) => setPid(p => ({ ...p, Ki: parseFloat(e.target.value) || 0 }))}
                            className="input-field text-[11px]" />
                        </label>
                        <label className="block">
                          <span className="text-[8px] text-white/25">Kd</span>
                          <input type="number" step="0.1" value={pid.Kd}
                            onChange={(e) => setPid(p => ({ ...p, Kd: parseFloat(e.target.value) || 0 }))}
                            className="input-field text-[11px]" />
                        </label>
                      </div>
                    </details>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* ── Sticky Save Footer ── */}
          <div className="px-5 pt-3 pb-5 shrink-0 border-t border-white/[0.04]">
            <button onClick={handleSave}
              disabled={!label || !controlTopic}
              className="w-full py-3 rounded-2xl bg-emerald-500/20 text-emerald-400 font-semibold text-[13px] disabled:opacity-30 hover:bg-emerald-500/30 active:scale-[0.98] transition-all">
              {initial ? "Update Control" : "Add Control"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/* ─── Shared Field Wrapper ────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
