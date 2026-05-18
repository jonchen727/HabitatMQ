/**
 * GET /api/care/last-feeding?profileId=aspen
 * Returns the most recent feeding event for a profile (for observation auto-linking).
 */

import { NextRequest, NextResponse } from "next/server";
import { getLastFeedingEvent, getActiveProfileId } from "@/lib/db";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  const event = getLastFeedingEvent(profileId);
  if (!event) {
    return NextResponse.json(null);
  }
  return NextResponse.json(event);
}
