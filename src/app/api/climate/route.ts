/**
 * GET /api/climate?lat=39&lng=-98[&force=true]
 *
 * Returns monthly average high/low temperatures for a habitat location.
 * Checks SQLite climate_cache first (30-day freshness). Only hits
 * Open-Meteo API on cache miss or when force=true.
 */

import { NextResponse } from "next/server";
import { getClimateCache, saveClimateCache } from "@/lib/db";
import { fetchClimateData } from "@/lib/climate";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latStr = url.searchParams.get("lat");
  const lngStr = url.searchParams.get("lng");
  const force = url.searchParams.get("force") === "true";

  if (!latStr || !lngStr) {
    return NextResponse.json(
      { error: "Missing lat and lng query parameters" },
      { status: 400 },
    );
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "Invalid lat/lng values" },
      { status: 400 },
    );
  }

  try {
    // Check cache first (unless forced refresh)
    if (!force) {
      const cached = getClimateCache(lat, lng);
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
    }

    // Cache miss or forced — fetch from Open-Meteo
    console.log(`[climate] Fetching from Open-Meteo for ${lat.toFixed(2)}, ${lng.toFixed(2)}...`);
    const data = await fetchClimateData(lat, lng);

    // Persist to SQLite
    saveClimateCache(lat, lng, data);
    console.log(`[climate] Cached climate data for ${lat.toFixed(1)}, ${lng.toFixed(1)}`);

    return NextResponse.json({
      ...data,
      cached: false,
    });
  } catch (error) {
    console.error("[climate] Error fetching climate data:", error);

    // Attempt to return stale cache on API failure
    const stale = getClimateCache(lat, lng, true); // force=true returns even stale data
    if (stale) {
      console.log("[climate] Returning stale cache due to API error");
      return NextResponse.json({
        ...stale,
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch climate data" },
      { status: 502 },
    );
  }
}
