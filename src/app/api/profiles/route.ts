/**
 * GET  /api/profiles         — list all profiles + active ID
 * POST /api/profiles         — create profile
 * PUT  /api/profiles?id=X    — update profile or set active
 * DELETE /api/profiles?id=X  — delete profile
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listProfiles, saveProfile, deleteProfile, getProfile,
  getActiveProfileId, setActiveProfileId,
} from "@/lib/db";
import type { EnclosureProfile } from "@/lib/schema";

export async function GET() {
  const profiles = listProfiles();
  const activeId = getActiveProfileId();
  return NextResponse.json({ profiles, activeId });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as EnclosureProfile;
  if (!body.id || !body.name || !body.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  saveProfile(body);
  return NextResponse.json(body, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as { id?: string; setActive?: boolean } & Partial<EnclosureProfile>;

  if (body.setActive && body.id) {
    setActiveProfileId(body.id);
    return NextResponse.json({ ok: true, activeId: body.id });
  }

  if (body.id) {
    const existing = getProfile(body.id);
    if (!existing) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const updated: EnclosureProfile = {
      ...existing,
      name: body.name ?? existing.name,
      icon: body.icon ?? existing.icon,
    };
    saveProfile(updated);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === "aspen") return NextResponse.json({ error: "Cannot delete default profile" }, { status: 400 });
  const deleted = deleteProfile(id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
