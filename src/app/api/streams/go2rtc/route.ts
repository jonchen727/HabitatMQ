/**
 * go2rtc Stream API
 *
 * GET /api/streams/go2rtc?cameraId=xxx — get MSE WebSocket URL for a camera
 *
 * Only registers the stream with go2rtc if it doesn't already exist.
 * Re-registering an existing stream resets the RTSP producer, which kills
 * all active WebSocket consumers (other browser tabs lose their stream).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCamera } from "@/lib/db";
import { getMseWsUrl, healthCheck, registerStream, streamExists, GO2RTC_HOST, GO2RTC_PORT } from "@/lib/go2rtc";

export async function GET(req: NextRequest) {
  const cameraId = req.nextUrl.searchParams.get("cameraId");
  if (!cameraId) {
    return NextResponse.json({ error: "Missing ?cameraId= parameter" }, { status: 400 });
  }

  const cam = getCamera(cameraId);
  if (!cam) {
    return NextResponse.json({ error: "Camera not found" }, { status: 404 });
  }

  const healthy = await healthCheck();

  // Only register if go2rtc is up AND the stream isn't already registered.
  // Re-registering resets the producer and kills existing consumers.
  if (healthy && (cam.url || cam.useOnvif) && !(await streamExists(cam.id))) {
    await registerStream({
      cameraId: cam.id,
      url: cam.url,
      username: cam.username,
      password: cam.password,
      useOnvif: cam.useOnvif,
      onvifPort: cam.onvifPort,
      onvifProfile: cam.onvifProfile,
    });
  }

  return NextResponse.json({
    cameraId,
    mseWsUrl: getMseWsUrl(cameraId),
    go2rtcHost: GO2RTC_HOST,
    go2rtcPort: GO2RTC_PORT,
    healthy,
  });
}
