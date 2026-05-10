/**
 * Care Event Editor — Sheet for logging care interactions.
 *
 * Supports: Feeding, Handling, Measurement, Shedding.
 * Each type has its own form fields.
 * Uses scrollable body + sticky save button for reliable UX.
 */

"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Plus, Trash2 } from "lucide-react";
import { PhotoUpload } from "@/components/blocks/photo-upload";
import type {
  CareEvent, CareEventType, EnclosureType,
  FeedingData, HandlingData, MeasurementData, SheddingData, RetainedPiece,
  PreyType, Temperament, ShedQuality,
  AquariumFeedingData, AquariumFoodType,
  WaterChangeData, WaterTestData, AdditionData, LossData, MaintenanceData, MedicationData,
  BeddingChangeData, CleaningData, SubstrateType, CleaningScope,
} from "@/lib/schema";
import type { InhabitantCategory } from "@/lib/schema";

interface CareEventEditorProps {
  open: boolean;
  initial?: CareEvent | null;
  defaultDate?: string;
  profileType?: EnclosureType;
  onSave: (event: CareEvent) => void;
  onClose: () => void;
}

const REPTILE_EVENT_TYPES: { key: CareEventType; label: string; color: string }[] = [
  { key: "feeding", label: "Feeding", color: "text-amber-400" },
  { key: "handling", label: "Handling", color: "text-blue-400" },
  { key: "measurement", label: "Measure", color: "text-emerald-400" },
  { key: "shedding", label: "Shedding", color: "text-purple-400" },
  { key: "bedding_change", label: "Bedding", color: "text-orange-400" },
  { key: "cleaning", label: "Clean", color: "text-slate-400" },
];

const AQUARIUM_EVENT_TYPES: { key: CareEventType; label: string; color: string }[] = [
  { key: "feeding", label: "Feeding", color: "text-amber-400" },
  { key: "water_change", label: "Water Change", color: "text-cyan-400" },
  { key: "water_test", label: "Water Test", color: "text-teal-400" },
  { key: "addition", label: "Addition", color: "text-green-400" },
  { key: "loss", label: "Loss", color: "text-red-400" },
  { key: "maintenance", label: "Maintenance", color: "text-slate-400" },
  { key: "medication", label: "Medication", color: "text-violet-400" },
];

const PREY_TYPES: PreyType[] = ["pinky", "fuzzy", "hopper", "weanling", "adult", "other"];
const TEMPERAMENTS: Temperament[] = ["calm", "curious", "nervous", "defensive", "nippy", "other"];
const SHED_QUALITIES: ShedQuality[] = ["clean", "partial", "stuck"];
const FOOD_TYPES: AquariumFoodType[] = ["flake", "pellet", "frozen", "live", "gel", "wafer", "bloodworm", "other"];
const INHABITANT_CATEGORIES: InhabitantCategory[] = ["fish", "shrimp", "snail", "crab", "plant", "coral", "other"];
const MAINTENANCE_TASKS = ["filter_clean", "water_top_off", "equipment_swap", "plant_trim", "glass_clean", "substrate_vac", "other"] as const;
const LOSS_CAUSES = ["disease", "old_age", "aggression", "water_quality", "jumping", "unknown", "other"] as const;
const SUBSTRATE_TYPES: SubstrateType[] = ["aspen", "coconut_fiber", "cypress_mulch", "paper_towel", "reptile_carpet", "bioactive_mix", "topsoil_sand_mix", "other"];
const CLEANING_SCOPES: CleaningScope[] = ["spot", "partial", "full"];

