/**
 * GET /api/sensors/discover
 *
 * Returns discovered 1-Wire (DS18B20) temperature probes from live MQTT data.
 * The frontend uses this to populate a probe picker dropdown in the sensor editor.
 */

import { NextResponse } from "next/server";
import { getDiscoveredProbes } from "@/lib/mqtt-server";
import { listSensors } from "@/lib/db";

export async function GET() {
  const probes = getDiscoveredProbes();
  const sensors = listSensors();

  // Mark which probes are already configured as sensors
  const configuredProbeIds = new Set<string>();
  for (const sensor of sensors) {
    if (sensor.mqtt.payloadType === "json_array" && sensor.mqtt.arrayMatchValue) {
      configuredProbeIds.add(sensor.mqtt.arrayMatchValue);
    }
  }

  const now = Date.now();
  const enriched = probes.map((p) => ({
    ...p,
    configured: configuredProbeIds.has(p.id),
    online: (now - p.lastSeen) < 60_000, // not seen in 60s = offline
  }));

  return NextResponse.json({ probes: enriched });
}
