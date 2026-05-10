"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SensorConfig } from "@/lib/types";
import { DEFAULT_SENSORS } from "@/lib/mock-data";

interface SensorConfigStore {
  sensors: SensorConfig[];
  addSensor: (sensor: SensorConfig) => void;
  updateSensor: (id: string, patch: Partial<SensorConfig>) => void;
  removeSensor: (id: string) => void;
  setSensorMapPosition: (id: string, x: number, y: number) => void;
  resetToDefaults: () => void;
}

export const useSensorConfigStore = create<SensorConfigStore>()(
  persist(
    (set) => ({
      sensors: DEFAULT_SENSORS,

      addSensor: (sensor) =>
        set((s) => ({ sensors: [...s.sensors, sensor] })),

      updateSensor: (id, patch) =>
        set((s) => ({
          sensors: s.sensors.map((sensor) =>
            sensor.id === id ? { ...sensor, ...patch } : sensor
          ),
        })),

      removeSensor: (id) =>
        set((s) => ({ sensors: s.sensors.filter((sensor) => sensor.id !== id) })),

      setSensorMapPosition: (id, x, y) =>
        set((s) => ({
          sensors: s.sensors.map((sensor) =>
            sensor.id === id ? { ...sensor, mapPosition: { x, y } } : sensor
          ),
        })),

      resetToDefaults: () => set({ sensors: DEFAULT_SENSORS }),
    }),
    { name: "enclosure-sensor-config" }
  )
);
