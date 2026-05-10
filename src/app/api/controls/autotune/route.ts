import { NextResponse } from "next/server";
import { startAutoTune, isAutoTuning } from "@/lib/scheduler";

/**
 * POST /api/controls/autotune — Start PID auto-tuning for a control.
 *
 * Body: { controlId: string }
 * Uses Ziegler-Nichols relay feedback method.
 */
export async function POST(request: Request) {
  try {
    const { controlId } = await request.json();
    if (!controlId) {
      return NextResponse.json({ ok: false, error: "controlId required" }, { status: 400 });
    }

    if (isAutoTuning(controlId)) {
      return NextResponse.json({ ok: true, status: "already_running" });
    }

    const started = startAutoTune(controlId);
    if (!started) {
      return NextResponse.json({ ok: false, error: "Control not found or no PID config" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: "started" });
  } catch (err) {
    console.error("[autotune] error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Use POST" }, { status: 405 });
}
