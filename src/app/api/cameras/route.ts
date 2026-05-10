/**
 * Camera CRUD API
 *
 * GET    /api/cameras?profileId=X  — list cameras (filtered by profile)
 * POST   /api/cameras              — create a camera
 * PUT    /api/cameras?id=xxx       — update a camera (including zones)
 * DELETE /api/cameras?id=xxx       — delete a camera
 */

import { NextRequest, NextResponse } from "next/server";
import { listCameras, getCamera, saveCamera, deleteCamera, getActiveProfileId } from "@/lib/db";
import { CameraDefSchema } from "@/lib/schema";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  return NextResponse.json(listCameras(profileId));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const camera = CameraDefSchema.parse(body);

    if (getCamera(camera.id)) {
      return NextResponse.json({ error: `Camera '${camera.id}' already exists` }, { status: 409 });
    }

    const profileId = body.profileId ?? getActiveProfileId();
    saveCamera(camera, profileId);
    return NextResponse.json(camera, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

    const body = await req.json();
    const camera = CameraDefSchema.parse({ ...body, id });

    const profileId = body.profileId ?? getActiveProfileId();
    saveCamera(camera, profileId);
    return NextResponse.json(camera);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  const deleted = deleteCamera(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
