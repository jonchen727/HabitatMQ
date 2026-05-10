"use client";

import { create } from "zustand";
import type {
  EnclosureState,
  DeviceId,
} from "@/lib/types";
import { generateEnclosureState, DEFAULT_SENSORS } from "@/lib/mock-data";

interface EnclosureStore {
  state: EnclosureState | null;
  isConnected: boolean;
  updateCount: number;
  /** Initialize with mock data */
  init: () => void;
  /** Simulate a sensor update tick */
  tick: () => void;
  /** Toggle a device on/off (disables auto mode) */
  toggleDevice: (id: DeviceId) => void;
  /** Set PWM output for a device */
  setDeviceOutput: (id: DeviceId, percent: number) => void;
  /** Toggle shed mode */
  toggleShedMode: () => void;
  /** Toggle night override */
  toggleNightMode: () => void;
  /** Trigger a manual mist (auto-stops after 5s) */
  triggerMist: () => void;
}

export const useEnclosureStore = create<EnclosureStore>((set, get) => ({
  state: null,
  isConnected: false,
  updateCount: 0,

  init: () => {
    set({
      state: generateEnclosureState(DEFAULT_SENSORS),
      isConnected: true,
    });
  },

  tick: () => {
    const prev = get().state;
    if (!prev) return;
    const next = generateEnclosureState(DEFAULT_SENSORS);
    // Preserve user-set device states and mode flags
    set({
      state: {
        ...next,
        devices: { ...next.devices, ...Object.fromEntries(
          Object.entries(prev.devices).filter(([, d]) => !d.autoMode)
        )},
        shedMode: prev.shedMode,
        nightOverride: prev.nightOverride,
      },
      updateCount: get().updateCount + 1,
    });
  },

  toggleDevice: (id) => {
    set((s) => {
      if (!s.state) return s;
      const devices = { ...s.state.devices };
      const device = devices[id];
      if (!device) return s;
      devices[id] = { ...device, isOn: !device.isOn, autoMode: false };
      return { state: { ...s.state, devices } };
    });
  },

  setDeviceOutput: (id, percent) => {
    set((s) => {
      if (!s.state) return s;
      const devices = { ...s.state.devices };
      const device = devices[id];
      if (!device) return s;
      devices[id] = { ...device, outputPercent: percent, isOn: percent > 0, autoMode: false };
      return { state: { ...s.state, devices } };
    });
  },

  toggleShedMode: () => {
    set((s) => s.state ? { state: { ...s.state, shedMode: !s.state.shedMode } } : s);
  },

  toggleNightMode: () => {
    set((s) => s.state ? { state: { ...s.state, nightOverride: !s.state.nightOverride } } : s);
  },

  triggerMist: () => {
    set((s) => {
      if (!s.state) return s;
      const devices = { ...s.state.devices };
      devices.MIST = { ...devices.MIST, isOn: true };
      return { state: { ...s.state, devices } };
    });
    setTimeout(() => {
      set((s) => {
        if (!s.state) return s;
        const devices = { ...s.state.devices };
        devices.MIST = { ...devices.MIST, isOn: false };
        return { state: { ...s.state, devices } };
      });
    }, 5000);
  },
}));
