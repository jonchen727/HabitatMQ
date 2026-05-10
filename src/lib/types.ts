/**
 * Smart Enclosure — Type Definitions
 *
 * Sensor readings, device states, alert types, zone tracking,
 * PID controllers, and sensor configuration for the RPi-driven vivarium.
 */

// ─── Sensor Types ────────────────────────────────────────────────────────────

export type SensorType = "temperature" | "humidity" | "lux";

export type SensorId = string;

export interface SensorReading {
  sensorId: SensorId;
  value: number;
  unit: "°F" | "%RH" | "lux";
  timestamp: number;
  status: "normal" | "warning" | "critical" | "offline";
}

export interface SensorConfig {
  id: SensorId;
  label: string;
  type: SensorType;
  location: string;
  unit: "°F" | "%RH" | "lux";
  hardware: "DS18B20" | "DHT22" | "BH1750";
  gpioPin: string;
  zoneId: ZoneId | null;
  dayTarget: [number, number];
  nightTarget: [number, number];
  warningThresholds: [number, number];
  criticalThresholds: [number, number];
  icon: string;
  /** Position on the visual placement map (percentage 0-100) */
  mapPosition: { x: number; y: number } | null;
}

// ─── Device Types ────────────────────────────────────────────────────────────

export type DeviceId =
  | "HEAT_BASK"
  | "HEAT_CHE"
  | "HEAT_PAD"
  | "LIGHT_UVB"
  | "LIGHT_VIS"
  | "MIST"
  | "CAM_IR"
  | "BAY_FANS";

export interface DeviceState {
  deviceId: DeviceId;
  label: string;
  icon: string;
  type: "relay" | "pwm";
  isOn: boolean;
  outputPercent?: number;
  autoMode: boolean;
}

// ─── Alert Types ─────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  condition: string;
  timestamp: number;
  acknowledged: boolean;
}

// ─── Zone Types ──────────────────────────────────────────────────────────────

export type ZoneId =
  | "basking"
  | "warm_hide"
  | "burrow"
  | "transition"
  | "water"
  | "humid_hide"
  | "cool"
  | "cool_hide"
  | "leaf_litter"
  | "burrowed";

export const ZONE_LABELS: Record<ZoneId, string> = {
  basking: "Basking Zone",
  warm_hide: "Warm Hide",
  burrow: "Burrow",
  transition: "Transition",
  water: "Water Bowl",
  humid_hide: "Humid Hide",
  cool: "Cool Zone",
  cool_hide: "Cool Hide",
  leaf_litter: "Leaf Litter",
  burrowed: "Burrowed",
};

export const ZONE_COLORS: Record<ZoneId, { bg: string; border: string; fill: string }> = {
  basking:     { bg: "bg-orange-500/40", border: "border-orange-500/60", fill: "#f97316" },
  warm_hide:   { bg: "bg-red-500/30",    border: "border-red-500/50",    fill: "#ef4444" },
  burrow:      { bg: "bg-amber-800/30",  border: "border-amber-800/50",  fill: "#92400e" },
  transition:  { bg: "bg-yellow-500/20", border: "border-yellow-500/40", fill: "#eab308" },
  water:       { bg: "bg-cyan-500/30",   border: "border-cyan-500/50",   fill: "#06b6d4" },
  humid_hide:  { bg: "bg-green-500/30",  border: "border-green-500/50",  fill: "#22c55e" },
  cool:        { bg: "bg-blue-400/20",   border: "border-blue-400/40",   fill: "#60a5fa" },
  cool_hide:   { bg: "bg-purple-500/30", border: "border-purple-500/50", fill: "#a855f7" },
  leaf_litter: { bg: "bg-amber-700/20",  border: "border-amber-700/40",  fill: "#b45309" },
  burrowed:    { bg: "bg-stone-600/20",  border: "border-stone-600/40",  fill: "#57534e" },
};

export interface ZoneDetection {
  currentZone: ZoneId;
  confidence: number;
  duration: number;
  lastMovement: number;
  activity: "Resting" | "Exploring" | "Basking" | "Soaking" | "Burrowing" | "Hunting" | "Not Visible";
}

// ─── PID Types ───────────────────────────────────────────────────────────────

export interface PIDState {
  label: string;
  setpoint: number;
  actual: number;
  output: number;
  Kp: number;
  Ki: number;
  Kd: number;
  error: number;
  pwmWindowMs?: number;
  pwmWindowElapsed?: number;
  pwmOnTimeMs?: number;
  pwmShouldBeOn?: boolean;
  autoTuning?: boolean;
  scheduleMode?: string;
  schedulePhase?: string;
  sensorOffset?: number;
}

// ─── Lighting Schedule ───────────────────────────────────────────────────────

export interface LightSchedule {
  season: "spring_summer" | "fall_winter";
  lightsOn: string;
  lightsOff: string;
  totalHours: number;
  currentState: "day" | "night" | "dawn" | "dusk";
  hoursRemaining: number;
}

// ─── Enclosure State (Aggregate) ─────────────────────────────────────────────

export interface EnclosureState {
  sensors: Record<SensorId, SensorReading>;
  devices: Record<DeviceId, DeviceState>;
  alerts: Alert[];
  zone: ZoneDetection;
  pid: {
    basking: PIDState;
    heatPad: PIDState;
  };
  schedule: LightSchedule;
  shedMode: boolean;
  nightOverride: boolean;
  lastUpdate: number;
}
