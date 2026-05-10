/**
 * Profile Switcher — compact pill for switching between enclosure profiles.
 *
 * Shows active profile as a small pill (icon + name).
 * Tap to open a dropdown listing all profiles.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, Pencil } from "lucide-react";
import { useProfileStore } from "@/store/use-profile-store";
import { useDashboardStore } from "@/store/use-dashboard-store";
import type { EnclosureType } from "@/lib/schema";

const TYPE_ICONS: Record<EnclosureType, string> = {
  reptile: "🐍",
  aquarium: "🐠",
};

export function ProfileSwitcher() {
  const { profiles, activeProfileId, isLoaded, fetchProfiles, setActiveProfile, createProfile, renameProfile } = useProfileStore();
  const { fetchAll } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EnclosureType>("aquarium");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded) fetchProfiles();
  }, [isLoaded, fetchProfiles]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  async function handleSwitch(id: string) {
    if (id === activeProfileId) {
      setOpen(false);
      return;
    }
    await setActiveProfile(id);
    await fetchAll(id);
    setOpen(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createProfile(newName.trim(), newType, TYPE_ICONS[newType]);
    setNewName("");
    setCreating(false);
  }

  function startEditing(id: string, currentName: string) {
    setEditingId(id);
    setEditName(currentName);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }

  async function commitRename(id: string) {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== profiles.find((p) => p.id === id)?.name) {
      await renameProfile(id, trimmed);
    }
    setEditingId(null);
  }

  if (!isLoaded || profiles.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Profile Pill */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all",
          "text-[12px] font-semibold",
          "bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06]",
        )}
      >
        <span className="text-[14px]">{activeProfile?.icon ?? "📦"}</span>
        <span className="text-white/70">{activeProfile?.name ?? "Unknown"}</span>
        <ChevronDown className={cn(
          "w-3 h-3 text-white/30 transition-transform",
          open && "rotate-180"
        )} />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full left-0 mt-2 z-50 min-w-[180px]",
              "rounded-2xl overflow-hidden",
              "border border-white/[0.08]",
            )}
            style={{
              background: "rgba(20, 20, 20, 0.95)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="py-1.5">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors",
                    "hover:bg-white/[0.06]",
                    p.id === activeProfileId && "bg-white/[0.04]"
                  )}
                >
                  <button
                    onClick={() => handleSwitch(p.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <span className="text-[16px]">{p.icon}</span>
                    {editingId === p.id ? (
                      <input
                        ref={editInputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(p.id);
                          if (e.key === "Escape") setEditingId(null);
                          e.stopPropagation();
                        }}
                        onBlur={() => commitRename(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-white/[0.08] px-2 py-0.5 rounded text-[13px] text-white/80 outline-none focus:ring-1 focus:ring-emerald-500/40 min-w-0"
                      />
                    ) : (
                      <span className={cn(
                        "flex-1 text-[13px] font-medium truncate",
                        p.id === activeProfileId ? "text-emerald-400" : "text-white/60"
                      )}>
                        {p.name}
                      </span>
                    )}
                  </button>
                  {editingId !== p.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditing(p.id, p.name); }}
                      className="p-1 rounded-md text-white/15 hover:text-white/40 hover:bg-white/[0.06] transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {p.id === activeProfileId && editingId !== p.id && (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06]" />

            {/* Create New */}
            {creating ? (
              <div className="p-3 space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name..."
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.06] text-white/80 text-[12px] placeholder:text-white/20 outline-none focus:ring-1 focus:ring-emerald-500/40"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex gap-1.5">
                  {(Object.entries(TYPE_ICONS) as [EnclosureType, string][]).map(([type, icon]) => (
                    <button
                      key={type}
                      onClick={() => setNewType(type)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                        newType === type
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-white/[0.04] text-white/40 border border-transparent"
                      )}
                    >
                      {icon} {type}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setCreating(false)}
                    className="flex-1 py-1.5 rounded-lg bg-white/[0.04] text-white/40 text-[11px] font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold disabled:opacity-30"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[12px] font-medium">New Enclosure</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
