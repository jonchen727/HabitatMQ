/**
 * GET /api/sensors/live
 *
 * Returns the latest cached MQTT readings from the server-side subscriber.
 * The browser polls this every 2-3 seconds for live data.
 *
 * POST /api/sensors/live  { topic, payload }
 * Publishes a command to MQTT (for control actions).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  startMqttSubscriber,
  getLiveData,
  getMqttStatus,
  publishMqtt,
} from "@/lib/mqtt-server";
import { startScheduler } from "@/lib/scheduler";
import { syncAllStreams } from "@/lib/go2rtc";
import { syncMotionListeners } from "@/lib/onvif-events";

// Start the subscriber and scheduler on first import (server-side only)
startMqttSubscriber();
startScheduler();

// Sync go2rtc streams + ONVIF motion listeners (async, non-blocking)
syncAllStreams().then(() => syncMotionListeners()).catch(console.error);

export async function GET() {
  return NextResponse.json({
    status: getMqttStatus(),
    data: getLiveData(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { topic, payload } = body;
  if (!topic || payload === undefined) {
    return NextResponse.json(
      { error: "topic and payload required" },
      { status: 400 }
    );
  }
  publishMqtt(topic, String(payload));
  return NextResponse.json({ ok: true });
}
