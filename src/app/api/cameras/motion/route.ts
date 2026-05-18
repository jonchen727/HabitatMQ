/**
 * ONVIF Motion Status API
 *
 * GET /api/cameras/motion — get current motion detection states for all cameras
 */

import { NextResponse } from "next/server";
import { getMotionStates } from "@/lib/onvif-events";

export async function GET() {
  return NextResponse.json(getMotionStates());
}