export function CareEventEditor({ open, initial, defaultDate, profileType = "reptile", onSave, onClose }: CareEventEditorProps) {
  const EVENT_TYPES = profileType === "aquarium" ? AQUARIUM_EVENT_TYPES : REPTILE_EVENT_TYPES;
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState<CareEventType>("feeding");

  // Feeding fields
  const [preyType, setPreyType] = useState<PreyType>("fuzzy");
  const [preyWeight, setPreyWeight] = useState("");
  const [accepted, setAccepted] = useState(true);
  const [feedNotes, setFeedNotes] = useState("");

  // Handling fields
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [temperament, setTemperament] = useState<Temperament>("calm");
  const [handleNotes, setHandleNotes] = useState("");

  // Measurement fields
  const [weightGrams, setWeightGrams] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [measureNotes, setMeasureNotes] = useState("");

  // Shedding fields
  const [shedPhase, setShedPhase] = useState<"blue" | "shed">("blue");
  const [blueDate, setBlueDate] = useState("");
  const [shedDate, setShedDate] = useState("");
  const [complete, setComplete] = useState(true);
  const [shedQuality, setShedQuality] = useState<ShedQuality>("clean");
  const [retainedPieces, setRetainedPieces] = useState<RetainedPiece[]>([]);
  const [shedNotes, setShedNotes] = useState("");

  // ─── Aquarium Fields ─────────────────────────────────────────
  const [foodType, setFoodType] = useState<AquariumFoodType>("flake");
  const [brand, setBrand] = useState("");
  const [aquaFeedNotes, setAquaFeedNotes] = useState("");
  const [percentChanged, setPercentChanged] = useState(25);
  const [waterChangeNotes, setWaterChangeNotes] = useState("");
  const [pH, setPH] = useState("");
  const [ammonia, setAmmonia] = useState("");
  const [nitrite, setNitrite] = useState("");
  const [nitrate, setNitrate] = useState("");
  const [testTempF, setTestTempF] = useState("");
  const [GH, setGH] = useState("");
  const [KH, setKH] = useState("");
  const [testNotes, setTestNotes] = useState("");
  const [addSpecies, setAddSpecies] = useState("");
  const [addCommonName, setAddCommonName] = useState("");
  const [addCategory, setAddCategory] = useState<InhabitantCategory>("fish");
  const [addCount, setAddCount] = useState("1");
  const [addSource, setAddSource] = useState("");
  const [addCost, setAddCost] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [lossSpecies, setLossSpecies] = useState("");
  const [lossCommonName, setLossCommonName] = useState("");
  const [lossCount, setLossCount] = useState("1");
  const [lossCause, setLossCause] = useState<typeof LOSS_CAUSES[number]>("unknown");
  const [lossNotes, setLossNotes] = useState("");
  const [maintTask, setMaintTask] = useState<typeof MAINTENANCE_TASKS[number]>("filter_clean");
  const [maintEquipment, setMaintEquipment] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medTarget, setMedTarget] = useState("");
  const [medNotes, setMedNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  // ─── Bedding Change Fields ─────────────────────────────────────────
  const [substrateType, setSubstrateType] = useState<SubstrateType>("aspen");
  const [depthInches, setDepthInches] = useState("");
  const [fullChange, setFullChange] = useState(true);
  const [beddingNotes, setBeddingNotes] = useState("");
  // ─── Cleaning Fields ──────────────────────────────────────────────
  const [cleaningScope, setCleaningScope] = useState<CleaningScope>("spot");
  const [disinfected, setDisinfected] = useState(false);
  const [disinfectant, setDisinfectant] = useState("");
  const [waterBowlCleaned, setWaterBowlCleaned] = useState(false);
  const [cleaningNotes, setCleaningNotes] = useState("");

  useEffect(() => {
    // Always reset first to prevent stale field cross-contamination
    resetFields();
    if (initial) {
      setDate(initial.date);
      setTime(initial.time ?? "");
      setType(initial.type as CareEventType);
      populateFields(initial);
      setPhotoUrl(initial.photoUrl);
    } else {
      const d = new Date();
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const localTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      setDate(defaultDate ?? localDate);
      setTime(localTime);
    }
  }, [initial, open, defaultDate]);

  function populateFields(event: CareEvent) {
    const d = event.data;
    // Reptile feeding
    if (event.type === "feeding" && "preyType" in d) {
      setPreyType(d.preyType);
      setPreyWeight(d.preyWeightGrams?.toString() ?? "");
      setAccepted(d.accepted);
      setFeedNotes(d.notes ?? "");
    // Aquarium feeding
    } else if (event.type === "feeding" && "foodType" in d) {
      setFoodType((d as AquariumFeedingData).foodType);
      setBrand((d as AquariumFeedingData).brand ?? "");
      setAquaFeedNotes((d as AquariumFeedingData).notes ?? "");
    } else if (event.type === "handling" && "startTime" in d) {
      setStartTime(d.startTime);
      setEndTime(d.endTime);
      setTemperament(d.temperament);
      setHandleNotes(d.notes ?? "");
    } else if (event.type === "measurement" && "weightGrams" in d) {
      setWeightGrams(d.weightGrams.toString());
      setLengthCm(d.lengthCm?.toString() ?? "");
      setMeasureNotes(d.notes ?? "");
    } else if (event.type === "shedding" && "complete" in d) {
      setBlueDate(d.blueDate ?? "");
      setShedDate(d.shedDate ?? "");
      setComplete(d.complete);
      setShedQuality(d.quality);
      setRetainedPieces(d.retainedPieces ?? []);
      setShedNotes(d.notes ?? "");
      setShedPhase(d.shedDate ? "shed" : "blue");
    } else if (event.type === "water_change" && "percentChanged" in d) {
      setPercentChanged((d as WaterChangeData).percentChanged);
      setWaterChangeNotes((d as WaterChangeData).notes ?? "");
    } else if (event.type === "water_test" && "pH" in d) {
      const wt = d as WaterTestData;
      setPH(wt.pH?.toString() ?? "");
      setAmmonia(wt.ammonia?.toString() ?? "");
      setNitrite(wt.nitrite?.toString() ?? "");
      setNitrate(wt.nitrate?.toString() ?? "");
      setTestTempF(wt.tempF?.toString() ?? "");
      setGH(wt.GH?.toString() ?? "");
      setKH(wt.KH?.toString() ?? "");
      setTestNotes(wt.notes ?? "");
    } else if (event.type === "addition" && "species" in d) {
      const ad = d as AdditionData;
      setAddSpecies(ad.species);
      setAddCommonName(ad.commonName);
      setAddCategory(ad.category);
      setAddCount(ad.count.toString());
      setAddSource(ad.source ?? "");
      setAddCost(ad.cost?.toString() ?? "");
      setAddNotes(ad.notes ?? "");
    } else if (event.type === "loss" && "suspectedCause" in d) {
      const ld = d as LossData;
      setLossSpecies(ld.species);
      setLossCommonName(ld.commonName);
      setLossCount(ld.count.toString());
      setLossCause(ld.suspectedCause);
      setLossNotes(ld.notes ?? "");
    } else if (event.type === "maintenance" && "task" in d) {
      const md = d as MaintenanceData;
      setMaintTask(md.task);
      setMaintEquipment(md.equipment ?? "");
      setMaintNotes(md.notes ?? "");
    } else if (event.type === "medication" && "medication" in d) {
      const med = d as MedicationData;
      setMedName(med.medication);
      setMedDose(med.dose ?? "");
      setMedTarget(med.targetSpecies ?? "");
      setMedNotes(med.notes ?? "");
    } else if (event.type === "bedding_change" && "substrateType" in d) {
      const bd = d as BeddingChangeData;
      setSubstrateType(bd.substrateType);
      setDepthInches(bd.depthInches?.toString() ?? "");
      setFullChange(bd.fullChange);
      setBeddingNotes(bd.notes ?? "");
    } else if (event.type === "cleaning" && "scope" in d) {
      const cl = d as CleaningData;
      setCleaningScope(cl.scope);
      setDisinfected(cl.disinfected);
      setDisinfectant(cl.disinfectant ?? "");
      setWaterBowlCleaned(cl.waterBowlCleaned);
      setCleaningNotes(cl.notes ?? "");
    }
  }

  function resetFields() {
    setPreyType("fuzzy");
    setPreyWeight("");
    setAccepted(true);
    setFeedNotes("");
    setStartTime("");
    setEndTime("");
    setTemperament("calm");
    setHandleNotes("");
    setWeightGrams("");
    setLengthCm("");
    setMeasureNotes("");
    setBlueDate("");
    setShedDate("");
    setComplete(true);
    setShedQuality("clean");
    setRetainedPieces([]);
    setShedNotes("");
    setShedPhase("blue");
    setPhotoUrl(undefined);
    // Bedding change
    setSubstrateType("aspen");
    setDepthInches("");
    setFullChange(true);
    setBeddingNotes("");
    // Cleaning
    setCleaningScope("spot");
    setDisinfected(false);
    setDisinfectant("");
    setWaterBowlCleaned(false);
    setCleaningNotes("");
  }

  function buildEventData(): CareEvent["data"] {
    switch (type) {
      case "feeding":
        if (profileType === "aquarium") {
          return {
            foodType,
            brand: brand || undefined,
            notes: aquaFeedNotes || undefined,
          } satisfies AquariumFeedingData;
        }
        return {
          preyType,
          preyWeightGrams: preyWeight ? parseFloat(preyWeight) : undefined,
          accepted,
          notes: feedNotes || undefined,
        } satisfies FeedingData;
      case "handling":
        return {
          startTime: startTime || "00:00",
          endTime: endTime || "00:00",
          temperament,
          notes: handleNotes || undefined,
        } satisfies HandlingData;
      case "measurement":
        return {
          weightGrams: parseFloat(weightGrams) || 0,
          lengthCm: lengthCm ? parseFloat(lengthCm) : undefined,
          notes: measureNotes || undefined,
        } satisfies MeasurementData;
      case "shedding":
        return {
          blueDate: (shedPhase === "blue" ? date : blueDate) || undefined,
          shedDate: shedPhase === "shed" ? (shedDate || date) : undefined,
          complete: shedPhase === "blue" ? false : complete,
          retainedPieces: shedPhase === "shed" && !complete ? retainedPieces : undefined,
          quality: shedPhase === "blue" ? "clean" : shedQuality,
          notes: shedNotes || undefined,
        } satisfies SheddingData;
      case "water_change":
        return {
          percentChanged,
          notes: waterChangeNotes || undefined,
        } satisfies WaterChangeData;
      case "water_test":
        return {
          pH: pH ? parseFloat(pH) : undefined,
          ammonia: ammonia ? parseFloat(ammonia) : undefined,
          nitrite: nitrite ? parseFloat(nitrite) : undefined,
          nitrate: nitrate ? parseFloat(nitrate) : undefined,
          tempF: testTempF ? parseFloat(testTempF) : undefined,
          GH: GH ? parseFloat(GH) : undefined,
          KH: KH ? parseFloat(KH) : undefined,
          notes: testNotes || undefined,
        } satisfies WaterTestData;
      case "addition":
        return {
          species: addSpecies || "Unknown",
          commonName: addCommonName || "Unknown",
          category: addCategory,
          count: parseInt(addCount) || 1,
          source: addSource || undefined,
          cost: addCost ? parseFloat(addCost) : undefined,
          notes: addNotes || undefined,
        } satisfies AdditionData;
      case "loss":
        return {
          species: lossSpecies || "Unknown",
          commonName: lossCommonName || "Unknown",
          count: parseInt(lossCount) || 1,
          suspectedCause: lossCause,
          notes: lossNotes || undefined,
        } satisfies LossData;
      case "maintenance":
        return {
          task: maintTask,
          equipment: maintEquipment || undefined,
          notes: maintNotes || undefined,
        } satisfies MaintenanceData;
      case "medication":
        return {
          medication: medName || "Unknown",
          dose: medDose || undefined,
          targetSpecies: medTarget || undefined,
          notes: medNotes || undefined,
        } satisfies MedicationData;
      case "bedding_change":
        return {
          substrateType,
          depthInches: depthInches ? parseFloat(depthInches) : undefined,
          fullChange,
          notes: beddingNotes || undefined,
        } satisfies BeddingChangeData;
      case "cleaning":
        return {
          scope: cleaningScope,
          disinfected,
          disinfectant: disinfected ? (disinfectant || undefined) : undefined,
          waterBowlCleaned,
          notes: cleaningNotes || undefined,
        } satisfies CleaningData;
      default:
        return { preyType: "other", accepted: false } satisfies FeedingData;
    }
  }

  function handleSave() {
    const id = initial?.id ?? `${type}-${Date.now()}`;
    onSave({
      id,
      profileId: initial?.profileId ?? "",
      date,
      time: time || undefined,
      type,
      data: buildEventData(),
      photoUrl,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  }

  function addRetainedPiece() {
    setRetainedPieces((p) => [...p, { location: "" }]);
  }

  function updateRetainedPiece(idx: number, patch: Partial<RetainedPiece>) {
    setRetainedPieces((pieces) =>
      pieces.map((p, i) => i === idx ? { ...p, ...patch } : p)
    );
  }

  function removeRetainedPiece(idx: number) {
    setRetainedPieces((p) => p.filter((_, i) => i !== idx));
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
          className="w-full max-w-lg rounded-t-[28px] glass-heavy border-t border-white/[0.06] flex flex-col overflow-x-hidden"
          style={{ maxHeight: "calc(100dvh - 60px)" }}
        >
          {/* ── Header (fixed) ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <div>
              <h2 className="text-[16px] font-bold text-white/90">
                {initial ? "Edit Event" : "Log Care Event"}
              </h2>
              <p className="text-[10px] text-white/25 mt-0.5">Track husbandry interactions</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4 text-white/30" />
            </button>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-3 space-y-4 overscroll-contain">
            {/* Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="input-field" />
              </Field>
              <Field label="Time">
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="input-field" />
              </Field>
            </div>

            {/* Event Type */}
            <Field label="Type">
              <div className="flex gap-1.5">
                {EVENT_TYPES.map((t) => (
                  <button key={t.key} onClick={() => setType(t.key)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-[10px] font-semibold transition-all",
                      type === t.key
                        ? `bg-white/[0.08] ${t.color} border border-white/[0.08]`
                        : "bg-white/[0.03] text-white/20 border border-white/[0.04]"
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* ── Feeding Fields (Reptile) ── */}
            {type === "feeding" && profileType !== "aquarium" && (
              <div className="space-y-3">
                <Field label="Prey Type">
                  <div className="flex flex-wrap gap-1.5">
                    {PREY_TYPES.map((p) => (
                      <button key={p} onClick={() => setPreyType(p)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all",
                          preyType === p
                            ? "bg-amber-500/20 text-amber-400 border border-amber-400/20"
                            : "bg-white/[0.04] text-white/25 border border-white/[0.04]"
                        )}>
                        {p}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Prey Weight (grams)">
                  <input type="number" value={preyWeight}
                    onChange={(e) => setPreyWeight(e.target.value)}
                    placeholder="3.5" className="input-field" />
                </Field>
                <Field label="Accepted?">
                  <div className="flex gap-2">
                    <button onClick={() => setAccepted(true)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        accepted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>Yes</button>
                    <button onClick={() => setAccepted(false)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        !accepted ? "bg-red-500/20 text-red-400 border border-red-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>No</button>
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea value={feedNotes} onChange={(e) => setFeedNotes(e.target.value)}
                    rows={2} placeholder="Struck immediately" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Handling Fields ── */}
            {type === "handling" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Time">
                    <input type="time" value={startTime}
                      onChange={(e) => setStartTime(e.target.value)} className="input-field" />
                  </Field>
                  <Field label="End Time">
                    <input type="time" value={endTime}
                      onChange={(e) => setEndTime(e.target.value)} className="input-field" />
                  </Field>
                </div>
                <Field label="Temperament">
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPERAMENTS.map((t) => (
                      <button key={t} onClick={() => setTemperament(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all",
                          temperament === t
                            ? "bg-blue-500/20 text-blue-400 border border-blue-400/20"
                            : "bg-white/[0.04] text-white/25 border border-white/[0.04]"
                        )}>
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea value={handleNotes} onChange={(e) => setHandleNotes(e.target.value)}
                    rows={2} placeholder="Calm, explored hand freely" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Measurement Fields ── */}
            {type === "measurement" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Weight (g)">
                    <input type="number" value={weightGrams}
                      onChange={(e) => setWeightGrams(e.target.value)}
                      placeholder="142" className="input-field" />
                  </Field>
                  <Field label="Length (cm)">
                    <input type="number" value={lengthCm}
                      onChange={(e) => setLengthCm(e.target.value)}
                      placeholder="45" className="input-field" />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={measureNotes} onChange={(e) => setMeasureNotes(e.target.value)}
                    rows={2} placeholder="Post-feed weight" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Shedding Fields ── */}
            {type === "shedding" && (
              <div className="space-y-3">
                {/* Phase Selector */}
                <Field label="Shedding Phase">
                  <div className="flex gap-2">
                    <button onClick={() => setShedPhase("blue")}
                      className={cn("flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all",
                        shedPhase === "blue"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-400/20"
                          : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>🔵 Blue / Opaque</button>
                    <button onClick={() => setShedPhase("shed")}
                      className={cn("flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all",
                        shedPhase === "shed"
                          ? "bg-purple-500/20 text-purple-400 border border-purple-400/20"
                          : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>🐍 Shed</button>
                  </div>
                </Field>

                {/* Blue Phase — simplified: just note when blue started */}
                {shedPhase === "blue" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-500/[0.06] border border-blue-400/10 p-3">
                      <p className="text-[10px] text-blue-400/60">
                        Log when she goes blue/opaque. You can update this to a full shed record later.
                      </p>
                    </div>
                    <Field label="Notes">
                      <textarea value={shedNotes} onChange={(e) => setShedNotes(e.target.value)}
                        rows={2} placeholder="Eyes cloudy, belly pink..." className="input-field resize-none" />
                    </Field>
                  </div>
                )}

                {/* Shed Phase — full form */}
                {shedPhase === "shed" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Blue/Opaque Started">
                        <input type="date" value={blueDate}
                          onChange={(e) => setBlueDate(e.target.value)} className="input-field" />
                      </Field>
                      <Field label="Shed Date">
                        <input type="date" value={shedDate}
                          onChange={(e) => setShedDate(e.target.value)} className="input-field" />
                      </Field>
                    </div>
                    <Field label="Complete Shed?">
                      <div className="flex gap-2">
                        <button onClick={() => setComplete(true)}
                          className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                            complete ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                          )}>Complete</button>
                        <button onClick={() => setComplete(false)}
                          className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                            !complete ? "bg-amber-500/20 text-amber-400 border border-amber-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                          )}>Incomplete</button>
                      </div>
                    </Field>
                    <Field label="Quality">
                      <div className="flex gap-2">
                        {SHED_QUALITIES.map((q) => (
                          <button key={q} onClick={() => setShedQuality(q)}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-[10px] font-semibold capitalize transition-all",
                              shedQuality === q
                                ? "bg-purple-500/20 text-purple-400 border border-purple-400/20"
                                : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                            )}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Retained pieces (incomplete only) */}
                    {!complete && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">
                          Retained Pieces
                        </p>
                        {retainedPieces.map((piece, idx) => (
                          <div key={idx} className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <input value={piece.location}
                                onChange={(e) => updateRetainedPiece(idx, { location: e.target.value })}
                                placeholder="tail tip, eye caps…" className="input-field flex-1 !py-2 text-[11px]" />
                              <button onClick={() => removeRetainedPiece(idx)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10">
                                <Trash2 className="w-3 h-3 text-red-400/50" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Field label="Resolved Date">
                                <input type="date" value={piece.resolvedDate ?? ""}
                                  onChange={(e) => updateRetainedPiece(idx, { resolvedDate: e.target.value || undefined })}
                                  className="input-field !py-2 text-[11px]" />
                              </Field>
                              <Field label="Method">
                                <input value={piece.method ?? ""}
                                  onChange={(e) => updateRetainedPiece(idx, { method: e.target.value || undefined })}
                                  placeholder="soak, humid hide…" className="input-field !py-2 text-[11px]" />
                              </Field>
                            </div>
                          </div>
                        ))}
                        <button onClick={addRetainedPiece}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.04] text-[10px] font-semibold text-white/25">
                          <Plus className="w-3 h-3" /> Add Retained Piece
                        </button>
                      </div>
                    )}

                    <Field label="Notes">
                      <textarea value={shedNotes} onChange={(e) => setShedNotes(e.target.value)}
                        rows={2} placeholder="One piece, clean" className="input-field resize-none" />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* ── Aquarium: Feeding ──────────────────────────── */}
            {type === "feeding" && profileType === "aquarium" && (
              <div className="space-y-3">
                <Field label="Food Type">
                  <div className="flex flex-wrap gap-1.5">
                    {FOOD_TYPES.map((f) => (
                      <button key={f} type="button" onClick={() => setFoodType(f)}
                        className={cn("pill", foodType === f && "pill-active")}>
                        {f}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Brand">
                  <input value={brand} onChange={(e) => setBrand(e.target.value)}
                    placeholder="Hikari, Omega One…" className="input-field" />
                </Field>
                <Field label="Notes">
                  <textarea value={aquaFeedNotes} onChange={(e) => setAquaFeedNotes(e.target.value)}
                    rows={2} placeholder="Fed at 8am, all ate" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Water Change ───────────────────────────────── */}
            {type === "water_change" && (
              <div className="space-y-3">
                <Field label={`Water Changed: ${percentChanged}%`}>
                  <input type="range" min={5} max={100} step={5}
                    value={percentChanged} onChange={(e) => setPercentChanged(parseInt(e.target.value))}
                    className="w-full accent-cyan-400" />
                </Field>
                <Field label="Notes">
                  <textarea value={waterChangeNotes} onChange={(e) => setWaterChangeNotes(e.target.value)}
                    rows={2} placeholder="Gravel vac, dechlorinated…" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Water Test ─────────────────────────────────── */}
            {type === "water_test" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="pH">
                    <input type="number" step="0.1" value={pH} onChange={(e) => setPH(e.target.value)}
                      placeholder="7.0" className="input-field" />
                  </Field>
                  <Field label="Temp °F">
                    <input type="number" step="0.1" value={testTempF} onChange={(e) => setTestTempF(e.target.value)}
                      placeholder="78" className="input-field" />
                  </Field>
                  <Field label="Ammonia (ppm)">
                    <input type="number" step="0.1" value={ammonia} onChange={(e) => setAmmonia(e.target.value)}
                      placeholder="0" className="input-field" />
                  </Field>
                  <Field label="Nitrite (ppm)">
                    <input type="number" step="0.1" value={nitrite} onChange={(e) => setNitrite(e.target.value)}
                      placeholder="0" className="input-field" />
                  </Field>
                  <Field label="Nitrate (ppm)">
                    <input type="number" step="1" value={nitrate} onChange={(e) => setNitrate(e.target.value)}
                      placeholder="20" className="input-field" />
                  </Field>
                  <Field label="GH (dGH)">
                    <input type="number" step="1" value={GH} onChange={(e) => setGH(e.target.value)}
                      placeholder="8" className="input-field" />
                  </Field>
                  <Field label="KH (dKH)">
                    <input type="number" step="1" value={KH} onChange={(e) => setKH(e.target.value)}
                      placeholder="4" className="input-field" />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={testNotes} onChange={(e) => setTestNotes(e.target.value)}
                    rows={2} placeholder="API kit, strip test…" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Addition ───────────────────────────────────── */}
            {type === "addition" && (
              <div className="space-y-3">
                <Field label="Category">
                  <div className="flex flex-wrap gap-1.5">
                    {INHABITANT_CATEGORIES.map((c) => (
                      <button key={c} type="button" onClick={() => setAddCategory(c)}
                        className={cn("pill", addCategory === c && "pill-active")}>
                        {c}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Common Name">
                    <input value={addCommonName} onChange={(e) => setAddCommonName(e.target.value)}
                      placeholder="Neon Tetra" className="input-field" />
                  </Field>
                  <Field label="Species">
                    <input value={addSpecies} onChange={(e) => setAddSpecies(e.target.value)}
                      placeholder="P. innesi" className="input-field" />
                  </Field>
                  <Field label="Count">
                    <input type="number" min="1" value={addCount}
                      onChange={(e) => setAddCount(e.target.value)} className="input-field" />
                  </Field>
                  <Field label="Cost ($)">
                    <input type="number" step="0.01" value={addCost}
                      onChange={(e) => setAddCost(e.target.value)} placeholder="3.99" className="input-field" />
                  </Field>
                </div>
                <Field label="Source">
                  <input value={addSource} onChange={(e) => setAddSource(e.target.value)}
                    placeholder="PetSmart, aquabid, local breeder…" className="input-field" />
                </Field>
                <Field label="Notes">
                  <textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)}
                    rows={2} placeholder="Drip acclimated 45min" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Loss ───────────────────────────────────────── */}
            {type === "loss" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Common Name">
                    <input value={lossCommonName} onChange={(e) => setLossCommonName(e.target.value)}
                      placeholder="Neon Tetra" className="input-field" />
                  </Field>
                  <Field label="Species">
                    <input value={lossSpecies} onChange={(e) => setLossSpecies(e.target.value)}
                      placeholder="P. innesi" className="input-field" />
                  </Field>
                  <Field label="Count">
                    <input type="number" min="1" value={lossCount}
                      onChange={(e) => setLossCount(e.target.value)} className="input-field" />
                  </Field>
                </div>
                <Field label="Suspected Cause">
                  <div className="flex flex-wrap gap-1.5">
                    {LOSS_CAUSES.map((c) => (
                      <button key={c} type="button" onClick={() => setLossCause(c)}
                        className={cn("pill", lossCause === c && "pill-active")}>
                        {c.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea value={lossNotes} onChange={(e) => setLossNotes(e.target.value)}
                    rows={2} placeholder="Found after lights on…" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Maintenance ────────────────────────────────── */}
            {type === "maintenance" && (
              <div className="space-y-3">
                <Field label="Task">
                  <div className="flex flex-wrap gap-1.5">
                    {MAINTENANCE_TASKS.map((t) => (
                      <button key={t} type="button" onClick={() => setMaintTask(t)}
                        className={cn("pill", maintTask === t && "pill-active")}>
                        {t.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Equipment">
                  <input value={maintEquipment} onChange={(e) => setMaintEquipment(e.target.value)}
                    placeholder="HOB filter, sponge…" className="input-field" />
                </Field>
                <Field label="Notes">
                  <textarea value={maintNotes} onChange={(e) => setMaintNotes(e.target.value)}
                    rows={2} placeholder="Rinsed media in old tank water" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Medication ─────────────────────────────────── */}
            {type === "medication" && (
              <div className="space-y-3">
                <Field label="Medication Name">
                  <input value={medName} onChange={(e) => setMedName(e.target.value)}
                    placeholder="Seachem ParaGuard" className="input-field" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dose">
                    <input value={medDose} onChange={(e) => setMedDose(e.target.value)}
                      placeholder="5ml per 10gal" className="input-field" />
                  </Field>
                  <Field label="Target Species">
                    <input value={medTarget} onChange={(e) => setMedTarget(e.target.value)}
                      placeholder="All, or specific" className="input-field" />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={medNotes} onChange={(e) => setMedNotes(e.target.value)}
                    rows={2} placeholder="Day 3 of treatment" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Bedding Change ───────────────────────────────── */}
            {type === "bedding_change" && (
              <div className="space-y-3">
                <div className="rounded-xl bg-orange-500/[0.06] border border-orange-400/10 p-3">
                  <p className="text-[10px] text-orange-400/60">
                    🐍 Recommended: 4"+ depth for burrowing. Full change every 3–4 months.
                  </p>
                </div>
                <Field label="Substrate Type">
                  <div className="flex flex-wrap gap-1.5">
                    {SUBSTRATE_TYPES.map((s) => (
                      <button key={s} type="button" onClick={() => setSubstrateType(s)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all",
                          substrateType === s
                            ? "bg-orange-500/20 text-orange-400 border border-orange-400/20"
                            : "bg-white/[0.04] text-white/25 border border-white/[0.04]"
                        )}>
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Depth (inches)">
                  <input type="number" step="0.5" min="0" max="12"
                    value={depthInches} onChange={(e) => setDepthInches(e.target.value)}
                    placeholder="4" className="input-field" />
                </Field>
                <Field label="Change Type">
                  <div className="flex gap-2">
                    <button onClick={() => setFullChange(true)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        fullChange ? "bg-orange-500/20 text-orange-400 border border-orange-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>Full Change</button>
                    <button onClick={() => setFullChange(false)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        !fullChange ? "bg-amber-500/20 text-amber-400 border border-amber-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>Spot Replace</button>
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea value={beddingNotes} onChange={(e) => setBeddingNotes(e.target.value)}
                    rows={2} placeholder="Replaced all aspen, added fresh layer…" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Cleaning ─────────────────────────────────────── */}
            {type === "cleaning" && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-500/[0.06] border border-slate-400/10 p-3">
                  <p className="text-[10px] text-slate-400/60">
                    🧹 Spot clean daily. Scrub water bowl weekly with reptile-safe disinfectant.
                  </p>
                </div>
                <Field label="Scope">
                  <div className="flex gap-2">
                    {CLEANING_SCOPES.map((s) => (
                      <button key={s} onClick={() => setCleaningScope(s)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[11px] font-semibold capitalize transition-all",
                          cleaningScope === s
                            ? "bg-slate-400/20 text-slate-300 border border-slate-400/20"
                            : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                        )}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Disinfected?">
                  <div className="flex gap-2">
                    <button onClick={() => setDisinfected(true)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        disinfected ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>Yes</button>
                    <button onClick={() => setDisinfected(false)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        !disinfected ? "bg-white/[0.06] text-white/30 border border-white/[0.06]" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>No</button>
                  </div>
                </Field>
                {disinfected && (
                  <Field label="Disinfectant Used">
                    <input value={disinfectant} onChange={(e) => setDisinfectant(e.target.value)}
                      placeholder="Chlorhexidine, F10SC, diluted bleach…" className="input-field" />
                  </Field>
                )}
                <Field label="Water Bowl Cleaned?">
                  <div className="flex gap-2">
                    <button onClick={() => setWaterBowlCleaned(true)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        waterBowlCleaned ? "bg-cyan-500/20 text-cyan-400 border border-cyan-400/20" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>Yes</button>
                    <button onClick={() => setWaterBowlCleaned(false)}
                      className={cn("flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all",
                        !waterBowlCleaned ? "bg-white/[0.06] text-white/30 border border-white/[0.06]" : "bg-white/[0.04] text-white/20 border border-white/[0.04]"
                      )}>No</button>
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea value={cleaningNotes} onChange={(e) => setCleaningNotes(e.target.value)}
                    rows={2} placeholder="Removed poop from warm side, spot cleaned urates…" className="input-field resize-none" />
                </Field>
              </div>
            )}

            {/* ── Photo Upload ── */}
            <PhotoUpload
              value={photoUrl}
              onChange={setPhotoUrl}
              size="md"
              label="Attach Photo"
            />

          </div>

          {/* ── Sticky Save Footer ── */}
          <div className="px-5 pt-3 pb-5 shrink-0 border-t border-white/[0.04]">
            <button onClick={handleSave}
              className="w-full py-3 rounded-2xl bg-emerald-500/20 text-emerald-400 font-semibold text-[13px] hover:bg-emerald-500/30 active:scale-[0.98] transition-all">
              {initial ? "Update Event" : "Log Event"}
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
    <div className="space-y-1.5 min-w-0">
      <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
