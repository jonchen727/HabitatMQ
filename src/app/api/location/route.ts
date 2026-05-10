/**
 * GET /api/location — returns saved lat/lng
 * PUT /api/location — save lat/lng for solar calculations
 */

import { NextRequest, NextResponse } from "next/server";
import { getLocation, saveLocation } from "@/lib/db";
import type { Location } from "@/lib/schema";

export async function GET() {
  const loc = getLocation();
  return NextResponse.json(loc ?? { latitude: 0, longitude: 0, label: "" });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Location;
  saveLocation(body);
  return NextResponse.json(body);
}
