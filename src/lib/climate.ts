/**
 * Climate Engine — Open-Meteo integration + natural cycle computation
 *
 * Fetches historical weather data for a habitat reference location,
 * computes monthly average high/low temperatures, auto-derives seasons
 * from hemisphere, and generates solar-anchored diurnal curve setpoints
 * scaled to the user's safe operating range.
 */

import type {
  ClimateDataCache,
  NaturalCycleSeason,
  NaturalCycleSeasonId,
  SolarSetpointEntry,
} from "./schema";

// ─── Season Auto-Detection ───────────────────────────────────────────────────

export interface SeasonDateRange {
  id: NaturalCycleSeasonId;
  label: string;
  startMonth: number;  // 1-indexed
  startDay: number;
  endMonth: number;
  endDay: number;
}

/**
 * Auto-derive 4 meteorological seasons based on hemisphere.
 * Northern hemisphere: Spring Mar-May, Summer Jun-Aug, Fall Sep-Nov, Winter Dec-Feb
 * Southern hemisphere: shifted by 6 months.
 */
export function getAutoSeasons(latitude: number): SeasonDateRange[] {
  if (latitude >= 0) {
    // Northern hemisphere
    return [
      { id: "spring", label: "Spring", startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
      { id: "summer", label: "Summer", startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
      { id: "fall",   label: "Fall",   startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 },
      { id: "winter", label: "Winter", startMonth: 12, startDay: 1, endMonth: 2, endDay: 28 },
    ];
  } else {
    // Southern hemisphere
    return [
      { id: "spring", label: "Spring", startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 },
      { id: "summer", label: "Summer", startMonth: 12, startDay: 1, endMonth: 2, endDay: 28 },
      { id: "fall",   label: "Fall",   startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
      { id: "winter", label: "Winter", startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    ];
  }
}

/**
 * Find the active season for a given date.
 */
export function findActiveNaturalSeason(seasons: SeasonDateRange[], now: Date): SeasonDateRange {
  const month = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();

  for (const season of seasons) {
    if (season.startMonth <= season.endMonth) {
      // Normal range (e.g., Mar 1 – May 31)
      if (month > season.startMonth || (month === season.startMonth && day >= season.startDay)) {
        if (month < season.endMonth || (month === season.endMonth && day <= season.endDay)) {
          return season;
        }
      }
    } else {
      // Wrapping range (e.g., Dec 1 – Feb 28)
      if (month >= season.startMonth || month <= season.endMonth) {
        if (month > season.startMonth || (month === season.startMonth && day >= season.startDay)) {
          return season;
        }
        if (month < season.endMonth || (month === season.endMonth && day <= season.endDay)) {
          return season;
        }
      }
    }
  }
  // Fallback — should never happen with complete seasons
  return seasons[0];
}

// ─── Temperature Scaling ─────────────────────────────────────────────────────

/**
 * Scale a raw climate temperature to the user's safe operating range.
 *
 * The raw climate annual range (e.g., 20°F–97°F) is linearly mapped to the
 * user's min/max setpoint bounds (e.g., 75°F–90°F). This preserves the
 * shape of natural variation while keeping the animal safe.
 *
 * The result is clamped to [minSP, maxSP] so no setpoint ever exceeds bounds.
 */
export function scaleTemp(
  rawTemp: number,
  climateMin: number,
  climateMax: number,
  minSP: number,
  maxSP: number,
): number {
  if (climateMax === climateMin) return (minSP + maxSP) / 2; // avoid division by zero
  const normalized = (rawTemp - climateMin) / (climateMax - climateMin);
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round((minSP + clamped * (maxSP - minSP)) * 10) / 10; // 1 decimal
}

/**
 * Compute default season temperatures from climate cache data.
 * Returns the raw (unscaled) avg day high and night low for each season.
 */
export function getSeasonRawTemps(
  climate: ClimateDataCache,
): Record<NaturalCycleSeasonId, { rawDayHighF: number; rawNightLowF: number }> {
  // Map seasons to their month indices (0-based for array access)
  const seasonMonths: Record<NaturalCycleSeasonId, number[]> = {
    spring: [2, 3, 4],  // Mar, Apr, May
    summer: [5, 6, 7],  // Jun, Jul, Aug
    fall:   [8, 9, 10], // Sep, Oct, Nov
    winter: [11, 0, 1], // Dec, Jan, Feb
  };

  const result = {} as Record<NaturalCycleSeasonId, { rawDayHighF: number; rawNightLowF: number }>;
  for (const [id, months] of Object.entries(seasonMonths)) {
    const highs = months.map(m => climate.monthlyAvgHighF[m]);
    const lows = months.map(m => climate.monthlyAvgLowF[m]);
    result[id as NaturalCycleSeasonId] = {
      rawDayHighF: Math.round(highs.reduce((a, b) => a + b, 0) / highs.length * 10) / 10,
      rawNightLowF: Math.round(lows.reduce((a, b) => a + b, 0) / lows.length * 10) / 10,
    };
  }
  return result;
}

/**
 * Build default NaturalCycleSeason configs from climate data + user bounds.
 */
export function buildDefaultSeasons(
  climate: ClimateDataCache,
  minSP: number,
  maxSP: number,
): NaturalCycleSeason[] {
  const rawTemps = getSeasonRawTemps(climate);
  const ids: NaturalCycleSeasonId[] = ["spring", "summer", "fall", "winter"];

  return ids.map(id => ({
    id,
    dayPeakF: scaleTemp(rawTemps[id].rawDayHighF, climate.annualMinF, climate.annualMaxF, minSP, maxSP),
    nightLowF: scaleTemp(rawTemps[id].rawNightLowF, climate.annualMinF, climate.annualMaxF, minSP, maxSP),
    peakOffsetMinutes: 60,
    ramp: true,
    enabled: true,
  }));
}

// ─── Season Transition Blending ──────────────────────────────────────────────

/**
 * Get the next season in the cycle.
 */
function getNextSeasonId(current: NaturalCycleSeasonId): NaturalCycleSeasonId {
  const order: NaturalCycleSeasonId[] = ["spring", "summer", "fall", "winter"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % 4];
}

/**
 * Get the previous season in the cycle.
 */
function getPrevSeasonId(current: NaturalCycleSeasonId): NaturalCycleSeasonId {
  const order: NaturalCycleSeasonId[] = ["spring", "summer", "fall", "winter"];
  const idx = order.indexOf(current);
  return order[(idx + 3) % 4];
}

/**
 * Calculate days until the end of the current season.
 */
function daysUntilSeasonEnd(season: SeasonDateRange, now: Date): number {
  const year = now.getFullYear();
  let endDate: Date;
  if (season.endMonth < season.startMonth) {
    // Wrapping season (winter): end is in next year if we're in the start month range
    const month = now.getMonth() + 1;
    endDate = new Date(month >= season.startMonth ? year + 1 : year, season.endMonth - 1, season.endDay);
  } else {
    endDate = new Date(year, season.endMonth - 1, season.endDay);
  }
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/**
 * Calculate days since the start of the current season.
 */
function daysSinceSeasonStart(season: SeasonDateRange, now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let startDate: Date;
  if (season.startMonth > season.endMonth && month <= season.endMonth) {
    // We're in the second year of a wrapping season
    startDate = new Date(year - 1, season.startMonth - 1, season.startDay);
  } else {
    startDate = new Date(year, season.startMonth - 1, season.startDay);
  }
  const diff = now.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

/**
 * Blend season temperatures during transition periods.
 * If within transitionDays of a season boundary, linearly interpolate.
 */
export function blendSeasonTransition(
  seasons: NaturalCycleSeason[],
  seasonRanges: SeasonDateRange[],
  activeSeason: SeasonDateRange,
  transitionDays: number,
  now: Date,
): { dayPeakF: number; nightLowF: number } {
  const currentConfig = seasons.find(s => s.id === activeSeason.id);
  if (!currentConfig) {
    return { dayPeakF: 80, nightLowF: 75 }; // safe fallback
  }

  const daysToEnd = daysUntilSeasonEnd(activeSeason, now);
  const daysFromStart = daysSinceSeasonStart(activeSeason, now);

  // Blending at the END of the season (approaching next season)
  if (daysToEnd <= transitionDays && daysToEnd > 0) {
    const nextId = getNextSeasonId(activeSeason.id);
    const nextConfig = seasons.find(s => s.id === nextId);
    if (nextConfig?.enabled) {
      const t = daysToEnd / transitionDays; // 1.0 = fully current, 0.0 = fully next
      return {
        dayPeakF: Math.round((currentConfig.dayPeakF * t + nextConfig.dayPeakF * (1 - t)) * 10) / 10,
        nightLowF: Math.round((currentConfig.nightLowF * t + nextConfig.nightLowF * (1 - t)) * 10) / 10,
      };
    }
  }

  // Blending at the START of the season (coming from previous season)
  if (daysFromStart <= transitionDays && daysFromStart > 0) {
    const prevId = getPrevSeasonId(activeSeason.id);
    const prevConfig = seasons.find(s => s.id === prevId);
    if (prevConfig?.enabled) {
      const t = daysFromStart / transitionDays; // 0.0 = fully previous, 1.0 = fully current
      return {
        dayPeakF: Math.round((prevConfig.dayPeakF * (1 - t) + currentConfig.dayPeakF * t) * 10) / 10,
        nightLowF: Math.round((prevConfig.nightLowF * (1 - t) + currentConfig.nightLowF * t) * 10) / 10,
      };
    }
  }

  return { dayPeakF: currentConfig.dayPeakF, nightLowF: currentConfig.nightLowF };
}

// ─── Diurnal Curve Generation ────────────────────────────────────────────────

/**
 * Generate 4 solar-anchored setpoint entries that create a natural
 * diurnal temperature curve for one day.
 *
 * Shape:
 *   Night Low ──── sunrise ──── ramp up ──── peak (solar noon + offset) ──── ramp down ──── sunset ──── Night Low
 *
 * These entries feed directly into the existing resolveSolarSchedule() →
 * interpolateSchedule() pipeline in scheduler.ts.
 */
export function generateNaturalSetpoints(
  dayPeakF: number,
  nightLowF: number,
  peakOffsetMinutes: number,
  ramp: boolean,
): SolarSetpointEntry[] {
  const range = dayPeakF - nightLowF;
  const morningTarget = nightLowF + range * 0.2; // 20% of range at sunrise

  return [
    {
      anchor: "sunrise" as const,
      offsetMinutes: -60,
      setpoint: nightLowF,
      ramp: false,   // step — hold night low until just before sunrise
      label: "pre-dawn",
    },
    {
      anchor: "sunrise" as const,
      offsetMinutes: 0,
      setpoint: Math.round(morningTarget * 10) / 10,
      ramp,
      label: "morning ramp",
    },
    {
      anchor: "solar_noon" as const,
      offsetMinutes: peakOffsetMinutes,
      setpoint: dayPeakF,
      ramp,
      label: "peak",
    },
    {
      anchor: "sunset" as const,
      offsetMinutes: 60,
      setpoint: nightLowF,
      ramp,
      label: "evening cooldown",
    },
  ];
}

// ─── Open-Meteo API ──────────────────────────────────────────────────────────

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

interface OpenMeteoResponse {
  daily: OpenMeteoDaily;
}

/**
 * Fetch 3 years of daily temperature data from Open-Meteo Historical Weather API
 * and compute monthly averages. Free API, no key required.
 */
export async function fetchClimateData(lat: number, lng: number): Promise<ClimateDataCache> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 2; // 3 full years

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat.toFixed(2));
  url.searchParams.set("longitude", lng.toFixed(2));
  url.searchParams.set("start_date", `${startYear}-01-01`);
  url.searchParams.set("end_date", `${endYear}-12-31`);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const { time, temperature_2m_max, temperature_2m_min } = data.daily;

  // Compute monthly averages
  const monthHighs: number[][] = Array.from({ length: 12 }, () => []);
  const monthLows: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 0; i < time.length; i++) {
    const month = new Date(time[i]).getMonth(); // 0-indexed
    if (temperature_2m_max[i] != null) monthHighs[month].push(temperature_2m_max[i]);
    if (temperature_2m_min[i] != null) monthLows[month].push(temperature_2m_min[i]);
  }

  const monthlyAvgHighF = monthHighs.map(arr =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 70
  );
  const monthlyAvgLowF = monthLows.map(arr =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 50
  );

  const annualMinF = Math.min(...monthlyAvgLowF);
  const annualMaxF = Math.max(...monthlyAvgHighF);

  return {
    fetchedAt: new Date().toISOString(),
    habitatLat: lat,
    habitatLng: lng,
    monthlyAvgHighF,
    monthlyAvgLowF,
    annualMinF,
    annualMaxF,
  };
}
