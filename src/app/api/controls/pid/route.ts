import { NextResponse } from "next/server";
import { getPidOutputs, isAutoTuning } from "@/lib/scheduler";

/**
 * GET /api/controls/pid — Get PID state for all controls.
 * Returns current output, setpoint, input sensor, and tuning status.
 */
export async function GET() {
  try {
    const outputs = getPidOutputs();
    // Add auto-tune status
    const result: Record<string, import("@/lib/types").PIDState & { autoTuning: boolean }> = {};

    for (const [id, data] of Object.entries(outputs)) {
      result[id] = { ...data, autoTuning: isAutoTuning(id) };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[pid] error:", err);
    return NextResponse.json({}, { status: 500 });
  }
}
