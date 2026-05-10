/**
 * Sensor Extremes API
 *
 * GET /api/sensors/extremes?id=xxx&range=24h|7d|30d
 *
 * Returns day/night high/low temperature splits using solar sunrise/sunset
 * as the boundary. Designed for monitoring reptile husbandry ranges.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadings } from "@/lib/db";
import { getLocation } from "@/lib/db";

export const dynamic = "force-dynamic";

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Simplified sunrise/sunset calculation.
 * Returns approximate sunrise and sunset timestamps for a given date and location.
 */
function getSolarTimes(date: Date, lat: number, lng: number): { sunrise: number; sunset: number } {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000)
  );

  // Solar declination (simplified)
  const declination = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const decRad = (declination * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  // Hour angle
  const cosHa = -Math.tan(latRad) * Math.tan(decRad);
  const haRad = Math.acos(Math.max(-1, Math.min(1, cosHa)));
  const haHours = (haRad * 180) / (Math.PI * 15);

  // Solar noon offset for longitude (approximate, no timezone correction needed — we use UTC)
  const solarNoonHoursUTC = 12 - (lng / 15);

  const sunriseHoursUTC = solarNoonHoursUTC - haHours;
  const sunsetHoursUTC = solarNoonHoursUTC + haHours;

  const baseMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return {
    sunrise: baseMs + sunriseHoursUTC * 60 * 60 * 1000,
    sunset: baseMs + sunsetHoursUTC * 60 * 60 * 1000,
  };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id=" }, { status: 400 });

  const range = req.nextUrl.searchParams.get("range") ?? "24h";
  const rangeMs = RANGE_MS[range] ?? RANGE_MS["24h"];
  const sinceMs = Date.now() - rangeMs;

  const points = getReadings(id, sinceMs, 5000); // high resolution for accurate min/max
  if (points.length === 0) {
    return NextResponse.json({ sensorId: id, range, daytime: null, nighttime: null, overall: null });
  }

  // Get location for solar calculations
  const location = getLocation();
  const lat = location?.latitude ?? 37.7749; // default to SF
  const lng = location?.longitude ?? -122.4194;

  // Classify each reading as day or night
  const dayReadings: { value: number; ts: number }[] = [];
  const nightReadings: { value: number; ts: number }[] = [];

  // Cache solar times per calendar day
  const solarCache = new Map<string, { sunrise: number; sunset: number }>();

  for (const p of points) {
    const d = new Date(p.ts);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    if (!solarCache.has(dateKey)) {
      solarCache.set(dateKey, getSolarTimes(d, lat, lng));
    }

    const solar = solarCache.get(dateKey)!;
    if (p.ts >= solar.sunrise && p.ts < solar.sunset) {
      dayReadings.push(p);
    } else {
      nightReadings.push(p);
    }
  }

  function calcExtremes(readings: { value: number; ts: number }[]) {
    if (readings.length === 0) return null;
    let high = -Infinity, low = Infinity, sum = 0;
    let highTs = 0, lowTs = 0;
    for (const r of readings) {
      sum += r.value;
      if (r.value > high) { high = r.value; highTs = r.ts; }
      if (r.value < low) { low = r.value; lowTs = r.ts; }
    }
    return {
      high: Math.round(high * 10) / 10,
      low: Math.round(low * 10) / 10,
      avg: Math.round((sum / readings.length) * 10) / 10,
      highTs,
      lowTs,
    };
  }

  return NextResponse.json({
    sensorId: id,
    range,
    totalReadings: points.length,
    daytime: calcExtremes(dayReadings),
    nighttime: calcExtremes(nightReadings),
    overall: calcExtremes(points),
  });
}
