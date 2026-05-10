/**
 * Sensor CRUD API
 *
 * GET    /api/sensors?profileId=X  — list sensors (filtered by profile)
 * POST   /api/sensors              — create a sensor
 * PUT    /api/sensors?id=xxx       — update a sensor
 * DELETE /api/sensors?id=xxx       — delete a sensor
 */

import { NextRequest, NextResponse } from "next/server";
import { listSensors, getSensor, saveSensor, deleteSensor, seedDefaults, getActiveProfileId } from "@/lib/db";
import { SensorDefSchema } from "@/lib/schema";
import { refreshSubscriptions } from "@/lib/mqtt-server";

export async function GET(req: NextRequest) {
  seedDefaults();
  const profileId = req.nextUrl.searchParams.get("profileId") ?? getActiveProfileId();
  return NextResponse.json(listSensors(profileId));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sensor = SensorDefSchema.parse(body);

    // Check for duplicate ID
    if (getSensor(sensor.id)) {
      return NextResponse.json({ error: `Sensor '${sensor.id}' already exists` }, { status: 409 });
    }

    const profileId = body.profileId ?? getActiveProfileId();
    saveSensor(sensor, profileId);
    refreshSubscriptions();
    return NextResponse.json(sensor, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

    const body = await req.json();
    const sensor = SensorDefSchema.parse({ ...body, id });

    const profileId = body.profileId ?? getActiveProfileId();
    saveSensor(sensor, profileId);
    refreshSubscriptions();
    return NextResponse.json(sensor);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  const deleted = deleteSensor(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  refreshSubscriptions();
  return NextResponse.json({ deleted: id });
}
