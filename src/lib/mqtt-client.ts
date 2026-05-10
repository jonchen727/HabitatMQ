/**
 * Browser-side MQTT Client
 *
 * Connects to the broker via WebSocket and routes incoming messages
 * to registered callbacks. Buffers updates at 500ms intervals to
 * prevent render thrashing from high-frequency sensor data.
 *
 * This module is browser-only (uses mqtt.js WebSocket transport).
 */

import mqtt, { type MqttClient, type IClientOptions } from "mqtt";
import type { MqttConfig, SensorDef, PayloadType } from "./schema";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type MessageCallback = (sensorId: string, value: number | boolean, raw: string) => void;

interface Subscription {
  sensorId: string;
  payloadType: PayloadType;
  jsonPath?: string;
  trueValue: string;
  falseValue: string;
}

/**
 * MqttManager — singleton-ish client wrapper.
 * Create one per app, hold in a React Context ref.
 */
export class MqttManager {
  private client: MqttClient | null = null;
  private subscriptions = new Map<string, Subscription>(); // topic → sub config
  private messageBuffer = new Map<string, { value: number | boolean; raw: string }>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private _status: ConnectionStatus = "disconnected";
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private messageListeners = new Set<MessageCallback>();

  get status() { return this._status; }

  /** Subscribe to connection status changes */
  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusListeners.add(cb);
    return () => { this.statusListeners.delete(cb); };
  }

  /** Subscribe to parsed sensor messages */
  onMessage(cb: MessageCallback) {
    this.messageListeners.add(cb);
    return () => { this.messageListeners.delete(cb); };
  }

  private setStatus(s: ConnectionStatus) {
    this._status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  /** Connect to the MQTT broker */
  connect(config: MqttConfig) {
    if (this.client) this.disconnect();

    const url = `${config.protocol}://${config.host}:${config.port}`;
    this.setStatus("connecting");

    const opts: IClientOptions = {
      username: config.username || undefined,
      password: config.password || undefined,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      keepalive: 30,
    };

    this.client = mqtt.connect(url, opts);

    this.client.on("connect", () => {
      this.setStatus("connected");
      // Re-subscribe to all registered topics
      for (const topic of this.subscriptions.keys()) {
        this.client?.subscribe(topic);
      }
    });

    this.client.on("reconnect", () => this.setStatus("reconnecting"));
    this.client.on("offline", () => this.setStatus("disconnected"));
    this.client.on("error", () => this.setStatus("disconnected"));

    this.client.on("message", (topic, payload) => {
      const sub = this.subscriptions.get(topic);
      if (!sub) return;

      const raw = payload.toString();
      const value = this.parsePayload(raw, sub);
      if (value !== null) {
        this.messageBuffer.set(sub.sensorId, { value, raw });
      }
    });

    // Flush buffered messages every 500ms
    this.flushTimer = setInterval(() => this.flush(), 500);
  }

  /** Disconnect from the broker */
  disconnect() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.setStatus("disconnected");
  }

  /** Register sensors for MQTT subscription */
  registerSensors(sensors: SensorDef[]) {
    // Unsubscribe from removed topics
    const newTopics = new Set(sensors.map((s) => s.mqtt.topic));
    for (const topic of this.subscriptions.keys()) {
      if (!newTopics.has(topic)) {
        this.client?.unsubscribe(topic);
        this.subscriptions.delete(topic);
      }
    }

    // Subscribe to new topics
    for (const sensor of sensors) {
      const { topic, payloadType, jsonPath, trueValue, falseValue } = sensor.mqtt;
      if (!this.subscriptions.has(topic)) {
        this.client?.subscribe(topic);
      }
      this.subscriptions.set(topic, {
        sensorId: sensor.id,
        payloadType,
        jsonPath,
        trueValue: trueValue ?? "true",
        falseValue: falseValue ?? "false",
      });
    }
  }

  /** Publish a message to a topic */
  publish(topic: string, payload: string) {
    if (this.client && this._status === "connected") {
      this.client.publish(topic, payload);
    }
  }

  /** Parse raw MQTT payload based on sensor config */
  private parsePayload(raw: string, sub: Subscription): number | boolean | null {
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
            // Simple JSONPath: supports "$.key" and "$.key.subkey"
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
          // If no jsonPath, try the root value
          if (typeof obj === "number") return obj;
          if (typeof obj.value === "number") return obj.value;
          return null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /** Flush buffered messages to listeners */
  private flush() {
    if (this.messageBuffer.size === 0) return;
    const entries = new Map(this.messageBuffer);
    this.messageBuffer.clear();
    for (const [sensorId, { value, raw }] of entries) {
      this.messageListeners.forEach((cb) => cb(sensorId, value, raw));
    }
  }
}
