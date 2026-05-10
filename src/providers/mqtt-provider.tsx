"use client";

/**
 * MQTT Provider — React Context for MQTT connectivity.
 *
 * Wraps the app in layout.tsx. Manages the MQTT client lifecycle,
 * fetches sensor configs from the API, subscribes to all sensor topics,
 * and exposes live data + publish to child components.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { MqttManager, type ConnectionStatus } from "@/lib/mqtt-client";
import type { MqttConfig, SensorDef } from "@/lib/schema";

interface MqttContextValue {
  status: ConnectionStatus;
  liveData: Map<string, { value: number | boolean; timestamp: number }>;
  publish: (topic: string, payload: string) => void;
  reconnect: () => void;
}

const MqttContext = createContext<MqttContextValue>({
  status: "disconnected",
  liveData: new Map(),
  publish: () => {},
  reconnect: () => {},
});

export function useMqtt() {
  return useContext(MqttContext);
}

export function MqttProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<MqttManager | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [liveData, setLiveData] = useState<Map<string, { value: number | boolean; timestamp: number }>>(new Map());

  const connectToMqtt = useCallback(async () => {
    try {
      // Fetch broker config
      const configRes = await fetch("/api/mqtt");
      const mqttConfig: MqttConfig = await configRes.json();

      // Fetch sensor list
      const sensorsRes = await fetch("/api/sensors");
      const sensors: SensorDef[] = await sensorsRes.json();

      // Create manager
      if (!managerRef.current) {
        managerRef.current = new MqttManager();
      }
      const manager = managerRef.current;

      // Listen for status changes
      manager.onStatus(setStatus);

      // Listen for messages
      manager.onMessage((sensorId, value) => {
        setLiveData((prev) => {
          const next = new Map(prev);
          next.set(sensorId, { value, timestamp: Date.now() });
          return next;
        });
      });

      // Connect and register sensors
      manager.connect(mqttConfig);
      manager.registerSensors(sensors);
    } catch (err) {
      console.error("[MqttProvider] Failed to connect:", err);
    }
  }, []);

  useEffect(() => {
    connectToMqtt();
    return () => {
      managerRef.current?.disconnect();
    };
  }, [connectToMqtt]);

  const publish = useCallback((topic: string, payload: string) => {
    managerRef.current?.publish(topic, payload);
  }, []);

  const reconnect = useCallback(() => {
    managerRef.current?.disconnect();
    connectToMqtt();
  }, [connectToMqtt]);

  return (
    <MqttContext.Provider value={{ status, liveData, publish, reconnect }}>
      {children}
    </MqttContext.Provider>
  );
}
