"use client";

/**
 * Dashboard Store — unified client-side state for the sensor platform.
 *
 * Loads sensors, controls, and panes from the API on init.
 * Polls /api/sensors/live every 2s for live MQTT readings.
 * All mutations write-through to the API for server-side persistence.
 */

import { create } from "zustand";
import type {
  SensorDef,
  ControlDef,
  PaneDef,
  MqttConfig,
  CameraDef,
} from "@/lib/schema";

interface LiveReading {
  value: number | boolean;
  raw: string;
  timestamp: number;
}

export interface SystemStats {
  cpu: { usagePercent: number; cores: number; loadAvg1m: number };
  ram: { totalMB: number; usedMB: number; usagePercent: number };
  disk: { totalGB: number; usedGB: number; availGB: number; usagePercent: number };
  temp: { celsius: number };
  uptime: number;
}

interface DashboardStore {
  // ─── State ──────────────────────────────────────────────────
  sensors: SensorDef[];
  controls: ControlDef[];
  panes: PaneDef[];
  cameras: CameraDef[];
  mqttConfig: MqttConfig | null;
  liveData: Record<string, { value: number | boolean; timestamp: number }>;
  mqttStatus: string;
  systemStats: SystemStats | null;
  pidData: Record<string, import("@/lib/types").PIDState & { autoTuning: boolean }>;
  isLoaded: boolean;

  // ─── Init ───────────────────────────────────────────────────
  fetchAll: (profileId?: string) => Promise<void>;

  // ─── Live data polling ──────────────────────────────────────
  pollLiveData: () => Promise<void>;
  startPolling: () => () => void;

  // ─── MQTT Data (kept for compatibility) ─────────────────────
  ingestReading: (sensorId: string, value: number | boolean) => void;

  // ─── Sensor CRUD ────────────────────────────────────────────
  addSensor: (sensor: SensorDef) => Promise<void>;
  updateSensor: (id: string, sensor: SensorDef) => Promise<void>;
  removeSensor: (id: string) => Promise<void>;

  // ─── Control CRUD ───────────────────────────────────────────
  addControl: (control: ControlDef) => Promise<void>;
  updateControl: (id: string, control: ControlDef) => Promise<void>;
  removeControl: (id: string) => Promise<void>;

  // ─── Pane CRUD ──────────────────────────────────────────────
  addPane: (pane: PaneDef) => Promise<void>;
  updatePane: (id: string, pane: PaneDef) => Promise<void>;
  removePane: (id: string) => Promise<void>;

  // ─── Camera CRUD ────────────────────────────────────────────
  addCamera: (camera: CameraDef) => Promise<void>;
  updateCamera: (id: string, camera: CameraDef) => Promise<void>;
  removeCamera: (id: string) => Promise<void>;

  // ─── MQTT Config ────────────────────────────────────────────
  updateMqttConfig: (config: MqttConfig) => Promise<void>;

