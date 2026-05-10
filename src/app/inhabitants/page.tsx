/**
 * Inhabitants Page — Manage enclosure inhabitants (reptiles, fish, shrimp, etc).
 *
 * Shows the current inhabitant inventory with counts, and lets you
 * add new residents or mark losses via the care log.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Plus, X, Fish, Trash2, Pencil } from "lucide-react";
import { useProfileStore } from "@/store/use-profile-store";
import { PhotoUpload, PhotoThumb, PhotoLightbox } from "@/components/blocks/photo-upload";
import type { Inhabitant, InhabitantCategory } from "@/lib/schema";
import { getAllSpeciesProfiles } from "@/lib/species-profiles";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

const CATEGORY_ICONS: Record<InhabitantCategory, string> = {
  fish: "🐠",
  shrimp: "🦐",
  snail: "🐌",
  crab: "🦀",
  plant: "🌿",
  coral: "🪸",
  reptile: "🐍",
  other: "🫧",
};

const STATUS_COLORS: Record<string, string> = {
  alive: "text-emerald-400",
  deceased: "text-red-400/50",
  rehomed: "text-amber-400/50",
};

export default function InhabitantsPage() {
  const { activeProfileId, activeProfile } = useProfileStore();
  const profile = activeProfile();
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [viewingInhabitant, setViewingInhabitant] = useState<Inhabitant | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  const speciesProfiles = getAllSpeciesProfiles();
  const [newForm, setNewForm] = useState({
    species: "",
    commonName: "",
    name: "",
    category: (profile?.type === "reptile" ? "reptile" : "fish") as InhabitantCategory,
    count: "1",
    source: "",
    notes: "",
    photoUrl: undefined as string | undefined,
    // Reptile-specific
    sex: "" as "male" | "female" | "unsexed" | "",
    birthDate: "",
    morph: "",
    speciesProfileId: "",
  });

  const fetchInhabitants = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await fetch(`/api/inhabitants?profileId=${activeProfileId}`);
      if (res.ok) setInhabitants(await res.json());
    } catch (err) {
      console.error("Failed to fetch inhabitants:", err);
    }
  }, [activeProfileId]);

  useEffect(() => {
    fetchInhabitants();
  }, [fetchInhabitants]);

  function openEdit(inh: Inhabitant) {
    setEditingId(inh.id);
    setNewForm({
      species: inh.species || "",
      commonName: inh.commonName || "",
      name: inh.name || "",
      category: inh.category,
      count: String(inh.count ?? 1),
      source: inh.source || "",
      notes: inh.notes || "",
      photoUrl: inh.photoUrl,
      sex: inh.sex || "",
      birthDate: inh.birthDate || "",
      morph: inh.morph || "",
      speciesProfileId: inh.speciesProfileId || "",
    });
    setAddOpen(true);
  }

  function openAdd() {
    setEditingId(null);
    const defaultCat = (profile?.type === "reptile" ? "reptile" : "fish") as InhabitantCategory;
    setNewForm({ species: "", commonName: "", name: "", category: defaultCat, count: "1", source: "", notes: "", photoUrl: undefined, sex: "", birthDate: "", morph: "", speciesProfileId: "" });
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!newForm.commonName.trim()) return;
    const inhabitant: Inhabitant = {
      id: editingId || `inh-${Date.now()}`,
      profileId: activeProfileId,
      species: newForm.species || newForm.commonName,
      commonName: newForm.commonName,
      name: newForm.name || undefined,
      category: newForm.category,
      count: parseInt(newForm.count) || 1,
      status: "alive",
      addedDate: new Date().toISOString().split("T")[0],
      source: newForm.source || undefined,
      notes: newForm.notes || undefined,
      photoUrl: newForm.photoUrl,
      // Reptile fields
      sex: newForm.sex || undefined,
      birthDate: newForm.birthDate || undefined,
      morph: newForm.morph || undefined,
      speciesProfileId: newForm.speciesProfileId || undefined,
    };
    await fetch("/api/inhabitants", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inhabitant),
    });
    openAdd();
    setAddOpen(false);
    fetchInhabitants();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/inhabitants?id=${id}`, { method: "DELETE" });
    fetchInhabitants();
  }

  async function handleStatusChange(inhabitant: Inhabitant, status: "alive" | "deceased" | "rehomed") {
    const updated = { ...inhabitant, status, deceasedDate: status !== "alive" ? new Date().toISOString().split("T")[0] : undefined };
    await fetch("/api/inhabitants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    fetchInhabitants();
  }

  // Both reptile and aquarium profiles can have inhabitants
  const isReptile = profile?.type === "reptile";

  // Group by category
  const grouped = inhabitants
    .filter((i) => i.status === "alive")
    .reduce((acc, inh) => {
      if (!acc[inh.category]) acc[inh.category] = [];
      acc[inh.category].push(inh);
      return acc;
    }, {} as Record<string, Inhabitant[]>);

  const deceased = inhabitants.filter((i) => i.status !== "alive");
  const totalAlive = inhabitants.filter((i) => i.status === "alive").reduce((sum, i) => sum + (i.count ?? 1), 0);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 pt-5 pb-24">
      <motion.div variants={item} className="flex items-center justify-between px-0.5">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none">{isReptile ? "Enclosure" : "Tank"}</h1>
          <p className="text-[10px] text-white/20 mt-1 font-medium tracking-wide">
            {totalAlive} resident{totalAlive !== 1 ? "s" : ""} · {profile?.name ?? (isReptile ? "Reptile" : "Aquarium")}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={openAdd}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400/80 px-3.5 py-2 rounded-xl glass-green touch-card"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </motion.button>
      </motion.div>

      {/* ── Inhabitant Grid ─────────────────────────────────── */}
      {Object.keys(grouped).length === 0 && (
        <motion.div variants={item} className="glass rounded-[20px] p-8 text-center">
          <Fish className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-white/20 text-[12px]">No inhabitants yet. Add your first resident!</p>
        </motion.div>
      )}

      {Object.entries(grouped).map(([category, members]) => (
        <motion.div key={category} variants={item} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[14px]">{CATEGORY_ICONS[category as InhabitantCategory] ?? "🫧"}</span>
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
              {category} · {members.reduce((s, m) => s + (m.count ?? 1), 0)}
            </span>
          </div>
          <div className="space-y-1.5">
            {members.map((inh) => (
              <motion.div
                key={inh.id}
                layout
                className="glass rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={() => setViewingInhabitant(inh)}
              >
                {inh.photoUrl && (
                  <PhotoThumb src={inh.photoUrl} size={44} className="rounded-xl" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white/80 truncate">{inh.name ?? inh.commonName}</span>
                    {(inh.count ?? 1) > 1 && (
                      <span className="text-[9px] font-bold text-white/25 bg-white/[0.06] px-1.5 py-0.5 rounded-md">
                        ×{inh.count}
                      </span>
                    )}
                    {inh.sex && (
                      <span className="text-[9px] font-bold text-white/25 bg-white/[0.06] px-1.5 py-0.5 rounded-md">
                        {inh.sex === "female" ? "♀" : inh.sex === "male" ? "♂" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/20 italic truncate">{inh.species}</p>
                  {inh.morph && (
                    <p className="text-[9px] text-white/15 truncate">{inh.morph}</p>
                  )}
                  {inh.addedDate && (
                    <p className="text-[9px] text-white/15 mt-0.5">Added {inh.addedDate}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(inh); }}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/15 hover:text-white/50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(inh, "deceased"); }}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-colors"
                    title="Mark deceased"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(inh.id); }}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/10 hover:text-white/30 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* ── Deceased/Rehomed Section ─────────────────────────── */}
      {deceased.length > 0 && (
        <motion.div variants={item} className="space-y-2 mt-6">
          <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider px-1">
            Past Residents · {deceased.length}
          </p>
          {deceased.map((inh) => (
            <div key={inh.id} className="glass rounded-2xl p-3 opacity-40 flex items-center gap-3">
              <span className="text-[12px]">{CATEGORY_ICONS[inh.category]}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium text-white/50 line-through">{inh.commonName}</span>
                <span className={cn("ml-2 text-[9px] font-semibold", STATUS_COLORS[inh.status])}>
                  {inh.status}
                </span>
              </div>
              <button
                onClick={() => handleDelete(inh.id)}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-white/10"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Add Sheet ─────────────────────────────────── */}
      {isMounted && addOpen && createPortal(
      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setAddOpen(false)} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-t-[28px] glass-heavy border-t border-x border-white/[0.06] p-5 pb-8 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-bold">{editingId ? "Edit Inhabitant" : "Add Inhabitant"}</h2>
                <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg text-white/30 hover:text-white/60">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(CATEGORY_ICONS) as [InhabitantCategory, string][]).map(([cat, icon]) => (
                    <button
                      key={cat}
                      onClick={() => setNewForm((f) => ({ ...f, category: cat }))}
                      className={cn("pill", newForm.category === cat && "pill-active")}
                    >
                      {icon} {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Common Name</label>
                    <input
                      value={newForm.commonName}
                      onChange={(e) => setNewForm((f) => ({ ...f, commonName: e.target.value }))}
                      placeholder={newForm.category === "reptile" ? "Western Hognose" : "Neon Tetra"}
                      className="input-field"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Species</label>
                    <input
                      value={newForm.species}
                      onChange={(e) => setNewForm((f) => ({ ...f, species: e.target.value }))}
                      placeholder={newForm.category === "reptile" ? "Heterodon nasicus" : "P. innesi"}
                      className="input-field"
                    />
                  </div>
                  {newForm.category === "reptile" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Name</label>
                        <input
                          value={newForm.name}
                          onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Aspen"
                          className="input-field"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Sex</label>
                        <select
                          value={newForm.sex}
                          onChange={(e) => setNewForm((f) => ({ ...f, sex: e.target.value as typeof f.sex }))}
                          className="input-field"
                        >
                          <option value="">Unknown</option>
                          <option value="female">♀ Female</option>
                          <option value="male">♂ Male</option>
                          <option value="unsexed">Unsexed</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Morph</label>
                        <input
                          value={newForm.morph}
                          onChange={(e) => setNewForm((f) => ({ ...f, morph: e.target.value }))}
                          placeholder="Arctic Cinnamon pos het. Sunburst Coral"
                          className="input-field"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Species Profile</label>
                        <select
                          value={newForm.speciesProfileId}
                          onChange={(e) => setNewForm((f) => ({ ...f, speciesProfileId: e.target.value }))}
                          className="input-field"
                        >
                          <option value="">None</option>
                          {speciesProfiles.map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.commonName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Birth Date (est.)</label>
                        <input
                          type="date"
                          value={newForm.birthDate}
                          onChange={(e) => setNewForm((f) => ({ ...f, birthDate: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                    </>
                  )}
                  {newForm.category !== "reptile" && (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Count</label>
                      <input
                        type="number"
                        min="1"
                        value={newForm.count}
                        onChange={(e) => setNewForm((f) => ({ ...f, count: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Source</label>
                    <input
                      value={newForm.source}
                      onChange={(e) => setNewForm((f) => ({ ...f, source: e.target.value }))}
                      placeholder="Breeder, LFS…"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">Notes</label>
                  <textarea
                    value={newForm.notes}
                    onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Quarantined, drip acclimated…"
                    className="input-field resize-none"
                  />
                </div>

                <PhotoUpload
                  value={newForm.photoUrl ? [newForm.photoUrl] : []}
                  onChange={(urls) => setNewForm((f) => ({ ...f, photoUrl: urls[0] ?? undefined }))}
                  size="sm"
                  label="Photo"
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={!newForm.commonName.trim()}
                className="w-full py-3 rounded-2xl bg-emerald-500/20 text-emerald-400 font-semibold text-[13px] hover:bg-emerald-500/30 active:scale-[0.98] transition-all disabled:opacity-30"
              >
                {editingId ? "Save Resident" : "Add to Tank"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
      {/* ── Inhabitant Detail Sheet ───────────────────────────── */}
      {isMounted && viewingInhabitant && createPortal(
        <AnimatePresence>
          {viewingInhabitant && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center"
            >
              <div className="absolute inset-0 bg-black/60" onClick={() => setViewingInhabitant(null)} />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="relative w-full max-w-lg rounded-t-[28px] glass-heavy border-t border-x border-white/[0.06] p-5 pb-10 space-y-4 max-h-[80vh] overflow-y-auto"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {viewingInhabitant.photoUrl ? (
                      <div
                        className="cursor-pointer active:scale-95 transition-transform"
                        onClick={() => setLightboxUrl(viewingInhabitant.photoUrl!)}
                      >
                        <PhotoThumb src={viewingInhabitant.photoUrl} size={56} className="rounded-2xl" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center text-2xl">
                        {CATEGORY_ICONS[viewingInhabitant.category] ?? "🫧"}
                      </div>
                    )}
                    <div>
                      <h2 className="text-[18px] font-bold leading-tight">
                        {viewingInhabitant.name ?? viewingInhabitant.commonName}
                      </h2>
                      {viewingInhabitant.species && (
                        <p className="text-[11px] text-white/35 italic">{viewingInhabitant.species}</p>
                      )}
                      {viewingInhabitant.sex && (
                        <span className="text-[10px] font-bold text-white/25 bg-white/[0.06] px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                          {viewingInhabitant.sex === "female" ? "♀ Female" : viewingInhabitant.sex === "male" ? "♂ Male" : "Unsexed"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setViewingInhabitant(null)} className="p-1 rounded-lg text-white/30 hover:text-white/60">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {viewingInhabitant.morph && (
                    <div className="col-span-2 bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Morph</p>
                      <p className="text-[12px] text-white/70 mt-0.5">{viewingInhabitant.morph}</p>
                    </div>
                  )}
                  {viewingInhabitant.birthDate && (
                    <div className="bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Birth Date</p>
                      <p className="text-[12px] text-white/70 mt-0.5">{viewingInhabitant.birthDate}</p>
                    </div>
                  )}
                  {viewingInhabitant.addedDate && (
                    <div className="bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Added</p>
                      <p className="text-[12px] text-white/70 mt-0.5">{viewingInhabitant.addedDate}</p>
                    </div>
                  )}
                  {viewingInhabitant.source && (
                    <div className="col-span-2 bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Source / Breeder</p>
                      <p className="text-[12px] text-white/70 mt-0.5">{viewingInhabitant.source}</p>
                    </div>
                  )}
                  {viewingInhabitant.notes && (
                    <div className="col-span-2 bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Notes</p>
                      <p className="text-[12px] text-white/55 mt-0.5 leading-relaxed">{viewingInhabitant.notes}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setViewingInhabitant(null); openEdit(viewingInhabitant); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.06] text-[12px] font-semibold text-white/60 hover:text-white/80 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Profile
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Photo Lightbox */}
      {isMounted && lightboxUrl && createPortal(
        <PhotoLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />,
        document.body
      )}
    </motion.div>
  );
}
