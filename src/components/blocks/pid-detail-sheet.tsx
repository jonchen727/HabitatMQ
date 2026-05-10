"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Activity, Gauge, Settings2, Zap, X, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { PIDState } from "@/lib/types";

interface PidDetailSheetProps {
  open: boolean;
  onClose: () => void;
  pid: PIDState;
  controlId: string;
  controlLabel: string;
}

export function PidDetailSheet({
  open,
  onClose,
  pid,
  controlId,
  controlLabel,
}: PidDetailSheetProps) {
  const [tuningRequested, setTuningRequested] = useState(false);
  const [livePid, setLivePid] = useState<PIDState>(pid);
  const [editingSetpoint, setEditingSetpoint] = useState(false);
  const [spDraft, setSpDraft] = useState("");
  const [spSaved, setSpSaved] = useState(false);
  const spInputRef = useRef<HTMLInputElement>(null);
  const spOverrideRef = useRef<{ value: number; until: number } | null>(null);

  // Stream live PID data when open
  useEffect(() => {
    if (!open) return;
    setLivePid(pid); // seed with latest snapshot

    const evtSource = new EventSource("/api/controls/pid/stream");
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data[controlId]) {
          const incoming = data[controlId];
          // Preserve user-saved setpoint override until PID loop catches up
          if (spOverrideRef.current && Date.now() < spOverrideRef.current.until) {
            incoming.setpoint = spOverrideRef.current.value;
          } else {
            spOverrideRef.current = null;
          }
          setLivePid(incoming);
        }
      } catch { /* ignore parse errors */ }
    };
    return () => evtSource.close();
  }, [open, controlId, pid]);

  const handleAutoTune = useCallback(async () => {
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
  }, [controlId]);

  const handleSetpointEdit = useCallback(() => {
    setSpDraft(String(livePid.setpoint));
    setEditingSetpoint(true);
    setTimeout(() => spInputRef.current?.focus(), 50);
  }, [livePid.setpoint]);

  const handleSetpointSave = useCallback(async () => {
    const val = parseFloat(spDraft);
    if (isNaN(val) || val === livePid.setpoint) { setEditingSetpoint(false); return; }
    try {
      // GET returns a list — find the matching control to preserve existing pid fields
      const listRes = await fetch("/api/controls");
      const allControls = await listRes.json();
      const existing = allControls.find((c: { id: string }) => c.id === controlId);
      if (!existing) throw new Error("control not found");
      await fetch(`/api/controls?id=${controlId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...existing, pid: { ...existing.pid, setpoint: val } }),
      });
      setLivePid((p) => ({ ...p, setpoint: val }));
      spOverrideRef.current = { value: val, until: Date.now() + 10000 };
      setSpSaved(true);
      setTimeout(() => setSpSaved(false), 1500);
    } catch (err) {
      console.error("Failed to save setpoint", err);
    }
    setEditingSetpoint(false);
  }, [spDraft, controlId, livePid.setpoint]);

  const isTuning = livePid.autoTuning || tuningRequested;

  const errorColor =
    Math.abs(livePid.error) < 1
      ? "text-emerald-400"
      : Math.abs(livePid.error) < 3
        ? "text-amber-400"
        : "text-red-400";

  // Format ms to human readable
  const fmtMs = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-[#0c0e14] border-t border-white/[0.08]"
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-white/90">{controlLabel}</h2>
                  <p className="text-[10px] text-white/30 font-medium">PID Controller</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4 text-white/30" />
              </button>
            </div>

            {/* Big Numbers */}
            <div className="grid grid-cols-3 gap-3 px-6 pb-5">
              <div
                className={cn(
                  "glass rounded-2xl p-4 text-center cursor-pointer transition-all",
                  editingSetpoint && "ring-1 ring-blue-400/40",
                  !editingSetpoint && "active:scale-95"
                )}
                onClick={() => !editingSetpoint && handleSetpointEdit()}
              >
                {editingSetpoint ? (
                  <input
                    ref={spInputRef}
                    type="text"
                    inputMode="decimal"
                    value={spDraft}
                    onChange={(e) => setSpDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                    onBlur={handleSetpointSave}
                    onKeyDown={(e) => e.key === "Enter" && handleSetpointSave()}
                    className="w-full text-2xl font-bold tabular-nums text-blue-400 bg-transparent text-center outline-none"
                  />
                ) : (
                  <p className="text-2xl font-bold tabular-nums text-blue-400">
                    {livePid.setpoint}°
                  </p>
                )}
                <p className="text-[9px] text-white/25 font-semibold uppercase tracking-wider mt-1 flex items-center justify-center gap-1">
                  {spSaved ? (
                    <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Saved</span></>
                  ) : (
                    editingSetpoint ? "Enter value" : "Target ✎"
                  )}
                </p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold tabular-nums text-white/85">
                  {livePid.actual.toFixed(1)}°
                </p>
                <p className="text-[9px] text-white/25 font-semibold uppercase tracking-wider mt-1">
                  Actual
                </p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className={cn(
                  "text-2xl font-bold tabular-nums",
                  isTuning ? "text-amber-400 animate-pulse" : "text-emerald-400"
                )}>
                  {livePid.output.toFixed(0)}%
                </p>
                <p className="text-[9px] text-white/25 font-semibold uppercase tracking-wider mt-1">
                  Output
                </p>
              </div>
            </div>

            {/* Error Bar */}
            <div className="px-6 pb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-white/20 font-semibold uppercase tracking-wider">
                  Error
                </span>
                <span className={cn("text-[11px] font-mono font-semibold tabular-nums", errorColor)}>
                  {livePid.error > 0 ? "+" : ""}{livePid.error.toFixed(2)}°
                </span>
              </div>
              <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10 z-10" />
                <div
                  className={cn(
                    "absolute top-0 bottom-0 transition-all duration-1000 rounded-full",
                    livePid.error > 0 ? "bg-blue-400/60 left-1/2" : "bg-red-400/60 right-1/2"
                  )}
                  style={{ width: `${Math.min(50, Math.abs(livePid.error) * 10)}%` }}
                />
              </div>
            </div>

            {/* Output Bar */}
            <div className="px-6 pb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-white/20 font-semibold uppercase tracking-wider">
                  Duty Cycle
                </span>
                <span className="text-[11px] font-mono font-semibold tabular-nums text-emerald-400/70">
                  {livePid.output.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isTuning
                      ? "bg-gradient-to-r from-amber-500/60 to-amber-500"
                      : "bg-gradient-to-r from-emerald-500/60 to-emerald-500"
                  )}
                  animate={{ width: `${livePid.output}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                />
              </div>
            </div>

            {/* PID Gains */}
            <div className="px-6 pb-4">
              <p className="text-[9px] text-white/20 font-semibold uppercase tracking-wider mb-2">
                Tuned Gains
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Kp", value: livePid.Kp, color: "text-cyan-400" },
                  { label: "Ki", value: livePid.Ki, color: "text-violet-400" },
                  { label: "Kd", value: livePid.Kd, color: "text-amber-400" },
                ].map((g) => (
                  <div key={g.label} className="glass rounded-xl p-3 text-center">
                    <p className={cn("text-[14px] font-bold tabular-nums font-mono", g.color)}>
                      {g.value < 10 ? g.value.toFixed(3) : g.value < 100 ? g.value.toFixed(1) : g.value.toFixed(0)}
                    </p>
                    <p className="text-[8px] text-white/20 font-semibold uppercase tracking-wider mt-0.5">
                      {g.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* PWM Window Status */}
            {livePid.pwmWindowMs && (
              <div className="px-6 pb-4">
                <p className="text-[9px] text-white/20 font-semibold uppercase tracking-wider mb-2">
                  PWM Window
                </p>
                <div className="glass rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/30">Window Size</span>
                    <span className="text-[12px] font-semibold tabular-nums text-white/60 font-mono">
                      {fmtMs(livePid.pwmWindowMs)}
                    </span>
                  </div>
                  {livePid.pwmWindowElapsed != null && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/30">Elapsed</span>
                        <span className="text-[12px] font-semibold tabular-nums text-white/60 font-mono">
                          {fmtMs(livePid.pwmWindowElapsed)}
                        </span>
                      </div>
                      {/* PWM window progress bar */}
                      <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        {/* ON portion */}
                        {livePid.pwmOnTimeMs != null && livePid.pwmOnTimeMs > 0 && (
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-emerald-500/40 rounded-l-full"
                            style={{ width: `${(livePid.pwmOnTimeMs / livePid.pwmWindowMs) * 100}%` }}
                          />
                        )}
                        {/* Elapsed cursor */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10 transition-all duration-1000"
                          style={{ left: `${Math.min(100, (livePid.pwmWindowElapsed / livePid.pwmWindowMs) * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[8px] text-white/15">
                        <span>ON ({livePid.pwmOnTimeMs != null ? fmtMs(livePid.pwmOnTimeMs) : "—"})</span>
                        <span>{livePid.pwmShouldBeOn ? "🟢 Relay ON" : "⚫ Relay OFF"}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Auto-Tune Button */}
            <div className="px-6 pb-8">
              {isTuning ? (
                <div className="glass rounded-xl p-4 border-amber-400/15 bg-amber-500/[0.04] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-amber-400">Auto-Tuning…</p>
                    <p className="text-[9px] text-white/25">
                      Oscillating around setpoint to measure thermal response
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleAutoTune}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500/10 border border-blue-400/15 text-blue-400 text-[12px] font-semibold hover:bg-blue-500/15 transition-all active:scale-[0.98]"
                >
                  <Settings2 className="w-4 h-4" />
                  Start Auto-Tune
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
