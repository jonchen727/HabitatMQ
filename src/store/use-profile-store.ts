"use client";

/**
 * Profile Store — manages active enclosure profile for the UI.
 *
 * Loads profiles from API, tracks active profile,
 * and provides switching + creation helpers.
 */

import { create } from "zustand";
import type { EnclosureProfile, EnclosureType } from "@/lib/schema";

interface ProfileStore {
  profiles: EnclosureProfile[];
  activeProfileId: string;
  isLoaded: boolean;

  // Derived
  activeProfile: () => EnclosureProfile | undefined;

  // Actions
  fetchProfiles: () => Promise<void>;
  setActiveProfile: (id: string) => Promise<void>;
  createProfile: (name: string, type: EnclosureType, icon: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles: [],
  activeProfileId: "aspen",
  isLoaded: false,

  activeProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId);
  },

  fetchProfiles: async () => {
    try {
      const res = await fetch("/api/profiles");
      if (!res.ok) return;
      const { profiles, activeId } = await res.json();
      set({ profiles, activeProfileId: activeId, isLoaded: true });
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    }
  },

  setActiveProfile: async (id: string) => {
    try {
      await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, setActive: true }),
      });
      set({ activeProfileId: id });
    } catch (err) {
      console.error("Failed to set active profile:", err);
    }
  },

  createProfile: async (name: string, type: EnclosureType, icon: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const profile: EnclosureProfile = { id, name, type, icon };
    try {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const { profiles } = get();
      set({ profiles: [...profiles, profile] });
    } catch (err) {
      console.error("Failed to create profile:", err);
    }
  },

  renameProfile: async (id: string, name: string) => {
    try {
      await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const { profiles } = get();
      set({ profiles: profiles.map((p) => p.id === id ? { ...p, name } : p) });
    } catch (err) {
      console.error("Failed to rename profile:", err);
    }
  },
}));
