/**
 * GET    /api/inhabitants?profileId=X  — list inhabitants for a profile
 * POST   /api/inhabitants              — add inhabitant
 * PUT    /api/inhabitants              — update inhabitant
 * DELETE /api/inhabitants?id=X         — delete inhabitant
 */

import { NextRequest, NextResponse } from "next/server";
import { listInhabitants, saveInhabitant, deleteInhabitant } from "@/lib/db";
import type { Inhabitant } from "@/lib/schema";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  const inhabitants = listInhabitants(profileId);
  return NextResponse.json(inhabitants);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Inhabitant;
  if (!body.id || !body.profileId || !body.species || !body.commonName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  saveInhabitant(body);
  return NextResponse.json(body, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Inhabitant;
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  saveInhabitant(body);
  return NextResponse.json(body);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const deleted = deleteInhabitant(id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
