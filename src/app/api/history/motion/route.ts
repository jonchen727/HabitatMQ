/**
 * Motion History API
 *
 * GET /api/history/motion?range=1h|6h|24h|7d
 *
 * Auto-discovers all cameras with motionDetection.enabled and returns
 * motion events + snapshot references for the history chart timeline strip.
 *
 * Response shape:
 * {
 *   cameras: {
 *     "cam-1": {
 *       label: "Enclosure Cam",
 *       events: [{ ts, motion, snapshots: ["/api/motion-snapshots/..."] }],
 *       beforeRange: { ts, motion } | null
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { listCameras, getMotionEvents, getMotionBefore } from "@/lib/db";
import { listSnapshotFrames, getSnapshotUrl } from "@/lib/motion-snapshots";

export const dynamic = "force-dynamic";

const RANGE_MS: Record<string, number> = {
  "1h": 1 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "24h";
  const rangeMs = RANGE_MS[range] ?? RANGE_MS["24h"];
  const sinceMs = Date.now() - rangeMs;

  // Auto-discover cameras with motion detection enabled
  const allCameras = listCameras();
  const motionCameras = allCameras.filter(c => c.enabled && c.motionDetection?.enabled);

  const cameras: Record<string, {
    label: string;
    events: Array<{
      ts: number;
      motion: number;
      snapshots: string[];
    }>;
    beforeRange: { ts: number; motion: number } | null;
  }> = {};

  for (const cam of motionCameras) {
    const events = getMotionEvents(cam.id, sinceMs);
    const before = getMotionBefore(cam.id, sinceMs);

    cameras[cam.id] = {
      label: cam.label,
      events: events.map(e => ({
        ts: e.ts,
        motion: e.motion,
        // If this is a motion-start event with a snapshot_path, list the frames
        snapshots: e.snapshot_path
          ? listSnapshotFrames(e.snapshot_path).map(getSnapshotUrl)
          : [],
      })),
      beforeRange: before ? { ts: before.ts, motion: before.motion } : null,
    };
  }

  return NextResponse.json({ cameras }, {
    headers: {
      "Cache-Control": range === "1h" ? "public, max-age=10" : "public, max-age=30",
    },
  });
}
