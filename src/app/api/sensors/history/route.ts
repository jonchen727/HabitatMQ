/**
 * Sensor History API
 *
 * GET /api/sensors/history?id=xxx&range=1h|6h|24h|7d
 *
 * Returns downsampled time-series data for the requested sensor.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadings } from "@/lib/db";

const RANGE_MS: Record<string, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "6h":  6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  const range = req.nextUrl.searchParams.get("range") ?? "24h";
  const rangeMs = RANGE_MS[range] ?? RANGE_MS["24h"];
  const sinceMs = Date.now() - rangeMs;

  const points = getReadings(id, sinceMs);
  return NextResponse.json({ sensorId: id, range, points });
}
