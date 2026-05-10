/**
 * GET /api/controls/history?id=xxx&range=1h|6h|24h|7d
 *
 * Returns state history for a control from sensor_readings.
 * Each point is { ts, value } where value is 1 (on) or 0 (off).
 * Also returns the "prior" state — the last known state before the query window.
 * If the prior state is ON, a synthetic point is prepended at window start.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReadings, getLastReadingBefore } from "@/lib/db";

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

  // Fetch the last known state BEFORE the window
  const prior = getLastReadingBefore(id, sinceMs);

  // If control was ON before the window and there are no points (or first
  // point is an OFF), prepend a synthetic ON at window start so the band renders
  if (prior && prior.value === 1) {
    const firstPoint = points[0];
    if (!firstPoint || firstPoint.ts > sinceMs + 1000) {
      points.unshift({ value: 1, ts: sinceMs });
    }
  }

  return NextResponse.json({ controlId: id, range, points });
}
