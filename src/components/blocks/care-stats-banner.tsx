/**
 * Care Stats Banner
 *
 * Horizontal scrollable stats bar shown at the top of the Care page.
 * Displays feeding schedule, handling averages, growth trend, and temp extremes.
 * Each chip is tappable to show expanded detail in a tooltip popover.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/store/use-profile-store";
import { useDashboardStore } from "@/store/use-dashboard-store";

interface CareStatsData {
  inhabitant: {
    name: string;
    lifeStage: { id: string; label: string; emoji: string; color: string; description: string } | null;
    currentWeightG: number | null;
    growthAssessment: { status: string; message: string; percentile: string } | null;
    morph: string | null;
    sex: string | null;
  } | null;
  feeding: {
    recommendation: {
      preyType: string;
      preyLabel: string;
      preyWeightRange: { min: number; max: number } | null;
      percentOfBodyWeight: string | null;
      sizeUpTip: string;
      sizeDownTip: string;
    } | null;
    schedule: {
      recommendedIntervalDays: [number, number];
      actualAvgIntervalDays: number | null;
    } | null;
    lastFed: { date: string; preyType: string; preyWeightG: number | null; accepted: boolean } | null;
    daysSinceLastFeed: number | null;
    status: string;
    nextFeedWindow: { earliest: string; latest: string } | null;
    history: {
      totalFeedings: number;
      acceptanceRate: number | null;
      avgIntervalDays: number | null;
      refusalStreak: number;
    };
    digestion: {
      lumpStatus: string;
      hoursSinceFeeding: number;
      observedAt: string;
    } | null;
  };
  handling: {
    thisWeek: { sessions: number; totalMinutes: number; avgMinutesPerSession: number };
    last30Days: {
      sessions: number;
      totalMinutes: number;
      avgMinutesPerDay: number;
      avgMinutesPerSession: number;
      dominantTemperament: string | null;
    };
  };
  growth: {
    measurements: { date: string; weightG: number; lengthCm?: number }[];
    growthRateGPerMonth: number | null;
  };
}

interface TempExtremes {
  daytime: { high: number; low: number; avg: number } | null;
  nighttime: { high: number; low: number; avg: number } | null;
  overall: { high: number; low: number; avg: number } | null;
}

export function CareStatsBanner() {
  const { activeProfileId } = useProfileStore();
  const sensors = useDashboardStore((s) => s.sensors);
  const [stats, setStats] = useState<CareStatsData | null>(null);
  const [tempExtremes, setTempExtremes] = useState<Record<string, TempExtremes>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await fetch(`/api/care/stats?profileId=${activeProfileId}`);
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Failed to fetch care stats:", err);
    }
  }, [activeProfileId]);

  const fetchTemps = useCallback(async () => {
    // Find temperature sensors
    const tempSensors = sensors.filter((s) =>
      s.id.toLowerCase().includes("temp") || s.label?.toLowerCase().includes("temp")
    );
    const results: Record<string, TempExtremes> = {};
    for (const sensor of tempSensors.slice(0, 3)) {
      try {
        const res = await fetch(`/api/sensors/extremes?id=${sensor.id}&range=7d`);
        if (res.ok) results[sensor.id] = await res.json();
      } catch { /* ignore */ }
    }
    setTempExtremes(results);
  }, [sensors]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTemps(); }, [fetchTemps]);

  if (!stats?.inhabitant?.lifeStage && Object.keys(tempExtremes).length === 0) return null;

  const inh = stats?.inhabitant;
  const feed = stats?.feeding;
  const handling = stats?.handling;
  const growth = stats?.growth;

  function toggleExpand(key: string) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {/* ── Life Stage Chip ── */}
        {inh?.lifeStage && (
          <StatChip
            label={`${inh.lifeStage.emoji} ${inh.lifeStage.label}`}
            value={inh.currentWeightG ? `${inh.currentWeightG}g` : "—"}
            sub={inh.growthAssessment?.percentile ?? ""}
            color={inh.lifeStage.color}
            active={expanded === "stage"}
            onClick={() => toggleExpand("stage")}
          />
        )}

        {/* ── Feeding Chip ── */}
        {feed && (
          <StatChip
            label="🍽️ Feed"
            value={
              feed.status === "recently_fed" ? "Fed today"
              : feed.status === "overdue" ? `${feed.daysSinceLastFeed}d overdue`
              : feed.status === "due_soon" ? "Due soon"
              : feed.daysSinceLastFeed !== null ? `${feed.daysSinceLastFeed}d ago`
              : "—"
            }
            sub={feed.schedule ? `${feed.schedule.recommendedIntervalDays[0]}–${feed.schedule.recommendedIntervalDays[1]}d cycle` : ""}
            color={
              feed.status === "overdue" ? "text-red-400"
              : feed.status === "due_soon" ? "text-amber-400"
              : "text-emerald-400"
            }
            active={expanded === "feed"}
            onClick={() => toggleExpand("feed")}
          />
        )}

        {/* ── Digestion Chip ── */}
        {feed?.digestion && (
          <StatChip
            label="🔍 Digest"
            value={
              feed.digestion.lumpStatus === "no_lump" ? "✓ No lump"
              : feed.digestion.lumpStatus === "lump_visible" ? "⚠ Lump"
              : "🚨 Regurg"
            }
            sub={`${Math.round(feed.digestion.hoursSinceFeeding)}h post-feed`}
            color={
              feed.digestion.lumpStatus === "no_lump" ? "text-emerald-400"
              : feed.digestion.lumpStatus === "lump_visible" ? "text-amber-400"
              : "text-red-400"
            }
            active={expanded === "digest"}
            onClick={() => toggleExpand("digest")}
          />
        )}

        {/* ── Handling Chip ── */}
        {handling && handling.last30Days.sessions > 0 && (
          <StatChip
            label="🖐 Handle"
            value={`${handling.last30Days.avgMinutesPerDay}m/day`}
            sub={`${handling.thisWeek.sessions}/wk`}
            color="text-blue-400"
            active={expanded === "handle"}
            onClick={() => toggleExpand("handle")}
          />
        )}

        {/* ── Growth Chip ── */}
        {growth && growth.growthRateGPerMonth !== null && (
          <StatChip
            label="⚖️ Growth"
            value={`${growth.growthRateGPerMonth > 0 ? "+" : ""}${growth.growthRateGPerMonth}g/mo`}
            sub={inh?.currentWeightG ? `${inh.currentWeightG}g` : ""}
            color={growth.growthRateGPerMonth > 0 ? "text-emerald-400" : "text-amber-400"}
            active={expanded === "growth"}
            onClick={() => toggleExpand("growth")}
          />
        )}

        {/* ── Temp Chips ── */}
        {Object.entries(tempExtremes).map(([sensorId, ext]) => {
          const sensor = sensors.find((s) => s.id === sensorId);
          const label = sensor?.label ?? sensorId;
          const shortLabel = label.replace(/temperature/i, "").replace(/temp/i, "").trim() || "Temp";
          return ext.daytime ? (
            <StatChip
              key={sensorId}
              label={`🌡 ${shortLabel}`}
              value={`${ext.daytime.high}°`}
              sub={`Lo ${ext.nighttime?.low ?? "—"}°`}
              color="text-orange-400"
              active={expanded === sensorId}
              onClick={() => toggleExpand(sensorId)}
            />
          ) : null;
        })}
      </div>

      {/* ── Expanded Detail Panel ── */}
      <AnimatePresence mode="wait">
        {expanded && (
          <motion.div
            key={expanded}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-2xl p-4 space-y-2">
              {expanded === "stage" && inh && (
                <StageDetail inhabitant={inh} />
              )}
              {expanded === "feed" && feed && (
                <FeedDetail feeding={feed} weightG={inh?.currentWeightG ?? null} />
              )}
              {expanded === "handle" && handling && (
                <HandleDetail handling={handling} />
              )}
              {expanded === "growth" && growth && inh && (
                <GrowthDetail growth={growth} inhabitant={inh} />
              )}
              {expanded && tempExtremes[expanded] && (
                <TempDetail
                  label={sensors.find((s) => s.id === expanded)?.label ?? expanded}
                  data={tempExtremes[expanded]}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Stat Chip ───────────────────────────────────────────────────────────── */

function StatChip({
  label, value, sub, color, active, onClick,
}: {
  label: string; value: string; sub: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[90px]",
        active ? "glass border border-white/[0.08]" : "bg-white/[0.03] hover:bg-white/[0.06]"
      )}
    >
      <span className="text-[9px] font-semibold text-white/30 uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <span className={cn("text-[14px] font-bold whitespace-nowrap", color)}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] text-white/20 whitespace-nowrap">{sub}</span>
      )}
    </motion.button>
  );
}

