/**
 * Mock Data Generators for the Enclosure Dashboard
 *
 * Produces realistic sensor readings, device states, zone detection,
 * PID states, alerts, and activity heatmap data for UI development.
 */

import type {
  SensorConfig,
  SensorReading,
  SensorId,
  DeviceState,
  DeviceId,
  Alert,
  ZoneDetection,
  ZoneId,
  PIDState,
  LightSchedule,
  EnclosureState,
} from "./types";

// ─── Default Sensor Configs ──────────────────────────────────────────────────

export const DEFAULT_SENSORS: SensorConfig[] = [
  {
    id: "TEMP_BASK", label: "Basking Surface", type: "temperature",
    location: "Warm side — on basking slate", unit: "°F", hardware: "DS18B20",
    gpioPin: "GPIO4 (1-Wire)", zoneId: "basking",
    dayTarget: [88, 95], nightTarget: [75, 80],
    warningThresholds: [85, 98], criticalThresholds: [80, 102],
    icon: "🔥", mapPosition: { x: 15, y: 35 },
  },
  {
    id: "TEMP_WARM", label: "Warm Ambient", type: "temperature",
    location: "Warm side wall, 4-6\" above substrate", unit: "°F", hardware: "DHT22",
    gpioPin: "GPIO17", zoneId: "warm_hide",
    dayTarget: [80, 85], nightTarget: [72, 78],
    warningThresholds: [78, 88], criticalThresholds: [75, 92],
    icon: "🌡️", mapPosition: { x: 12, y: 20 },
  },
  {
    id: "TEMP_COOL", label: "Cool Ambient", type: "temperature",
    location: "Cool side wall, 4-6\" above substrate", unit: "°F", hardware: "DHT22",
    gpioPin: "GPIO27", zoneId: "cool",
    dayTarget: [70, 76], nightTarget: [65, 72],
    warningThresholds: [68, 79], criticalThresholds: [62, 82],
    icon: "❄️", mapPosition: { x: 85, y: 20 },
  },
  {
    id: "TEMP_SUB", label: "Substrate (Warm)", type: "temperature",
    location: "Buried 1.5\" in warm side substrate", unit: "°F", hardware: "DS18B20",
    gpioPin: "GPIO4 (1-Wire)", zoneId: "basking",
    dayTarget: [82, 88], nightTarget: [78, 82],
    warningThresholds: [80, 90], criticalThresholds: [75, 95],
    icon: "🌍", mapPosition: { x: 20, y: 70 },
  },
  {
    id: "HUM_WARM", label: "Humidity (Warm)", type: "humidity",
    location: "Warm side wall", unit: "%RH", hardware: "DHT22",
    gpioPin: "GPIO17", zoneId: "warm_hide",
    dayTarget: [30, 50], nightTarget: [35, 55],
    warningThresholds: [25, 60], criticalThresholds: [20, 70],
    icon: "💧", mapPosition: { x: 12, y: 45 },
  },
  {
    id: "HUM_COOL", label: "Humidity (Cool)", type: "humidity",
    location: "Cool side wall", unit: "%RH", hardware: "DHT22",
    gpioPin: "GPIO27", zoneId: "cool",
    dayTarget: [30, 50], nightTarget: [35, 55],
    warningThresholds: [25, 60], criticalThresholds: [20, 70],
    icon: "💧", mapPosition: { x: 85, y: 45 },
  },
  {
    id: "LUX_AMB", label: "Ambient Light", type: "lux",
    location: "Center of enclosure, substrate level", unit: "lux", hardware: "BH1750",
    gpioPin: "I2C (SDA/SCL)", zoneId: "transition",
    dayTarget: [200, 800], nightTarget: [0, 5],
    warningThresholds: [100, 1200], criticalThresholds: [50, 2000],
    icon: "☀️", mapPosition: { x: 50, y: 50 },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getSensorStatus(
  value: number,
  warn: [number, number],
  crit: [number, number]
): "normal" | "warning" | "critical" {
  if (value < crit[0] || value > crit[1]) return "critical";
  if (value < warn[0] || value > warn[1]) return "warning";
  return "normal";
}

// ─── Generate Readings ──────────────────────────────────────────────────────

export function generateReading(sensor: SensorConfig): SensorReading {
  const target = sensor.dayTarget;
  const mid = (target[0] + target[1]) / 2;
  const spread = (target[1] - target[0]) / 2;
  const value = clamp(
    mid + (Math.random() - 0.5) * spread * 2.5,
    sensor.criticalThresholds[0] - 5,
    sensor.criticalThresholds[1] + 5
  );

  return {
    sensorId: sensor.id,
    value: Math.round(value * 10) / 10,
    unit: sensor.unit,
    timestamp: Date.now(),
    status: getSensorStatus(value, sensor.warningThresholds, sensor.criticalThresholds),
  };
}

// ─── Generate Devices ────────────────────────────────────────────────────────

export function generateDevices(): Record<DeviceId, DeviceState> {
  const hour = new Date().getHours();
  const isDay = hour >= 7 && hour < 21;

  return {
    HEAT_BASK: { deviceId: "HEAT_BASK", label: "Halogen Basking", icon: "🔆", type: "pwm", isOn: isDay, outputPercent: isDay ? Math.round(rand(55, 80)) : 0, autoMode: true },
    HEAT_CHE: { deviceId: "HEAT_CHE", label: "Ceramic Heat Emitter", icon: "♨️", type: "relay", isOn: !isDay, autoMode: true },
    HEAT_PAD: { deviceId: "HEAT_PAD", label: "Heat Pad", icon: "🔥", type: "pwm", isOn: true, outputPercent: Math.round(rand(30, 65)), autoMode: true },
    LIGHT_UVB: { deviceId: "LIGHT_UVB", label: "UVB Tube", icon: "🔬", type: "relay", isOn: isDay, autoMode: true },
    LIGHT_VIS: { deviceId: "LIGHT_VIS", label: "LED Strip", icon: "💡", type: "relay", isOn: isDay, autoMode: true },
    MIST: { deviceId: "MIST", label: "Mister", icon: "🌧️", type: "relay", isOn: false, autoMode: true },
    CAM_IR: { deviceId: "CAM_IR", label: "IR LEDs", icon: "👁️", type: "relay", isOn: !isDay, autoMode: true },
    BAY_FANS: { deviceId: "BAY_FANS", label: "Bay Fans", icon: "🌀", type: "relay", isOn: true, autoMode: true },
  };
}

// ─── Generate Zone Detection ─────────────────────────────────────────────────

export function generateZone(): ZoneDetection {
  const zones: ZoneId[] = ["basking", "warm_hide", "cool_hide", "transition", "burrowed", "water"];
  const activities: ZoneDetection["activity"][] = ["Resting", "Exploring", "Basking", "Soaking", "Burrowing", "Not Visible"];
  const zone = pick(zones);

  return {
    currentZone: zone,
    confidence: zone === "burrowed" ? 0 : clamp(rand(0.7, 0.99), 0, 1),
    duration: Math.round(rand(5, 180)),
    lastMovement: Math.round(rand(1, 45)),
    activity: zone === "basking" ? "Basking" : zone === "water" ? "Soaking" : zone === "burrowed" ? "Not Visible" : pick(activities),
  };
}

// ─── Generate PID State ──────────────────────────────────────────────────────

export function generatePID(label: string, setpoint: number, kp: number, ki: number, kd: number): PIDState {
  const actual = setpoint + rand(-3, 3);
  const error = setpoint - actual;
  const output = clamp(kp * error + ki * error * 0.1 + kd * (error - rand(-0.5, 0.5)), 0, 100);

  return { label, setpoint, actual: Math.round(actual * 10) / 10, output: Math.round(output * 10) / 10, Kp: kp, Ki: ki, Kd: kd, error: Math.round(error * 10) / 10 };
}

// ─── Generate Alerts ─────────────────────────────────────────────────────────

export function generateAlerts(sensors: Record<SensorId, SensorReading>): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  for (const reading of Object.values(sensors)) {
    if (reading.status === "critical") {
      alerts.push({
        id: `alert-${reading.sensorId}-${now}`,
        severity: "critical",
        message: `${reading.sensorId} reading ${reading.value}${reading.unit} is out of safe range`,
        condition: `${reading.sensorId} > critical threshold`,
        timestamp: now - Math.round(rand(0, 300_000)),
        acknowledged: false,
      });
    } else if (reading.status === "warning") {
      alerts.push({
        id: `alert-${reading.sensorId}-${now}`,
        severity: "warning",
        message: `${reading.sensorId} reading ${reading.value}${reading.unit} is outside target range`,
        condition: `${reading.sensorId} > warning threshold`,
        timestamp: now - Math.round(rand(0, 600_000)),
        acknowledged: false,
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      id: `info-${now}`, severity: "info",
      message: "All systems operating within normal parameters",
      condition: "all_ok", timestamp: now, acknowledged: false,
    });
  }

  return alerts.sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Generate Schedule ───────────────────────────────────────────────────────

export function generateSchedule(): LightSchedule {
  const hour = new Date().getHours();
  const currentState: LightSchedule["currentState"] =
    hour >= 7 && hour < 8 ? "dawn" : hour >= 20 && hour < 21 ? "dusk" : hour >= 8 && hour < 20 ? "day" : "night";

  return {
    season: "spring_summer", lightsOn: "07:00", lightsOff: "21:00",
    totalHours: 14, currentState,
    hoursRemaining: currentState === "day" || currentState === "dawn" ? 21 - hour : currentState === "night" ? (7 + 24 - hour) % 24 : 1,
  };
}

// ─── Generate Full State ─────────────────────────────────────────────────────

export function generateEnclosureState(sensorConfigs: SensorConfig[] = DEFAULT_SENSORS): EnclosureState {
  const sensors: Record<SensorId, SensorReading> = {};
  for (const config of sensorConfigs) {
    sensors[config.id] = generateReading(config);
  }

  return {
    sensors,
    devices: generateDevices(),
    alerts: generateAlerts(sensors),
    zone: generateZone(),
    pid: {
      basking: generatePID("Basking Halogen", 92, 12.0, 0.5, 4.0),
      heatPad: generatePID("Heat Pad", 85, 8.0, 0.3, 3.0),
    },
    schedule: generateSchedule(),
    shedMode: false,
    nightOverride: false,
    lastUpdate: Date.now(),
  };
}

// ─── Heatmap Data ────────────────────────────────────────────────────────────

export interface HeatmapPoint {
  hour: number;
  zone: ZoneId;
  intensity: number;
}

export function generateHeatmapData(): HeatmapPoint[] {
  const zones: ZoneId[] = ["basking", "warm_hide", "transition", "cool_hide", "burrowed", "water"];
  const data: HeatmapPoint[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (const zone of zones) {
      let intensity = Math.random() * 0.3;
      // Behavioral patterns
      if (hour >= 7 && hour <= 10 && zone === "basking") intensity += 0.5;
      if (hour >= 22 || hour <= 5) {
        if (zone === "warm_hide" || zone === "burrowed") intensity += 0.4;
      }
      if (hour >= 14 && hour <= 17 && zone === "cool_hide") intensity += 0.3;
      if (hour >= 11 && hour <= 13 && zone === "transition") intensity += 0.25;

      data.push({ hour, zone, intensity: clamp(intensity, 0, 1) });
    }
  }

  return data;
}
