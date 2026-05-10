/**
 * MQTT Connection Test
 *
 * POST /api/mqtt/test — attempt to connect to the configured broker
 * Returns { success: boolean, message: string, latencyMs?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import mqtt from "mqtt";
import { MqttConfigSchema } from "@/lib/schema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = MqttConfigSchema.parse(body);
    const url = `${config.protocol}://${config.host}:${config.port}`;

    const start = Date.now();

    const result = await new Promise<{ success: boolean; message: string; latencyMs?: number }>((resolve) => {
      const timeout = setTimeout(() => {
        client.end(true);
        resolve({ success: false, message: "Connection timed out after 5 seconds" });
      }, 5000);

      const client = mqtt.connect(url, {
        username: config.username,
        password: config.password,
        connectTimeout: 5000,
        reconnectPeriod: 0, // Don't auto-reconnect for test
      });

      client.on("connect", () => {
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        client.end();
        resolve({ success: true, message: "Connected successfully", latencyMs });
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        client.end(true);
        resolve({ success: false, message: `Connection failed: ${err.message}` });
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 400 });
  }
}
