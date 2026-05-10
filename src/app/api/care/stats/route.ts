/**
 * Care Stats API
 *
 * GET /api/care/stats?profileId=xxx
 *
 * Returns derived care intelligence: feeding recommendations, handling averages,
 * growth assessment, and schedule tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { listCareEvents } from "@/lib/db";
import { listInhabitants } from "@/lib/db";
import {
  getSpeciesProfile,
  getLifeStage,
  getPreyRecommendation,
  assessGrowth,
  calcPreyWeight,
} from "@/lib/species-profiles";
import type { CareEvent, FeedingData, HandlingData, MeasurementData } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "Missing ?profileId=" }, { status: 400 });
  }

  // Get all care events (no month filter = all time)
  const allEvents = listCareEvents(undefined, undefined, profileId);

  // Get inhabitants for this profile
  const inhabitants = listInhabitants(profileId)
    .filter((i) => i.status === "alive" && i.speciesProfileId);

  // Pick the first reptile inhabitant with a species profile
  const inhabitant = inhabitants[0];
  if (!inhabitant?.speciesProfileId) {
    return NextResponse.json({
      feeding: null,
      handling: null,
      growth: null,
      inhabitant: null,
    });
  }

  const speciesProfile = getSpeciesProfile(inhabitant.speciesProfileId);
  if (!speciesProfile) {
    return NextResponse.json({ error: `Unknown species profile: ${inhabitant.speciesProfileId}` }, { status: 404 });
  }

  // ── Measurements: get latest weight/length ──
  const measurements = allEvents
    .filter((e): e is CareEvent & { data: MeasurementData } => e.type === "measurement")
    .sort((a, b) => b.date.localeCompare(a.date));

  const latestMeasurement = measurements[0];
  const currentWeightG = latestMeasurement?.data?.weightGrams ?? null;
  const currentLengthCm = latestMeasurement?.data?.lengthCm ?? null;

  // ── Life stage + prey recommendation ──
  const lifeStage = currentWeightG ? getLifeStage(speciesProfile, currentWeightG) : null;
  const preyRec = currentWeightG ? getPreyRecommendation(speciesProfile, currentWeightG) : null;
  const preyWeightRange = currentWeightG && lifeStage
    ? calcPreyWeight(lifeStage, currentWeightG)
    : null;

  // ── Growth assessment ──
  const sex = inhabitant.sex as "male" | "female" | "unsexed" | undefined;
  let growthAssessment = null;
  if (currentWeightG && sex && sex !== "unsexed" && inhabitant.birthDate) {
    const birthMs = new Date(inhabitant.birthDate).getTime();
    const ageMonths = (Date.now() - birthMs) / (30.44 * 24 * 60 * 60 * 1000);
    growthAssessment = assessGrowth(speciesProfile, sex as "male" | "female", Math.round(ageMonths), currentWeightG);
  }

  // ── Feeding stats ──
  const feedings = allEvents
    .filter((e): e is CareEvent & { data: FeedingData } => e.type === "feeding")
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalFeedings = feedings.length;
  const accepted = feedings.filter((f) => f.data?.accepted).length;
  const acceptanceRate = totalFeedings > 0 ? Math.round((accepted / totalFeedings) * 100) : null;

  // Compute average interval between feedings
  let avgIntervalDays: number | null = null;
  if (feedings.length >= 2) {
    const intervals: number[] = [];
    for (let i = 0; i < feedings.length - 1; i++) {
      const d1 = new Date(feedings[i].date).getTime();
      const d2 = new Date(feedings[i + 1].date).getTime();
      intervals.push((d1 - d2) / (24 * 60 * 60 * 1000));
    }
    avgIntervalDays = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length * 10) / 10;
  }

  const lastFed = feedings[0] ?? null;
  const daysSinceLastFeed = lastFed
    ? Math.floor((Date.now() - new Date(lastFed.date).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Feeding status
  let feedingStatus: "recently_fed" | "ok" | "due_soon" | "overdue" = "ok";
  if (daysSinceLastFeed !== null && lifeStage) {
    if (daysSinceLastFeed <= 1) feedingStatus = "recently_fed";
    else if (daysSinceLastFeed >= lifeStage.feedIntervalDays[1]) feedingStatus = "overdue";
    else if (daysSinceLastFeed >= lifeStage.feedIntervalDays[0] - 1) feedingStatus = "due_soon";
  }

  // Next feed window
  let nextFeedWindow = null;
  if (lastFed && lifeStage) {
    const lastFedMs = new Date(lastFed.date).getTime();
    const earliest = new Date(lastFedMs + lifeStage.feedIntervalDays[0] * 24 * 60 * 60 * 1000);
    const latest = new Date(lastFedMs + lifeStage.feedIntervalDays[1] * 24 * 60 * 60 * 1000);
    nextFeedWindow = {
      earliest: earliest.toISOString().split("T")[0],
      latest: latest.toISOString().split("T")[0],
    };
  }

  // Refusal streak
  let refusalStreak = 0;
  for (const f of feedings) {
    if (!f.data?.accepted) refusalStreak++;
    else break;
  }

  // ── Handling stats ──
  const handlingEvents = allEvents
    .filter((e): e is CareEvent & { data: HandlingData } => e.type === "handling")
    .sort((a, b) => b.date.localeCompare(a.date));

  function calcDurationMin(h: HandlingData): number {
    if (!h.startTime || !h.endTime) return 0;
    const [sh, sm] = h.startTime.split(":").map(Number);
    const [eh, em] = h.endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }

  // This week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStr = weekStart.toISOString().split("T")[0];

  const thisWeekHandling = handlingEvents.filter((e) => e.date >= weekStr);
  const thisWeekMinutes = thisWeekHandling.reduce((s, e) => s + calcDurationMin(e.data), 0);

  // Last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const last30Handling = handlingEvents.filter((e) => e.date >= thirtyDaysAgo);
  const last30Minutes = last30Handling.reduce((s, e) => s + calcDurationMin(e.data), 0);

  // Temperament breakdown
  const temperamentCounts: Record<string, number> = {};
  for (const h of last30Handling) {
    const t = h.data?.temperament ?? "unknown";
    temperamentCounts[t] = (temperamentCounts[t] ?? 0) + 1;
  }
  const dominantTemperament = Object.entries(temperamentCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  // ── Growth history (all measurements) ──
  const growthHistory = measurements
    .map((m) => ({
      date: m.date,
      weightG: m.data?.weightGrams,
      lengthCm: m.data?.lengthCm,
    }))
    .reverse(); // chronological

  // Growth rate (g/month over last 2 measurements)
  let growthRateGPerMonth: number | null = null;
  if (growthHistory.length >= 2) {
    const latest = growthHistory[growthHistory.length - 1];
    const prev = growthHistory[growthHistory.length - 2];
    if (latest.weightG && prev.weightG) {
      const daysDiff = (new Date(latest.date).getTime() - new Date(prev.date).getTime()) / (24 * 60 * 60 * 1000);
      if (daysDiff > 0) {
        growthRateGPerMonth = Math.round(((latest.weightG - prev.weightG) / daysDiff) * 30.44 * 10) / 10;
      }
    }
  }

  return NextResponse.json({
    inhabitant: {
      id: inhabitant.id,
      name: inhabitant.name ?? inhabitant.commonName,
      speciesProfileId: inhabitant.speciesProfileId,
      sex: inhabitant.sex,
      morph: inhabitant.morph,
      currentWeightG,
      currentLengthCm,
      lifeStage: lifeStage ? {
        id: lifeStage.id,
        label: lifeStage.label,
        emoji: lifeStage.emoji,
        color: lifeStage.color,
        description: lifeStage.description,
      } : null,
      growthAssessment,
    },
    feeding: {
      recommendation: preyRec ? {
        preyType: preyRec.preyType,
        preyLabel: preyRec.preyLabel,
        preyWeightRange: preyWeightRange ? { min: preyWeightRange[0], max: preyWeightRange[1] } : null,
        percentOfBodyWeight: lifeStage
          ? `${lifeStage.preyWeightPct[0]}–${lifeStage.preyWeightPct[1]}%`
          : null,
        sizeUpTip: preyRec.sizeUpSignal,
        sizeDownTip: preyRec.sizeDownSignal,
      } : null,
      schedule: lifeStage ? {
        recommendedIntervalDays: lifeStage.feedIntervalDays,
        actualAvgIntervalDays: avgIntervalDays,
      } : null,
      lastFed: lastFed ? {
        date: lastFed.date,
        preyType: lastFed.data?.preyType,
        preyWeightG: lastFed.data?.preyWeightGrams,
        accepted: lastFed.data?.accepted,
      } : null,
      daysSinceLastFeed,
      status: feedingStatus,
      nextFeedWindow,
      history: {
        totalFeedings,
        acceptanceRate,
        avgIntervalDays,
        refusalStreak,
      },
    },
    handling: {
      thisWeek: {
        sessions: thisWeekHandling.length,
        totalMinutes: thisWeekMinutes,
        avgMinutesPerSession: thisWeekHandling.length > 0
          ? Math.round(thisWeekMinutes / thisWeekHandling.length)
          : 0,
      },
      last30Days: {
        sessions: last30Handling.length,
        totalMinutes: last30Minutes,
        avgMinutesPerDay: Math.round(last30Minutes / 30),
        avgMinutesPerSession: last30Handling.length > 0
          ? Math.round(last30Minutes / last30Handling.length)
          : 0,
        dominantTemperament,
        temperamentBreakdown: temperamentCounts,
      },
    },
    growth: {
      measurements: growthHistory,
      growthRateGPerMonth,
    },
    speciesProfile: {
      feedingTips: speciesProfile.feedingTips,
      husbandry: speciesProfile.husbandry,
      bodyCondition: speciesProfile.bodyCondition,
    },
  });
}
