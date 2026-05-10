"use client";

/**
 * Dashboard — Dynamic pane grid driven by useDashboardStore.
 *
 * Renders PaneDef[] as widget cards in a responsive CSS grid.
 * iPad landscape: 2 columns. Mobile portrait: 1 column.
 * Polls /api/sensors/live every 2s for real-time MQTT data
 * from the server-side subscriber.
 */

import { useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/store/use-dashboard-store";
import { useProfileStore } from "@/store/use-profile-store";
import type { SystemStats } from "@/store/use-dashboard-store";
import { PaneCard } from "@/components/blocks/widget-registry";
import { ProfileSwitcher } from "@/components/blocks/profile-switcher";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Plus, Settings, Cpu, MemoryStick, Thermometer, HardDrive } from "lucide-react";
import Link from "next/link";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

/* ─── Connection Status Dot ───────────────────────────────────────────────── */
function ConnectionIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]",
    connecting: "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.4)]",
    reconnecting: "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.4)]",
    disconnected: "bg-red-400/50",
    not_started: "bg-red-400/50",
  };
  const labels: Record<string, string> = {
    connected: "Live",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    disconnected: "Offline",
    not_started: "Starting…",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold text-white/25 uppercase tracking-wider">
      <span className={cn("w-[5px] h-[5px] rounded-full", colors[status] ?? colors.disconnected)} />
      {labels[status] ?? status}
    </span>
  );
}

/* ─── Empty State ─────────────────────────────────────────────────────────── */
function EmptyDashboard() {
  return (
    <motion.div
      variants={item}
      className="glass rounded-[20px] p-8 flex flex-col items-center gap-4 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center">
        <Plus className="w-6 h-6 text-white/15" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-white/40">No panes configured</p>
        <p className="text-[10px] text-white/20 mt-1">
          Go to Settings to add sensors and create dashboard panes.
        </p>
      </div>
      <Link
        href="/config"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.06] text-[10px] font-semibold text-white/50 hover:text-white/70 hover:bg-white/[0.1] transition-all"
      >
        <Settings className="w-3.5 h-3.5" />
        Open Settings
      </Link>
    </motion.div>
  );
}