/* ─── Detail Panels ───────────────────────────────────────────────────────── */

function StageDetail({ inhabitant }: { inhabitant: NonNullable<CareStatsData["inhabitant"]> }) {
  const ls = inhabitant.lifeStage;
  const ga = inhabitant.growthAssessment;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[16px]">{ls?.emoji}</span>
        <span className={cn("text-[14px] font-bold", ls?.color)}>{ls?.label}</span>
        {inhabitant.sex && (
          <span className="text-[10px] text-white/30 bg-white/[0.06] px-1.5 py-0.5 rounded-md">
            {inhabitant.sex === "female" ? "♀" : "♂"} {inhabitant.sex}
          </span>
        )}
      </div>
      {inhabitant.morph && (
        <p className="text-[10px] text-white/25 italic">{inhabitant.morph}</p>
      )}
      <p className="text-[11px] text-white/40">{ls?.description}</p>
      {ga && (
        <div className={cn(
          "text-[10px] p-2 rounded-lg",
          ga.status === "underweight" ? "bg-red-500/10 text-red-300"
          : ga.status === "above-average" ? "bg-amber-500/10 text-amber-300"
          : "bg-emerald-500/10 text-emerald-300"
        )}>
          <span className="font-semibold">{ga.percentile} percentile</span> — {ga.message}
        </div>
      )}
    </div>
  );
}

