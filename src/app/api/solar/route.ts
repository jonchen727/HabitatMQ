/**
 * GET /api/solar
 *
 * Returns today's computed sunrise/sunset times based on saved location.
 * Also returns the adjusted times for a given offset (query params).
 *
 * ?sunriseOffset=30&sunsetOffset=-15  (optional, in minutes)
 */

import { NextRequest, NextResponse } from "next/server";
import { getLocation } from "@/lib/db";
import { getTodaySolarTimes } from "@/lib/scheduler";
import SunCalc from "suncalc";

export async function GET(req: NextRequest) {
  const location = getLocation();
  if (!location || (location.latitude === 0 && location.longitude === 0)) {
    return NextResponse.json(
      { error: "Location not configured" },
      { status: 400 }
    );
  }

  const sunriseOffset = parseInt(req.nextUrl.searchParams.get("sunriseOffset") ?? "0", 10);
  const sunsetOffset = parseInt(req.nextUrl.searchParams.get("sunsetOffset") ?? "0", 10);

  const now = new Date();
  const times = SunCalc.getTimes(now, location.latitude, location.longitude);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
    });

  const sunrise = times.sunrise;
  const sunset = times.sunset;
  const adjustedSunrise = new Date(sunrise.getTime() + sunriseOffset * 60_000);
  const adjustedSunset = new Date(sunset.getTime() + sunsetOffset * 60_000);

  return NextResponse.json({
    location: { latitude: location.latitude, longitude: location.longitude },
    base: {
      sunrise: fmt(sunrise),
      sunset: fmt(sunset),
    },
    adjusted: {
      sunrise: fmt(adjustedSunrise),
      sunset: fmt(adjustedSunset),
      sunriseOffset,
      sunsetOffset,
    },
  });
}
