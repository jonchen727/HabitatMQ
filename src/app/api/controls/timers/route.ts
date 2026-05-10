/**
 * GET  /api/controls/timers      — Returns per-control timer data (isOn + since epoch)
 * POST /api/controls/timers      — Reset or set a control's timer
 *       { controlId: string }                — reset to now
 *       { controlId: string, hours: number } — set to specific hours elapsed
 */

import { NextRequest, NextResponse } from "next/server";
import { getControlTimers, resetControlTimer, setControlTimer } from "@/lib/scheduler";

export async function GET() {
  return NextResponse.json(getControlTimers());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { controlId, hours } = body;
  if (!controlId || typeof controlId !== "string") {
    return NextResponse.json({ error: "controlId required" }, { status: 400 });
  }
  if (hours !== undefined && typeof hours === "number" && hours >= 0) {
    setControlTimer(controlId, hours);
    return NextResponse.json({ ok: true, controlId, hours, since: Date.now() - hours * 3_600_000 });
  }
  resetControlTimer(controlId);
  return NextResponse.json({ ok: true, controlId, since: Date.now() });
}