function FeedDetail({
  feeding, weightG,
}: {
  feeding: CareStatsData["feeding"]; weightG: number | null;
}) {
  const rec = feeding.recommendation;
  const hist = feeding.history;
  return (
    <div className="space-y-2.5">
      {rec && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Recommended Prey</p>
          <p className="text-[13px] text-white/70">
            <span className="font-semibold capitalize">{rec.preyLabel}</span>
            {rec.preyWeightRange && (
              <span className="text-white/40"> · {rec.preyWeightRange.min}–{rec.preyWeightRange.max}g</span>
            )}
            {rec.percentOfBodyWeight && (
              <span className="text-white/25"> ({rec.percentOfBodyWeight} of BW)</span>
            )}
          </p>
        </div>
      )}
      {feeding.nextFeedWindow && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Next Feed Window</p>
          <p className="text-[12px] text-white/50">
            {feeding.nextFeedWindow.earliest} → {feeding.nextFeedWindow.latest}
          </p>
        </div>
      )}
      {/* Size up/down tips moved to care-event-editor — only shown when editing a feeding */}
      <div className="flex gap-3">
        {hist.acceptanceRate !== null && (
          <MiniStat label="Accept %" value={`${hist.acceptanceRate}%`} />
        )}
        {hist.avgIntervalDays !== null && (
          <MiniStat label="Avg interval" value={`${hist.avgIntervalDays}d`} />
        )}
        <MiniStat label="Total feeds" value={`${hist.totalFeedings}`} />
        {hist.refusalStreak > 0 && (
          <MiniStat label="Refusal streak" value={`${hist.refusalStreak}`} color="text-red-400" />
        )}
      </div>
    </div>
  );
}

function HandleDetail({ handling }: { handling: CareStatsData["handling"] }) {
  const week = handling.thisWeek;
  const month = handling.last30Days;
  return (
    <div className="space-y-2">
      <div className="flex gap-3 flex-wrap">
        <MiniStat label="This week" value={`${week.sessions} sessions`} />
        <MiniStat label="Week total" value={`${week.totalMinutes} min`} />
        <MiniStat label="30-day avg" value={`${month.avgMinutesPerDay} min/day`} />
        <MiniStat label="Per session" value={`${month.avgMinutesPerSession} min`} />
      </div>
      {month.dominantTemperament && (
        <p className="text-[10px] text-white/30">
          Most common temperament: <span className="text-white/50 capitalize font-medium">{month.dominantTemperament}</span>
        </p>
      )}
    </div>
  );
}

function GrowthDetail({
  growth, inhabitant,
}: {
  growth: CareStatsData["growth"]; inhabitant: NonNullable<CareStatsData["inhabitant"]>;
}) {
  const ga = inhabitant.growthAssessment;
  return (
    <div className="space-y-2">
      {growth.growthRateGPerMonth !== null && (
        <p className="text-[12px] text-white/50">
          Growth rate: <span className="font-bold text-white/70">{growth.growthRateGPerMonth > 0 ? "+" : ""}{growth.growthRateGPerMonth}g/month</span>
        </p>
      )}
      {growth.measurements.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {growth.measurements.slice(-6).map((m, i) => (
            <div key={i} className="flex-shrink-0 text-center">
              <p className="text-[12px] font-bold text-white/50">{m.weightG}g</p>
              <p className="text-[8px] text-white/20">{m.date.slice(5)}</p>
            </div>
          ))}
        </div>
      )}
      {ga && (
        <p className={cn(
          "text-[10px]",
          ga.status === "underweight" ? "text-red-300/60"
          : ga.status === "above-average" ? "text-amber-300/60"
          : "text-emerald-300/60"
        )}>
          {ga.message}
        </p>
      )}
    </div>
  );
}

function TempDetail({ label, data }: { label: string; data: TempExtremes }) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-bold text-white/50">{label} — 7 Day Extremes</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[9px] font-bold text-white/30 uppercase">Overall</p>
          <p className="text-[13px] font-bold text-white/60">
            {data.overall?.high ?? "—"}° <span className="text-white/25">/ {data.overall?.low ?? "—"}°</span>
          </p>
          <p className="text-[9px] text-white/20">avg {data.overall?.avg ?? "—"}°</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] font-bold text-amber-400/50 uppercase">☀ Day</p>
          <p className="text-[13px] font-bold text-amber-300/70">
            {data.daytime?.high ?? "—"}° <span className="text-white/25">/ {data.daytime?.low ?? "—"}°</span>
          </p>
          <p className="text-[9px] text-white/20">avg {data.daytime?.avg ?? "—"}°</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] font-bold text-blue-400/50 uppercase">🌙 Night</p>
          <p className="text-[13px] font-bold text-blue-300/70">
            {data.nighttime?.high ?? "—"}° <span className="text-white/25">/ {data.nighttime?.low ?? "—"}°</span>
          </p>
          <p className="text-[9px] text-white/20">avg {data.nighttime?.avg ?? "—"}°</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-shrink-0">
      <p className="text-[8px] font-bold text-white/20 uppercase tracking-wider">{label}</p>
      <p className={cn("text-[12px] font-bold", color ?? "text-white/50")}>{value}</p>
    </div>
  );
}
