/**
 * Care Daily Extremes API
 *
 * GET /api/care/extremes?profileId=xxx&month=2026-05
 *
 * Returns daily high/low/avg temperature for hot-side and cold-side sensors
 * for the specified month. Used by the care calendar to show ambient conditions
 * alongside care events.
 *
 * Sensor identification: looks for sensors with location containing "hot" or "cold"
 * in the active profile's sensor configuration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDailyExtremes, listSensors } from "@/lib/db";

export const dynamic = "force-dynamic";

// In-memory cache — extremes change slowly (5-min TTL)
const extremesCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  const month = req.nextUrl.searchParams.get("month"); // YYYY-MM

  if (!profileId || !month) {
    return NextResponse.json(
      { error: "Missing ?profileId= and ?month= parameters" },
      { status: 400 },
    );
  }

  // Check in-memory cache first
  const cacheKey = `${profileId}:${month}`;
  const cached = extremesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  // Parse month into start/end dates
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Find temperature sensors for this profile (hot side / cold side)
  const sensors = listSensors(profileId);

  // Classify sensors by location — look for "hot", "warm", "basking" vs "cold", "cool", "ambient"
  const hotSideIds: string[] = [];
  const coldSideIds: string[] = [];

  for (const s of sensors) {
    const loc = (s.location ?? "").toLowerCase();
    const label = s.label.toLowerCase();
    const combined = `${loc} ${label}`;

    if (combined.match(/hot|warm|basking/)) {
      hotSideIds.push(s.id);
    } else if (combined.match(/cold|cool|ambient/)) {
      coldSideIds.push(s.id);
    }
  }

  // Get extremes for all identified sensors
  const allIds = [...hotSideIds, ...coldSideIds];
  const extremes = getDailyExtremes(allIds, startDate, endDate);

  // Split by side
  const hotSide = extremes.filter(e => hotSideIds.includes(e.sensorId));
  const coldSide = extremes.filter(e => coldSideIds.includes(e.sensorId));

  const responseData = {
    month,
    hotSide,
    coldSide,
    hotSideIds,
    coldSideIds,
    all: extremes,
  };

  // Store in cache
  extremesCache.set(cacheKey, { data: responseData, ts: Date.now() });

  return NextResponse.json(responseData, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
