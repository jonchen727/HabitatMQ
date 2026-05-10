/**
 * MQTT Config API
 *
 * GET  /api/mqtt       — get broker config
 * PUT  /api/mqtt       — update broker config
 * POST /api/mqtt/test  — test connection to broker (handled by /api/mqtt/test/route.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { getMqttConfig, saveMqttConfig } from "@/lib/db";
import { MqttConfigSchema } from "@/lib/schema";

export async function GET() {
  return NextResponse.json(getMqttConfig());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const config = MqttConfigSchema.parse(body);
    saveMqttConfig(config);
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
