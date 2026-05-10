/**
 * Control CRUD API
 *
 * GET    /api/controls?profileId=X  — list controls (filtered by profile)
 * POST   /api/controls              — create a control
 * PUT    /api/controls?id=xxx       — update a control (including mode changes)
 * DELETE /api/controls?id=xxx       — delete a control
 */

import { NextRequest, NextResponse } from "next/server";
import { listControls, getControl, saveControl, deleteControl, seedDefaults, getActiveProfileId } from "@/lib/db";
import { ControlDefSchema } from "@/lib/schema";

export async function GET(req: NextRequest) {
  seedDefaults();
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  return NextResponse.json(listControls(profileId));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const control = ControlDefSchema.parse(body);

    if (getControl(control.id)) {
      return NextResponse.json({ error: `Control '${control.id}' already exists` }, { status: 409 });
    }

    const profileId = body.profileId ?? getActiveProfileId();
    saveControl(control, profileId);
    return NextResponse.json(control, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

    const existing = getControl(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    // Merge existing data with incoming patch
    const control = ControlDefSchema.parse({ ...existing, ...body, id });

    const profileId = body.profileId ?? getActiveProfileId();
    saveControl(control, profileId);
    return NextResponse.json(control);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  const deleted = deleteControl(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
