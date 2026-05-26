/**
 * Batch History API
 *
 * GET /api/history/batch?sensors=id1,id2&controls=c1,c2&range=1h|6h|24h|7d
 *
 * Returns downsampled time-series data for ALL requested sensors and controls
 * in a single response — eliminates N+1 fetch waterfall.
 *
 * Response shape:
 * {
 *   range: "7d",
 *   sensors: { id1: [...points], id2: [...points] },
 *   controls: { c1: [...points], c2: [...points] },
 *   controlBefore: { c1: { value, ts }, c2: { value, ts } } // last reading before range start
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getMultiReadings, getMultiLastReadingBefore } from "@/lib/db";
import { getMultiCached, setMultiCached } from "@/lib/history-cache";

export const dynamic = "force-dynamic";

const RANGE_MS: Record<string, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "6h":  6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

/** Cache-Control headers by range */
const CACHE_CONTROL: Record<string, string> = {
  "1h":  "public, max-age=15",
  "6h":  "public, max-age=30",
  "24h": "public, max-age=60",
  "7d":  "public, max-age=120",
};

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "24h";
  const rangeMs = RANGE_MS[range] ?? RANGE_MS["24h"];
  const sinceMs = Date.now() - rangeMs;

  // Parse comma-separated IDs
  const sensorParam = req.nextUrl.searchParams.get("sensors") ?? "";
  const controlParam = req.nextUrl.searchParams.get("controls") ?? "";
  const sensorIds = sensorParam ? sensorParam.split(",").filter(Boolean) : [];
  const controlIds = controlParam ? controlParam.split(",").filter(Boolean) : [];

  // Check cache first
  const allIds = [...sensorIds, ...controlIds];
  const { cached, missing } = getMultiCached(allIds, range);

  // Fetch only the missing ones from DB
  if (missing.length > 0) {
    const fresh = getMultiReadings(missing, sinceMs, 200);

    // Store fresh results in cache
    setMultiCached(fresh, range);

    // Merge into cached
    for (const [id, points] of fresh) {
      cached.set(id, points);
    }
  }

  // Split back into sensors vs controls
  const sensors: Record<string, { value: number; ts: number }[]> = {};
  for (const id of sensorIds) {
    sensors[id] = cached.get(id) ?? [];
  }

  const controls: Record<string, { value: number; ts: number }[]> = {};
  for (const id of controlIds) {
    controls[id] = cached.get(id) ?? [];
  }

  // Get last reading before range start for each control (for band rendering)
  const controlBefore: Record<string, { value: number; ts: number }> = {};
  if (controlIds.length > 0) {
    const beforeMap = getMultiLastReadingBefore(controlIds, sinceMs);
    for (const [id, point] of beforeMap) {
      controlBefore[id] = point;
    }
  }

  return NextResponse.json(
    { range, sensors, controls, controlBefore },
    {
      headers: {
        "Cache-Control": CACHE_CONTROL[range] ?? "public, max-age=30",
      },
    },
  );
}
