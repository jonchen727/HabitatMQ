/**
 * POST /api/controls/tick — Force an immediate scheduler evaluation.
 * Called when switching a control to "auto" mode so the correct
 * MQTT command is published immediately (not after up to 60s).
 */

import { NextResponse } from "next/server";
import { forceTick } from "@/lib/scheduler";

export async function POST() {
  forceTick();
  return NextResponse.json({ ok: true });
}
