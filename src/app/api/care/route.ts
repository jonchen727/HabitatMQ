/**
 * GET /api/care?month=2026-05&type=feeding&profileId=aspen
 * Returns care events, optionally filtered by month, type, and profile.
 *
 * POST /api/care
 * Create a new care event (requires profileId).
 *
 * DELETE /api/care?id=X
 * Delete a care event by ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { listCareEvents, saveCareEvent, deleteCareEvent, getActiveProfileId } from "@/lib/db";
import type { CareEvent } from "@/lib/schema";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? undefined;
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  const events = listCareEvents(month, type, profileId);
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as CareEvent;
  if (!body.id || !body.date || !body.type || !body.data) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  // Default profileId to active profile if not provided
  if (!body.profileId) {
    body.profileId = getActiveProfileId();
  }
  // Auto-set createdAt if not provided
  if (!body.createdAt) {
    body.createdAt = new Date().toISOString();
  }
  saveCareEvent(body);
  return NextResponse.json(body, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const deleted = deleteCareEvent(id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