/* ─── System Stats Bar ────────────────────────────────────────────────────── */
function SystemBar({ stats }: { stats: SystemStats | null }) {
  if (!stats) return null;

  const tempColor = stats.temp.celsius > 70
    ? "text-red-400" : stats.temp.celsius > 55
    ? "text-amber-400" : "text-emerald-400";

  const cpuColor = stats.cpu.usagePercent > 80
    ? "text-red-400" : stats.cpu.usagePercent > 50
    ? "text-amber-400" : "text-emerald-400";

  const ramColor = stats.ram.usagePercent > 80
    ? "text-red-400" : stats.ram.usagePercent > 60
    ? "text-amber-400" : "text-emerald-400";

  const diskColor = stats.disk.usagePercent > 85
    ? "text-red-400" : stats.disk.usagePercent > 70
    ? "text-amber-400" : "text-emerald-400";

  return (
    <motion.div
      variants={item}
      className="flex items-center gap-2 px-1 flex-wrap"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
        <Cpu className={cn("w-3 h-3", cpuColor)} />
        <span className="text-[9px] font-semibold text-white/40 tabular-nums">
          {stats.cpu.usagePercent}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
        <MemoryStick className={cn("w-3 h-3", ramColor)} />
        <span className="text-[9px] font-semibold text-white/40 tabular-nums">
          {stats.ram.usedMB}/{stats.ram.totalMB}MB
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
        <HardDrive className={cn("w-3 h-3", diskColor)} />
        <span className="text-[9px] font-semibold text-white/40 tabular-nums">
          {stats.disk.usedGB}/{stats.disk.totalGB}GB
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
        <Thermometer className={cn("w-3 h-3", tempColor)} />
        <span className="text-[9px] font-semibold text-white/40 tabular-nums">
          {stats.temp.celsius}°C
        </span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const {
    sensors, controls, panes, isLoaded,
    fetchAll, liveData, mqttStatus, systemStats, startPolling, publish, updateControl,
    ingestReading,
  } = useDashboardStore();
  const { activeProfileId, activeProfile, fetchProfiles, isLoaded: profilesLoaded } = useProfileStore();
  const profile = activeProfile();

  // Load profiles on mount
  useEffect(() => {
    if (!profilesLoaded) fetchProfiles();
  }, [profilesLoaded, fetchProfiles]);

  // Load config from API on mount + profile change
  useEffect(() => {
    fetchAll(activeProfileId);
  }, [fetchAll, activeProfileId]);

  // Start polling for live MQTT data from the server
  useEffect(() => {
    if (!isLoaded) return;
    const stop = startPolling();
    return stop;
  }, [isLoaded, startPolling]);

  // Poll control timers for authoritative isOn state
  type TimerData = Record<string, { isOn: boolean; since: number }>;
  const [timers, setTimers] = useState<TimerData>({});
  useEffect(() => {
    if (!isLoaded) return;
    const load = () => fetch("/api/controls/timers").then(r => r.json()).then(setTimers).catch(() => {});
    load();
    const iv = setInterval(load, 5_000);
    return () => clearInterval(iv);
  }, [isLoaded]);

  // Handle control mode changes
  const handleModeChange = useCallback(
    async (controlId: string, mode: "on" | "off" | "auto") => {
      const ctrl = controls.find((c) => c.id === controlId);
      if (!ctrl) return;
      const updated = { ...ctrl, mode };
      await updateControl(controlId, updated);

      if (mode === "on" || mode === "off") {
        const shouldBeOn = mode === "on";
        // Only publish to controlTopic — statusTopic is the device's read-back topic
        publish(ctrl.mqtt.controlTopic, shouldBeOn ? ctrl.mqtt.onValue : ctrl.mqtt.offValue);
        // Optimistic UI update
        const statusSensor = sensors.find(s => s.mqtt.topic === ctrl.mqtt.statusTopic);
        if (statusSensor) ingestReading(statusSensor.id, shouldBeOn);
      }
      // Force immediate scheduler evaluation so timers update instantly
      try { await fetch("/api/controls/tick", { method: "POST" }); } catch { /* next tick */ }
    },
    [controls, sensors, updateControl, publish, ingestReading]
  );

  // Loading state
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-white/15 animate-pulse text-sm font-light tracking-wide">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4 pt-5 pb-4"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex items-center justify-between px-0.5">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none">
            {profile?.name ?? "Dashboard"}
          </h1>
          <p className="text-[10px] text-white/20 mt-1 font-medium tracking-wide">
            Smart Enclosure Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProfileSwitcher />
          <ConnectionIndicator status={mqttStatus} />
          <Link
            href="/config"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-white/30" />
          </Link>
        </div>
      </motion.div>

      {/* ── System Stats ────────────────────────────────────────── */}
      <SystemBar stats={systemStats} />

      {/* ── Pane Grid ───────────────────────────────────────────── */}
      {panes.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <motion.div
          variants={container}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {panes.map((pane) => {
            // Stream panes don't need a sensor or control
            if (pane.displayType === "stream") {
              return (
                <PaneCard
                  key={pane.id}
                  pane={pane}
                  sensor={null}
                  value={null}
                  control={undefined}
                  onPublish={(t, p) => publish(t, p)}
                  onModeChange={handleModeChange}
                />
              );
            }

            // Resolve control first (takes priority for label + behavior)
            let control = pane.controlId
              ? controls.find((c) => c.id === pane.controlId)
              : undefined;

            // Resolve sensor: if controlId is set, resolve from control's statusTopic
            // (ignore pane.sensorId which may be stale from the editor default)
            let sensor = control
              ? sensors.find((s) => s.mqtt.topic === control!.mqtt.statusTopic)
              : pane.sensorId
                ? sensors.find((s) => s.id === pane.sensorId)
                : undefined;

            // For switch panes without explicit controlId, match by statusTopic
            if (!control && pane.displayType === "switch" && sensor) {
              control = controls.find(
                (c) =>
                  c.mqtt.statusTopic === sensor!.mqtt.topic ||
                  c.hoursSensorId === sensor!.id
              );
            }

            // If we still have no sensor and no control, skip
            if (!sensor && !control) return null;

            const live = sensor ? liveData[sensor.id] : undefined;
            // Fallback to scheduler timer isOn when no live MQTT data
            const timerState = control ? timers[control.id] : undefined;
            const value = live?.value ?? (timerState ? timerState.isOn : null);

            return (
              <PaneCard
                key={pane.id}
                pane={pane}
                sensor={sensor ?? null}
                value={value}
                control={control}
                onPublish={(t, p) => publish(t, p)}
                onModeChange={handleModeChange}
              />
            );
          })}
        </motion.div>
      )}

      {/* ── Timestamp ──────────────────────────────────────────── */}
      <motion.p
        variants={item}
        className="text-center text-[8px] text-white/10 tabular-nums pt-1 font-medium tracking-wide"
      >
        {mqttStatus === "connected" ? (
          <span className="inline-flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5" /> Last update: {new Date().toLocaleTimeString()}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <WifiOff className="w-2.5 h-2.5" /> Connecting to sensor backend…
          </span>
        )}
      </motion.p>
    </motion.div>
  );
}
