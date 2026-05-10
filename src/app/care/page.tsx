/**
 * Care Calendar — Month-view care log with event creation.
 *
 * Shows a month grid with colored dots per event type,
 * tap a day to see events, + button to log new events.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Plus, Check, X, Pencil,
  Scale, Ruler, Hand, Droplets, Sun as SunIcon, Trash2,
} from "lucide-react";
import { CareEventEditor } from "@/components/blocks/care-event-editor";
import { ProfileSwitcher } from "@/components/blocks/profile-switcher";
import { PhotoThumb, PhotoLightbox } from "@/components/blocks/photo-upload";
import { useProfileStore } from "@/store/use-profile-store";
import { REPTILE_CARE_TYPES, AQUARIUM_CARE_TYPES } from "@/lib/schema";
import type { CareEvent, CareEventType, FeedingData, AquariumFeedingData, HandlingData, MeasurementData, SheddingData, ScheduleEventData, BeddingChangeData, CleaningData } from "@/lib/schema";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

const EVENT_COLORS: Record<string, string> = {
  feeding: "bg-amber-400",
  handling: "bg-blue-400",
  measurement: "bg-emerald-400",
  shedding: "bg-purple-400",
  schedule: "bg-orange-400",
  bedding_change: "bg-orange-400",
  cleaning: "bg-slate-400",
  // Aquarium
  water_change: "bg-cyan-400",
  water_test: "bg-teal-400",
  addition: "bg-green-400",
  loss: "bg-red-400",
  maintenance: "bg-slate-400",
  medication: "bg-violet-400",
};

const EVENT_LABELS: Record<string, string> = {
  feeding: "Feeding",
  handling: "Handling",
  measurement: "Measurement",
  shedding: "Shedding",
  schedule: "Schedule",
  bedding_change: "Bedding",
  cleaning: "Cleaning",
  // Aquarium
  water_change: "Water Change",
  water_test: "Water Test",
  addition: "Addition",
  loss: "Loss",
  maintenance: "Maintenance",
  medication: "Medication",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

function formatMonth(year: number, month: number) {
  return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toMonthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default function CarePage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate());
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CareEvent | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  const [filter, setFilter] = useState<CareEventType | "all">("all");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [careStats, setCareStats] = useState<any>(null);
  const { activeProfileId, activeProfile } = useProfileStore();
  const profile = activeProfile();
  const profileType = profile?.type ?? "reptile";
  const careTypes = profileType === "aquarium" ? AQUARIUM_CARE_TYPES : REPTILE_CARE_TYPES;

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/care?month=${toMonthStr(year, month)}&profileId=${activeProfileId}`);
      if (res.ok) setEvents(await res.json());
    } catch (err) { console.error("Failed to fetch care events:", err); }
  }, [year, month, activeProfileId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Fetch care stats for inline enrichment
  useEffect(() => {
    if (!activeProfileId) return;
    fetch(`/api/care/stats?profileId=${activeProfileId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setCareStats)
      .catch(() => {});
  }, [activeProfileId, events]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDay(null);
  }

  async function handleSaveEvent(event: CareEvent) {
    await fetch("/api/care", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, profileId: activeProfileId }),
    });
    setEditingEvent(null);
    fetchEvents();
  }

  async function handleDeleteEvent(id: string) {
    await fetch(`/api/care?id=${id}`, { method: "DELETE" });
    fetchEvents();
  }

  const days = getMonthDays(year, month);
  const isToday = (day: number) => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
  };

  // Group events by date for dot rendering
  const eventsByDate = new Map<string, Set<string>>();
  for (const e of events) {
    const existing = eventsByDate.get(e.date) ?? new Set();
    existing.add(e.type);
    eventsByDate.set(e.date, existing);
  }

  // Events for selected day
  const selectedDateStr = selectedDay ? toDateStr(year, month, selectedDay) : null;
  const dayEvents = selectedDateStr
    ? events
        .filter((e) => e.date === selectedDateStr && (filter === "all" || e.type === filter))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 pt-5 pb-24">
      <motion.div variants={item} className="flex items-center justify-between px-0.5">
        <h1 className="text-[26px] font-extrabold tracking-tight leading-none">Care Log</h1>
        <div className="flex items-center gap-2">
          <ProfileSwitcher />
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => { setEditingEvent(null); setEditorOpen(true); }}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400/80 px-3.5 py-2 rounded-xl glass-green touch-card"
          >
            <Plus className="w-3.5 h-3.5" />
            Log
          </motion.button>
        </div>
      </motion.div>

      {/* ── Compact Profile Chip ── */}
      {careStats?.inhabitant?.lifeStage && (
        <motion.div variants={item} className="flex gap-2 items-center px-1">
          <span className="text-[13px]">{careStats.inhabitant.lifeStage.emoji}</span>
          <span className={cn("text-[11px] font-bold", careStats.inhabitant.lifeStage.color)}>
            {careStats.inhabitant.lifeStage.label}
          </span>
          {careStats.inhabitant.currentWeightG && (
            <span className="text-[10px] text-white/30">{careStats.inhabitant.currentWeightG}g</span>
          )}
          {careStats.inhabitant.growthAssessment && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md",
              careStats.inhabitant.growthAssessment.status === "on-track" ? "bg-emerald-500/10 text-emerald-300/60" : "bg-amber-500/10 text-amber-300/60"
            )}>{careStats.inhabitant.growthAssessment.percentile}</span>
          )}
        </motion.div>
      )}

      {/* Month Navigation */}
      <motion.div variants={item} className="glass rounded-[20px] p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-white/[0.06] touch-card">
            <ChevronLeft className="w-4 h-4 text-white/40" />
          </button>
          <span className="text-[14px] font-bold text-white/70">{isMounted ? formatMonth(year, month) : ""}</span>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-white/[0.06] touch-card">
            <ChevronRight className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[8px] font-semibold text-white/15 uppercase tracking-wider py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const dateStr = toDateStr(year, month, day);
            const types = eventsByDate.get(dateStr);
            const selected = day === selectedDay;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                className={cn(
                  "relative flex flex-col items-center py-1.5 rounded-xl transition-all touch-card",
                  selected && "bg-white/[0.08] border border-white/[0.08]",
                  isToday(day) && !selected && "bg-emerald-500/10",
                  !selected && !isToday(day) && "hover:bg-white/[0.04]"
                )}
              >
                <span className={cn(
                  "text-[11px] font-semibold tabular-nums",
                  isToday(day) ? "text-emerald-400" : selected ? "text-white/70" : "text-white/30"
                )}>
                  {day}
                </span>
                {types && types.size > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from(types).slice(0, 3).map((t) => (
                      <div key={t} className={cn("w-1 h-1 rounded-full", EVENT_COLORS[t])} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Filter Pills */}
      <motion.div variants={item} className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {profileType === "aquarium" ? (
          <>
            <FilterPill label="Feeding" color="bg-amber-400" active={filter === "feeding"} onClick={() => setFilter("feeding")} />
            <FilterPill label="Water Δ" color="bg-cyan-400" active={filter === "water_change"} onClick={() => setFilter("water_change")} />
            <FilterPill label="Test" color="bg-teal-400" active={filter === "water_test"} onClick={() => setFilter("water_test")} />
            <FilterPill label="Added" color="bg-green-400" active={filter === "addition"} onClick={() => setFilter("addition")} />
            <FilterPill label="Loss" color="bg-red-400" active={filter === "loss"} onClick={() => setFilter("loss")} />
            <FilterPill label="Maint" color="bg-slate-400" active={filter === "maintenance"} onClick={() => setFilter("maintenance")} />
            <FilterPill label="Meds" color="bg-violet-400" active={filter === "medication"} onClick={() => setFilter("medication")} />
          </>
        ) : (
          <>
            <FilterPill label="Feeding" color="bg-amber-400" active={filter === "feeding"} onClick={() => setFilter("feeding")} />
            <FilterPill label="Handling" color="bg-blue-400" active={filter === "handling"} onClick={() => setFilter("handling")} />
            <FilterPill label="Weight" color="bg-emerald-400" active={filter === "measurement"} onClick={() => setFilter("measurement")} />
            <FilterPill label="Shedding" color="bg-purple-400" active={filter === "shedding"} onClick={() => setFilter("shedding")} />
            <FilterPill label="Bedding" color="bg-yellow-600" active={filter === "bedding_change"} onClick={() => setFilter("bedding_change")} />
            <FilterPill label="Cleaning" color="bg-sky-400" active={filter === "cleaning"} onClick={() => setFilter("cleaning")} />
            <FilterPill label="Schedule" color="bg-orange-400" active={filter === "schedule"} onClick={() => setFilter("schedule")} />
          </>
        )}
      </motion.div>

      {/* Selected Day Events */}
      <AnimatePresence mode="wait">
        {selectedDay && (
          <motion.div
            key={`day-${selectedDay}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-2.5"
          >
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-wider px-0.5">
              {isMounted && new Date(year, month, selectedDay).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              })}
              {isMounted && dayEvents.length > 0 && ` · ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}`}
            </p>

            {dayEvents.length === 0 ? (
              <div className="glass rounded-[20px] p-6 text-center">
                <p className="text-[12px] text-white/20">No events logged</p>
                <button
                  onClick={() => { setEditingEvent(null); setEditorOpen(true); }}
                  className="mt-3 text-[11px] font-semibold text-emerald-400/60 hover:text-emerald-400"
                >
                  + Log something
                </button>
              </div>
            ) : (
              dayEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  careStats={careStats}
                  onEdit={() => { setEditingEvent(event); setEditorOpen(true); }}
                  onDelete={() => handleDeleteEvent(event.id)}
                  onLightbox={(url) => setLightboxUrl(url)}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor Sheet */}
      <CareEventEditor
        open={editorOpen}
        initial={editingEvent}
        defaultDate={selectedDateStr ?? undefined}
        profileType={profileType}
        onSave={handleSaveEvent}
        onClose={() => { setEditorOpen(false); setEditingEvent(null); }}
      />

      {/* Photo Lightbox */}
      {isMounted && lightboxUrl && (
        <PhotoLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </motion.div>
  );
}

/* ─── Filter Pill ─────────────────────────────────────────────────────────── */
function FilterPill({
  label, color, active, onClick,
}: {
  label: string; color?: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all",
        active ? "bg-white/[0.08] text-white/60" : "bg-white/[0.03] text-white/20"
      )}
    >
      {color && <div className={cn("w-1.5 h-1.5 rounded-full", color)} />}
      {label}
    </button>
  );
}

/* ─── Event Card ──────────────────────────────────────────────────────────── */
function EventCard({
  event, careStats, onEdit, onDelete, onLightbox,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: CareEvent; careStats: any; onEdit: () => void; onDelete: () => void; onLightbox?: (url: string) => void;
}) {
  const d = event.data;
  const feedRec = careStats?.feeding?.recommendation;
  const feedInfo = careStats?.feeding;
  const handlingInfo = careStats?.handling;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-[20px] p-4 space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", EVENT_COLORS[event.type])} />
          <span className="text-[12px] font-semibold text-white/60">
            {EVENT_LABELS[event.type]}
          </span>
          {event.time && (
            <span className="text-[10px] text-white/25 ml-1">{event.time}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/20 hover:text-white/40"
            title="Edit event">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-400/50"
            title="Delete event">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Feeding Card ── */}
      {event.type === "feeding" && "preyType" in d && (() => {
        const fd = d as FeedingData;
        const weightG = careStats?.inhabitant?.currentWeightG;
        const pctOfBw = weightG && fd.preyWeightGrams
          ? Math.round((fd.preyWeightGrams / weightG) * 100)
          : null;
        return (
          <>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                fd.accepted ? "bg-emerald-500/10" : "bg-red-500/10"
              )}>
                {fd.accepted
                  ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                  : <X className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/50 capitalize">
                  {fd.preyType}
                  {fd.preyWeightGrams ? ` · ${fd.preyWeightGrams}g` : ""}
                  {pctOfBw ? ` (${pctOfBw}% BW)` : ""}
                </p>
                {fd.notes && (
                  <p className="text-[9px] text-white/20 mt-0.5">{fd.notes}</p>
                )}
              </div>
            </div>
            {/* Inline feeding intelligence */}
            {feedRec && (
              <div className="ml-11 space-y-1 mt-1">
                <p className="text-[9px] text-white/25">
                  Rec: <span className="text-white/40 capitalize">{feedRec.preyLabel}</span>
                  {feedRec.preyWeightRange && (
                    <span> · {feedRec.preyWeightRange.min}–{feedRec.preyWeightRange.max}g</span>
                  )}
                  {feedRec.percentOfBodyWeight && (
                    <span className="text-white/20"> ({feedRec.percentOfBodyWeight})</span>
                  )}
                </p>
                {feedInfo?.nextFeedWindow && (
                  <p className="text-[9px] text-white/20">
                    Next: {feedInfo.nextFeedWindow.earliest} → {feedInfo.nextFeedWindow.latest}
                  </p>
                )}
                {fd.preyWeightGrams && feedRec.preyWeightRange && (
                  fd.preyWeightGrams < feedRec.preyWeightRange.min ? (
                    <p className="text-[8px] text-amber-300/50">💡 {feedRec.sizeUpTip}</p>
                  ) : fd.preyWeightGrams > feedRec.preyWeightRange.max ? (
                    <p className="text-[8px] text-amber-300/50">⚠️ {feedRec.sizeDownTip}</p>
                  ) : null
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Aquarium Feeding Card ── */}
      {event.type === "feeding" && "foodType" in d && (() => {
        const fd = d as AquariumFeedingData;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/10">
              <Check className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/50 capitalize">
                {fd.foodType}{fd.brand ? ` · ${fd.brand}` : ""}
              </p>
              {fd.notes && (
                <p className="text-[9px] text-white/20 mt-0.5">{fd.notes}</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Handling Card ── */}
      {event.type === "handling" && "startTime" in d && (() => {
        const hd = d as HandlingData;
        const start = hd.startTime?.split(":").map(Number);
        const end = hd.endTime?.split(":").map(Number);
        const durationMin = start && end && start.length === 2 && end.length === 2
          ? (end[0] * 60 + end[1]) - (start[0] * 60 + start[1])
          : null;
        return (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/10">
                <Hand className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/50">
                  {hd.startTime} – {hd.endTime}
                  {durationMin && durationMin > 0 ? ` · ${durationMin}m` : ""}
                  {" · "}{hd.temperament}
                </p>
                {hd.notes && (
                  <p className="text-[9px] text-white/20 mt-0.5">{hd.notes}</p>
                )}
              </div>
            </div>
            {handlingInfo && (
              <div className="ml-11 mt-1 flex gap-3">
                <p className="text-[9px] text-white/20">
                  Week: <span className="text-white/35">{handlingInfo.thisWeek.sessions} sessions · {handlingInfo.thisWeek.totalMinutes}m</span>
                </p>
                {handlingInfo.last30Days.dominantTemperament && (
                  <p className="text-[9px] text-white/20">
                    Trend: <span className="text-white/35 capitalize">{handlingInfo.last30Days.dominantTemperament}</span>
                  </p>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Measurement Card ── */}
      {event.type === "measurement" && "weightGrams" in d && (() => {
        const md = d as MeasurementData;
        const ga = careStats?.inhabitant?.growthAssessment;
        return (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-white/50">
                  {md.weightGrams}g
                  {md.lengthCm ? ` · ${md.lengthCm}cm` : ""}
                </p>
                {md.notes && (
                  <p className="text-[9px] text-white/20 mt-0.5">{md.notes}</p>
                )}
              </div>
            </div>
            {ga && (
              <div className={cn(
                "ml-11 mt-1 text-[9px] px-2 py-1 rounded-lg",
                ga.status === "underweight" ? "bg-red-500/10 text-red-300/60"
                : ga.status === "on-track" ? "bg-emerald-500/10 text-emerald-300/60"
                : "bg-amber-500/10 text-amber-300/60"
              )}>
                {ga.percentile} — {ga.message}
              </div>
            )}
          </>
        );
      })()}

      {event.type === "shedding" && "complete" in d && (() => {
        const sd = d as SheddingData;
        const isBluePhase = !sd.shedDate && sd.blueDate;
        return (
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
              isBluePhase ? "bg-blue-500/10" : "bg-purple-500/10"
            )}>
              <Droplets className={cn("w-3.5 h-3.5", isBluePhase ? "text-blue-400" : "text-purple-400")} />
            </div>
            <div>
              {isBluePhase ? (
                <>
                  <p className="text-[11px] text-blue-400/70 font-semibold">🔵 Blue / Opaque</p>
                  <p className="text-[9px] text-white/20">Started {sd.blueDate}</p>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-white/50 capitalize">
                    {sd.quality} · {sd.complete ? "Complete" : "Incomplete"}
                  </p>
                  {sd.blueDate && <p className="text-[9px] text-white/20">Blue: {sd.blueDate}</p>}
                  {sd.shedDate && <p className="text-[9px] text-white/20">Shed: {sd.shedDate}</p>}
                </>
              )}
              {!sd.complete && sd.retainedPieces?.map((rp, i) => (
                <p key={i} className="text-[9px] text-amber-400/40">
                  Retained: {rp.location}{rp.resolvedDate ? ` → resolved ${rp.resolvedDate}` : " (pending)"}
                </p>
              ))}
              {sd.notes && <p className="text-[9px] text-white/20 mt-0.5">{sd.notes}</p>}
            </div>
          </div>
        );
      })()}

      {event.type === "schedule" && "controlLabel" in d && (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-500/10">
            <SunIcon className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-[11px] text-white/50">
              {(d as ScheduleEventData).controlLabel}: {(d as ScheduleEventData).action.toUpperCase()}
            </p>
            <p className="text-[9px] text-white/20">{(d as ScheduleEventData).trigger}</p>
          </div>
        </div>
      )}

      {/* ── Bedding Change Card ── */}
      {event.type === "bedding_change" && "substrateType" in d && (() => {
        const bd = d as BeddingChangeData;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-500/10">
              <span className="text-sm">🧱</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-white/50 capitalize">{bd.substrateType.replace(/_/g, " ")}</p>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase",
                  bd.fullChange ? "bg-orange-500/15 text-orange-400" : "bg-amber-500/15 text-amber-400"
                )}>
                  {bd.fullChange ? "Full Change" : "Spot"}
                </span>
              </div>
              {bd.depthInches && <p className="text-[9px] text-white/20">Depth: {bd.depthInches}"</p>}
              {bd.notes && <p className="text-[9px] text-white/20 italic">{bd.notes}</p>}
            </div>
          </div>
        );
      })()}

      {/* ── Cleaning Card ── */}
      {event.type === "cleaning" && "scope" in d && (() => {
        const cl = d as CleaningData;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-500/10">
              <span className="text-sm">🧹</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase bg-slate-500/15 text-slate-300">
                  {cl.scope}
                </span>
                {cl.disinfected && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-emerald-500/15 text-emerald-400">
                    ✨ Disinfected{cl.disinfectant ? ` (${cl.disinfectant})` : ""}
                  </span>
                )}
                {cl.waterBowlCleaned && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-cyan-500/15 text-cyan-400">
                    💧 Bowl
                  </span>
                )}
              </div>
              {cl.notes && <p className="text-[9px] text-white/20 italic mt-0.5">{cl.notes}</p>}
            </div>
          </div>
        );
      })()}

      {/* Photo thumbnails — tap to expand */}
      {(() => {
        const photos = event.photoUrls?.length ? event.photoUrls
          : event.photoUrl ? [event.photoUrl]
          : [];
        if (!photos.length) return null;
        return (
          <div className="flex flex-row gap-1.5 flex-wrap">
            {photos.map((url, i) => (
              <PhotoThumb
                key={url}
                src={url}
                size={64}
                className="rounded-xl"
                onClick={() => onLightbox?.(url)}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        );
      })()}
    </motion.div>
  );
}
