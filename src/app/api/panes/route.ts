/**
 * Pane CRUD API
 *
 * GET    /api/panes?profileId=X  — list panes (filtered by profile, sorted by order)
 * POST   /api/panes              — create a pane
 * PUT    /api/panes?id=xxx       — update a pane
 * DELETE /api/panes?id=xxx       — delete a pane
 */

import { NextRequest, NextResponse } from "next/server";
import { listPanes, getPane, savePane, deletePane, seedDefaults, getActiveProfileId } from "@/lib/db";
import { PaneDefSchema } from "@/lib/schema";

export async function GET(req: NextRequest) {
  seedDefaults();
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  return NextResponse.json(listPanes(profileId));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pane = PaneDefSchema.parse(body);

    if (getPane(pane.id)) {
      return NextResponse.json({ error: `Pane '${pane.id}' already exists` }, { status: 409 });
    }

    const profileId = body.profileId ?? getActiveProfileId();
    savePane(pane, profileId);
    return NextResponse.json(pane, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

    const body = await req.json();
    const pane = PaneDefSchema.parse({ ...body, id });

    const profileId = body.profileId ?? getActiveProfileId();
    savePane(pane, profileId);
    return NextResponse.json(pane);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  const deleted = deletePane(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
