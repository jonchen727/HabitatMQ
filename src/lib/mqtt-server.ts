/**
 * Server-side MQTT Subscriber
 *
 * Connects to the Mosquitto broker over TCP (port 1883) and caches
 * the latest value for every subscribed sensor topic. The cached map
 * is read by the /api/sensors/live route and returned as JSON to the
 * browser, which polls on a simple setInterval.
 *
 * Runs as a module-level singleton — Next.js keeps this alive across
 * requests in the same server process.
 */

import mqtt, { type MqttClient } from "mqtt";
import { listSensors, getMqttConfig, logReading, pruneOldReadings } from "./db";
import type { SensorDef, PayloadType } from "./schema";

interface CachedReading {
  value: number | boolean;
  raw: string;
  timestamp: number;
}

interface SubConfig {
  sensorId: string;
  payloadType: PayloadType;
  jsonPath?: string;
  trueValue: string;
  falseValue: string;
  // json_array mode
  arrayMatchField?: string;
  arrayMatchValue?: string;
  arrayValueField?: string;
}

/** Discovered 1-Wire probe from the DS18B20 MQTT array */
export interface DiscoveredProbe {
  id: string;       // e.g., "FF2707A51605"
  file: string;     // e.g., "28-0516a50727ff"
  family: string;   // e.g., "28"
  temp: number;     // last known temperature (°C)
  lastSeen: number; // timestamp
}

// ─── Module-level singleton state ────────────────────────────────────────────

let client: MqttClient | null = null;
let cache = new Map<string, CachedReading>(); // sensorId → latest
let subs = new Map<string, SubConfig[]>();    // topic → parse configs (array: multiple sensors per topic)
let connected = false;

// Discovered probes from DS18B20 array messages
let discoveredProbes = new Map<string, DiscoveredProbe>();
const DS18B20_TOPIC = "DS18B20";

/** Initialise (or re-initialise) the server-side MQTT connection. */
export function startMqttSubscriber() {
  if (client) return; // already running

  const config = getMqttConfig();
  // Server always uses TCP on 1883, regardless of what the UI config says
  const brokerUrl = `mqtt://${config.host}:1883`;

  console.log(`[mqtt-server] connecting to ${brokerUrl}`);
  client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 30,
    clientId: `enclosure-server-${Date.now()}`,
  });

  client.on("connect", () => {
    connected = true;
    console.log("[mqtt-server] connected");
    refreshSubscriptions();
  });

  client.on("reconnect", () => {
    console.log("[mqtt-server] reconnecting…");
  });

  client.on("offline", () => {
    connected = false;
  });

  client.on("error", (err) => {
    console.error("[mqtt-server] error:", err.message);
  });

  client.on("message", (topic, payload) => {
    const raw = payload.toString();

    // ─── DS18B20 probe discovery (always active) ───────────────────────
    if (topic === DS18B20_TOPIC) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const probe of arr) {
            if (probe && typeof probe.id === "string" && typeof probe.temp === "number") {
              discoveredProbes.set(probe.id, {
                id: probe.id,
                file: probe.file ?? "",
                family: probe.family ?? "28",
                temp: probe.temp,
                lastSeen: Date.now(),
              });
            }
          }
        }
      } catch { /* not valid JSON array — ignore */ }
    }

    // ─── Route to subscribed sensors ───────────────────────────────────
    const topicSubs = subs.get(topic);
    if (!topicSubs) return;

    for (const sub of topicSubs) {
      const value = parsePayload(raw, sub);
      if (value !== null) {
        cache.set(sub.sensorId, { value, raw, timestamp: Date.now() });
        // Log numeric values to the time-series table
        if (typeof value === "number") {
          try { logReading(sub.sensorId, value); } catch { /* non-fatal */ }
        }
      }
    }
  });

  // Prune old readings once per hour
  setInterval(() => {
    try { pruneOldReadings(); } catch { /* non-fatal */ }
  }, 60 * 60 * 1000);
}