  // ─── Publish (server-side) ──────────────────────────────────
  publish: (topic: string, payload: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  sensors: [],
  controls: [],
  panes: [],
  cameras: [],
  mqttConfig: null,
  liveData: {},
  mqttStatus: "disconnected",
  systemStats: null,
  pidData: {},
  isLoaded: false,

  fetchAll: async (profileId?: string) => {
    try {
      const q = profileId ? `?profileId=${profileId}` : "";
      const [sensorsRes, controlsRes, panesRes, mqttRes, camerasRes] = await Promise.all([
        fetch(`/api/sensors${q}`),
        fetch(`/api/controls${q}`),
        fetch(`/api/panes${q}`),
        fetch("/api/mqtt"),
        fetch(`/api/cameras${q}`),
      ]);
      const [sensors, controls, panes, mqttConfig, cameras] = await Promise.all([
        sensorsRes.json() as Promise<SensorDef[]>,
        controlsRes.json() as Promise<ControlDef[]>,
        panesRes.json() as Promise<PaneDef[]>,
        mqttRes.json() as Promise<MqttConfig>,
        camerasRes.json() as Promise<CameraDef[]>,
      ]);
      set({ sensors, controls, panes, mqttConfig, cameras, isLoaded: true });
    } catch (err) {
      console.error("[DashboardStore] fetchAll failed:", err);
    }
  },

  pollLiveData: async () => {
    try {
      const [liveRes, sysRes, pidRes] = await Promise.all([
        fetch("/api/sensors/live"),
        fetch("/api/system"),
        fetch("/api/controls/pid"),
      ]);
      const { status, data } = await liveRes.json() as {
        status: string;
        data: Record<string, LiveReading>;
      };
      const systemStats = await sysRes.json() as SystemStats;
      const pidData = await pidRes.json() as Record<string, import("@/lib/types").PIDState & { autoTuning: boolean }>;
      set({ liveData: data, mqttStatus: status, systemStats, pidData });
    } catch {
      // Silently fail — next poll will retry
    }
  },

  startPolling: () => {
    // Poll immediately, then every 2s
    get().pollLiveData();
    const id = setInterval(() => get().pollLiveData(), 2000);
    return () => clearInterval(id);
  },

  ingestReading: (sensorId, value) => {
    set((s) => ({
      liveData: {
        ...s.liveData,
        [sensorId]: { value, timestamp: Date.now() },
      },
    }));
  },

  // ── Sensors ──────────────────────────────────────────────────
  addSensor: async (sensor) => {
    await fetch("/api/sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sensor),
    });
    set((s) => ({ sensors: [...s.sensors, sensor] }));
  },

  updateSensor: async (id, sensor) => {
    await fetch(`/api/sensors?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sensor),
    });
    set((s) => ({
      sensors: s.sensors.map((x) => (x.id === id ? sensor : x)),
    }));
  },

  removeSensor: async (id) => {
    await fetch(`/api/sensors?id=${id}`, { method: "DELETE" });
    set((s) => ({
      sensors: s.sensors.filter((x) => x.id !== id),
      panes: s.panes.filter((p) => p.sensorId !== id),
    }));
  },

  // ── Controls ─────────────────────────────────────────────────
  addControl: async (control) => {
    await fetch("/api/controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(control),
    });
    set((s) => ({ controls: [...s.controls, control] }));
  },

  updateControl: async (id, control) => {
    await fetch(`/api/controls?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(control),
    });
    set((s) => ({
      controls: s.controls.map((x) => (x.id === id ? control : x)),
    }));
  },

  removeControl: async (id) => {
    await fetch(`/api/controls?id=${id}`, { method: "DELETE" });
    set((s) => ({ controls: s.controls.filter((x) => x.id !== id) }));
  },

  // ── Panes ────────────────────────────────────────────────────
  addPane: async (pane) => {
    await fetch("/api/panes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pane),
    });
    set((s) => ({ panes: [...s.panes, pane] }));
  },

  updatePane: async (id, pane) => {
    await fetch(`/api/panes?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pane),
    });
    set((s) => ({
      panes: s.panes.map((x) => (x.id === id ? pane : x)),
    }));
  },

  removePane: async (id) => {
    await fetch(`/api/panes?id=${id}`, { method: "DELETE" });
    set((s) => ({ panes: s.panes.filter((x) => x.id !== id) }));
  },

  // ── Cameras ──────────────────────────────────────────────────
  addCamera: async (camera) => {
    await fetch("/api/cameras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(camera),
    });
    set((s) => ({ cameras: [...s.cameras, camera] }));
  },

  updateCamera: async (id, camera) => {
    await fetch(`/api/cameras?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(camera),
    });
    set((s) => ({
      cameras: s.cameras.map((x) => (x.id === id ? camera : x)),
    }));
  },

  removeCamera: async (id) => {
    await fetch(`/api/cameras?id=${id}`, { method: "DELETE" });
    set((s) => ({ cameras: s.cameras.filter((x) => x.id !== id) }));
  },

  // ── MQTT Config ──────────────────────────────────────────────
  updateMqttConfig: async (config) => {
    await fetch("/api/mqtt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    set({ mqttConfig: config });
  },

  // ── Publish via server ───────────────────────────────────────
  publish: async (topic, payload) => {
    await fetch("/api/sensors/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, payload }),
    });
  },
}));