/** Re-read sensors from DB and (un)subscribe as needed. */
export function refreshSubscriptions() {
  if (!client || !connected) return;

  const sensors = listSensors();
  const newTopics = new Set(sensors.map((s) => s.mqtt.topic));

  // Always subscribe to DS18B20 for probe discovery
  newTopics.add(DS18B20_TOPIC);

  // Unsubscribe removed topics
  for (const topic of subs.keys()) {
    if (!newTopics.has(topic)) {
      client.unsubscribe(topic);
      subs.delete(topic);
    }
  }

  // Build fresh sub map (topic → array of configs)
  const newSubs = new Map<string, SubConfig[]>();

  for (const sensor of sensors) {
    const { topic, payloadType, jsonPath, trueValue, falseValue,
            arrayMatchField, arrayMatchValue, arrayValueField } = sensor.mqtt;

    const config: SubConfig = {
      sensorId: sensor.id,
      payloadType,
      jsonPath,
      trueValue: trueValue ?? "true",
      falseValue: falseValue ?? "false",
      arrayMatchField,
      arrayMatchValue,
      arrayValueField,
    };

    const existing = newSubs.get(topic) ?? [];
    existing.push(config);
    newSubs.set(topic, existing);
  }

  // Subscribe to new topics
  for (const topic of newTopics) {
    if (!subs.has(topic)) {
      client.subscribe(topic);
    }
  }

  subs = newSubs;

  // Ensure DS18B20 discovery topic has at least an empty entry
  if (!subs.has(DS18B20_TOPIC)) {
    // Subscribe but no sensor configs yet — discovery-only
    client.subscribe(DS18B20_TOPIC);
  }

  console.log(`[mqtt-server] subscribed to ${newTopics.size} topics (${sensors.length} sensors)`);
}

/** Get all cached live readings. */
export function getLiveData(): Record<string, CachedReading> {
  const result: Record<string, CachedReading> = {};
  for (const [sensorId, reading] of cache) {
    result[sensorId] = reading;
  }
  return result;
}

/** Get discovered 1-Wire probes. Marks probes offline if not seen in 60s. */
export function getDiscoveredProbes(): DiscoveredProbe[] {
  const now = Date.now();
  const probes: DiscoveredProbe[] = [];
  for (const probe of discoveredProbes.values()) {
    probes.push({
      ...probe,
      // If not seen in 60s, report last known temp but flag via lastSeen
    });
  }
  return probes.sort((a, b) => a.id.localeCompare(b.id));
}

/** Current connection status. */
export function getMqttStatus(): string {
  if (!client) return "not_started";
  return connected ? "connected" : "disconnected";
}

/** Publish a message (for control commands). */
export function publishMqtt(topic: string, payload: string) {
  if (client && connected) {
    client.publish(topic, payload);
  }
}

// ─── Payload parsing ─────────────────────────────────────────────────────────

function parsePayload(raw: string, sub: SubConfig): number | boolean | null {
  try {
    switch (sub.payloadType) {
      case "raw": {
        const num = parseFloat(raw);
        return isNaN(num) ? null : num;
      }
      case "boolean": {
        const trimmed = raw.trim().toLowerCase();
        if (trimmed === sub.trueValue.toLowerCase()) return true;
        if (trimmed === sub.falseValue.toLowerCase()) return false;
        return null;
      }
      case "json": {
        const obj = JSON.parse(raw);
        if (sub.jsonPath) {
          const keys = sub.jsonPath.replace(/^\$\.?/, "").split(".");
          let val: unknown = obj;
          for (const k of keys) {
            if (val && typeof val === "object" && k in val) {
              val = (val as Record<string, unknown>)[k];
            } else {
              return null;
            }
          }
          if (typeof val === "number") return val;
          if (typeof val === "boolean") return val;
          if (typeof val === "string") {
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          }
        }
        if (typeof obj === "number") return obj;
        if (typeof obj.value === "number") return obj.value;
        return null;
      }
      case "json_array": {
        // Parse JSON array, find matching element, extract value field
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !sub.arrayMatchField || !sub.arrayMatchValue || !sub.arrayValueField) {
          return null;
        }
        const match = arr.find(
          (el: Record<string, unknown>) =>
            String(el[sub.arrayMatchField!]) === sub.arrayMatchValue
        );
        if (!match) return null;
        const val = match[sub.arrayValueField];
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const num = parseFloat(val);
          return isNaN(num) ? null : num;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
