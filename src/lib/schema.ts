/**
 * Schema — Core types and Zod validation for the modular sensor platform.
 *
 * Entity relationships:
 *   SensorDef  →  PaneDef (one sensor can feed many panes)
 *   ControlDef →  ScheduleDef (each control has its own schedule)
 *   PaneDef    →  SensorDef (each pane references exactly one sensor)
 */

import { z } from "zod";

// ─── MQTT Payload Parsing ────────────────────────────────────────────────────

export const PayloadTypeSchema = z.enum(["raw", "json", "json_array", "boolean"]);
export type PayloadType = z.infer<typeof PayloadTypeSchema>;

export const MqttSourceSchema = z.object({
  topic: z.string().min(1),
  payloadType: PayloadTypeSchema,
  jsonPath: z.string().optional(),       // e.g., "$.value" or "$.temperature"
  trueValue: z.string().default("true"), // what string means ON
  falseValue: z.string().default("false"),
  // json_array mode: match array element by key field, extract value field
  arrayMatchField: z.string().optional(), // e.g., "id" — which field to match on
  arrayMatchValue: z.string().optional(), // e.g., "FF2707A51605" — value to match
  arrayValueField: z.string().optional(), // e.g., "temp" — field to extract
});
export type MqttSource = z.infer<typeof MqttSourceSchema>;

// ─── Sensor Definition ───────────────────────────────────────────────────────

export const SensorKindSchema = z.enum(["analog", "digital"]);
export type SensorKind = z.infer<typeof SensorKindSchema>;

export const SensorDirectionSchema = z.enum(["input", "output"]);
export type SensorDirection = z.infer<typeof SensorDirectionSchema>;

export const SensorDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: SensorKindSchema,
  direction: SensorDirectionSchema.default("input"),
  mqtt: MqttSourceSchema,
  unit: z.string().default(""),
  displayUnit: z.enum(["C", "F"]).optional(), // temperature display preference
  // Thresholds (analog inputs only)
  min: z.number().optional(),
  max: z.number().optional(),
  warningLow: z.number().optional(),
  warningHigh: z.number().optional(),
  criticalLow: z.number().optional(),
  criticalHigh: z.number().optional(),
  // Metadata
  hardware: z.string().optional(),
  location: z.string().optional(),
});
export type SensorDef = z.infer<typeof SensorDefSchema>;

// ─── Schedule Definition ─────────────────────────────────────────────────────

export const ScheduleTypeSchema = z.enum(["manual", "solar", "seasonal"]);

export const SeasonalProfileSchema = z.object({
  label: z.string().min(1),
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12),
  endDay: z.number().int().min(1).max(31),
  type: z.enum(["manual", "solar"]),
  onTime: z.string().optional(),           // "HH:MM" for manual
  offTime: z.string().optional(),
  sunriseOffset: z.number().int().default(0), // minutes offset
  sunsetOffset: z.number().int().default(0),
});
export type SeasonalProfile = z.infer<typeof SeasonalProfileSchema>;

export const ScheduleDefSchema = z.object({
  type: ScheduleTypeSchema,
  timezone: z.string().default("America/Los_Angeles"),
  // Manual mode
  onTime: z.string().optional(),
  offTime: z.string().optional(),
  // Solar mode
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  sunriseOffset: z.number().int().default(0),
  sunsetOffset: z.number().int().default(0),
  // Seasonal mode
  profiles: z.array(SeasonalProfileSchema).optional(),
});
export type ScheduleDef = z.infer<typeof ScheduleDefSchema>;

// ─── Setpoint Schedule (general-purpose, for any PID-controlled output) ──────

export const SetpointScheduleEntrySchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/),  // "HH:MM" — absolute time-of-day
  setpoint: z.number().min(30).max(150),     // target value in sensor's display unit
  ramp: z.boolean().default(true),            // true = linear interpolation, false = step
  label: z.string().optional(),               // "day", "night", "ramp-up" — for UI display
});
export type SetpointScheduleEntry = z.infer<typeof SetpointScheduleEntrySchema>;

// Solar-relative setpoint: define targets relative to sunrise/sunset instead of clock time
export const SolarSetpointEntrySchema = z.object({
  anchor: z.enum(["sunrise", "sunset", "solar_noon"]),
  offsetMinutes: z.number().int().default(0), // e.g., +120 = 2h after sunrise
  setpoint: z.number().min(30).max(150),
  ramp: z.boolean().default(true),
  label: z.string().optional(),
});
export type SolarSetpointEntry = z.infer<typeof SolarSetpointEntrySchema>;

// Seasonal thermal profile — overrides daily schedule per date range
export const SeasonalThermalProfileSchema = z.object({
  id: z.string().min(1),                       // "spring", "summer", custom name
  label: z.string(),
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12),
  endDay: z.number().int().min(1).max(31),
  // Override schedule for this season (time-based OR solar-relative)
  schedule: z.array(SetpointScheduleEntrySchema).optional(),
  solarSchedule: z.array(SolarSetpointEntrySchema).optional(),
  // Lighting offset for this season (applied to linked light controls)
  sunriseOffsetMinutes: z.number().int().optional(),
  sunsetOffsetMinutes: z.number().int().optional(),
});
export type SeasonalThermalProfile = z.infer<typeof SeasonalThermalProfileSchema>;

// Brumation override — safety-critical mode that suspends normal scheduling
export const BrumationOverrideSchema = z.object({
  enabled: z.boolean().default(false),
  targetTempF: z.number().min(40).max(75).default(60),
  rampDownDays: z.number().int().min(1).max(30).default(7),
  rampUpDays: z.number().int().min(1).max(30).default(7),
  startDate: z.string().optional(),   // ISO date when brumation started
  endDate: z.string().optional(),     // ISO date when brumation ended
  photoperiodHours: z.number().min(0).max(24).default(8),
  suppressFeedingReminders: z.boolean().default(true),
});
export type BrumationOverride = z.infer<typeof BrumationOverrideSchema>;

// ─── Natural Cycle Configuration ─────────────────────────────────────────────
// Climate-driven PID setpoint scheduling with bounded seasonal/diurnal curves.

export const NaturalCycleSeasonIdSchema = z.enum(["spring", "summer", "fall", "winter"]);
export type NaturalCycleSeasonId = z.infer<typeof NaturalCycleSeasonIdSchema>;

export const NaturalCycleSeasonSchema = z.object({
  id: NaturalCycleSeasonIdSchema,
  dayPeakF: z.number(),           // scaled target high (user-editable)
  nightLowF: z.number(),          // scaled target low (user-editable)
  peakOffsetMinutes: z.number().int().default(60), // minutes after solar noon for peak
  ramp: z.boolean().default(true), // linear interpolation vs step
  enabled: z.boolean().default(true),
});
export type NaturalCycleSeason = z.infer<typeof NaturalCycleSeasonSchema>;

export const NaturalCycleConfigSchema = z.object({
  minSetpointF: z.number().min(50).max(100),   // safe floor (hard lower bound)
  maxSetpointF: z.number().min(50).max(120),   // safe ceiling (hard upper bound)
  seasons: z.array(NaturalCycleSeasonSchema).length(4),
  transitionDays: z.number().int().default(14), // days to blend between seasons
});
export type NaturalCycleConfig = z.infer<typeof NaturalCycleConfigSchema>;

// Climate data cache shape (stored in SQLite climate_cache table, not in config)
export const ClimateDataCacheSchema = z.object({
  fetchedAt: z.string(),
  habitatLat: z.number(),
  habitatLng: z.number(),
  monthlyAvgHighF: z.array(z.number()).length(12),  // Jan=0..Dec=11
  monthlyAvgLowF: z.array(z.number()).length(12),
  annualMinF: z.number(),
  annualMaxF: z.number(),
});
export type ClimateDataCache = z.infer<typeof ClimateDataCacheSchema>;

export const PidScheduleModeSchema = z.enum(["static", "natural", "daily", "solar", "seasonal"]);
export type PidScheduleMode = z.infer<typeof PidScheduleModeSchema>;

// ─── PID Control Configuration ───────────────────────────────────────────────

export const PidConfigSchema = z.object({
  inputSensorId: z.string().min(1),     // sensor to read process variable from
  setpoint: z.number(),                  // target value (static fallback)
  hysteresis: z.number().default(2),     // dead band ±units for toggle controls
  Kp: z.number().default(2.0),          // proportional gain
  Ki: z.number().default(0.5),          // integral gain
  Kd: z.number().default(1.0),          // derivative gain
  pwmWindowMs: z.number().optional(),   // dynamically sized window for time-proportioning
  tuned: z.boolean().default(false),     // true after auto-tune completes
  // ── Dynamic Scheduling ──
  scheduleMode: PidScheduleModeSchema.default("static"),
  setpointSchedule: z.array(SetpointScheduleEntrySchema).optional(),    // daily mode
  solarSchedule: z.array(SolarSetpointEntrySchema).optional(),          // solar mode
  seasonalProfiles: z.array(SeasonalThermalProfileSchema).optional(),   // seasonal mode
  naturalCycle: NaturalCycleConfigSchema.optional(),                    // natural mode
  brumation: BrumationOverrideSchema.optional(),
  // ── Sensor Calibration ──
  sensorOffset: z.number().default(0),   // offset applied to sensor reading before PID
  sensorOffsetLabel: z.string().optional(), // "substrate depth compensation"
});
export type PidConfig = z.infer<typeof PidConfigSchema>;

// ─── Control Definition ──────────────────────────────────────────────────────

export const ControlKindSchema = z.enum(["toggle", "pwm"]);
export const ControlModeSchema = z.enum(["on", "off", "auto"]);
export const AutoStrategySchema = z.enum(["schedule", "pid"]).default("schedule");
export type AutoStrategy = z.infer<typeof AutoStrategySchema>;

export const ControlMqttSchema = z.object({
  statusTopic: z.string().optional().default(""),
  controlTopic: z.string().min(1),
  onValue: z.string().default("true"),
  offValue: z.string().default("false"),
}).transform((val) => ({
  ...val,
  // Default statusTopic to controlTopic when empty/missing
  statusTopic: val.statusTopic || val.controlTopic,
}));

export const ControlDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: ControlKindSchema,
  mqtt: ControlMqttSchema,
  mode: ControlModeSchema.default("off"),
  autoStrategy: AutoStrategySchema,       // "schedule" or "pid"
  schedule: ScheduleDefSchema.optional(), // used when autoStrategy = "schedule"
  pid: PidConfigSchema.optional(),        // used when autoStrategy = "pid"
  hoursSensorId: z.string().optional(),
  icon: z.string().optional(),            // lucide icon name for history overlay
  color: z.string().optional(),           // hex color for history chart bar
});
export type ControlDef = z.infer<typeof ControlDefSchema>;

// ─── Dashboard Pane ──────────────────────────────────────────────────────────

export const DisplayTypeSchema = z.enum(["gauge", "number", "chart", "bar", "switch", "stream"]);
export type DisplayType = z.infer<typeof DisplayTypeSchema>;

export const ColorThemeSchema = z.enum(["warm", "cool", "amber", "green", "neutral"]);
export type ColorTheme = z.infer<typeof ColorThemeSchema>;

export const ChartRangeSchema = z.enum(["1h", "6h", "24h", "7d", "30d"]);
export type ChartRange = z.infer<typeof ChartRangeSchema>;

// ─── Stream Configuration (RTSP/HLS/MJPEG cameras) ──────────────────────────

export const StreamProtocolSchema = z.enum(["hls", "mjpeg", "img"]);
export type StreamProtocol = z.infer<typeof StreamProtocolSchema>;

export const StreamConfigSchema = z.object({
  url: z.string().default(""),                    // HLS m3u8, MJPEG endpoint, or snapshot URL
  protocol: StreamProtocolSchema.default("hls"),   // how to render
  refreshInterval: z.number().int().default(5000), // for img mode: ms between refreshes
  label: z.string().optional(),                    // camera name
});
export type StreamConfig = z.infer<typeof StreamConfigSchema>;

// ─── Camera & Zone Detection ─────────────────────────────────────────────────

export const ZoneDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),                              // "Warm Hide", "Water Bowl"
  color: z.string().default("#ef4444"),                   // hex color for overlay
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x1, y1, x2, y2] normalized 0-1
});
export type ZoneDef = z.infer<typeof ZoneDefSchema>;

export const DetectionModeSchema = z.enum(["reptile", "aquarium", "general"]);
export type DetectionMode = z.infer<typeof DetectionModeSchema>;

export const CameraDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),                              // "Enclosure Cam 1"
  url: z.string().default(""),                            // MJPEG source URL
  protocol: StreamProtocolSchema.default("mjpeg"),
  enabled: z.boolean().default(true),                     // start/stop detection
  // Detection settings — adjustable at runtime
  detectionFps: z.number().min(0.1).max(10).default(1),   // frames per second to process
  sensitivity: z.number().min(1).max(100).default(25),    // pixel diff threshold (lower = more sensitive)
  minMotionArea: z.number().min(10).max(50000).default(500), // min changed pixels to count as motion
  settleTimeout: z.number().min(1).max(120).default(10),  // seconds of no motion before "settled"
  blurKernel: z.number().min(3).max(31).default(21),      // gaussian blur kernel size (odd)
  // Zones (max ~6)
  zones: z.array(ZoneDefSchema).default([]),
  // Enclosure type — controls detection algorithm (fish later)
  detectionMode: DetectionModeSchema.default("reptile"),
  // Multi-camera: future 3D interpolation
  cameraIndex: z.number().int().default(0),               // 0-based index for multi-cam setups
  // MQTT topic prefix for publishing location events
  mqttTopicPrefix: z.string().default(""),                 // e.g. "enclosure/aspen" → publishes to enclosure/aspen/location
});
export type CameraDef = z.infer<typeof CameraDefSchema>;

export const PaneDefSchema = z.object({
  id: z.string().min(1),
  sensorId: z.string().optional(),       // optional — one of sensorId or controlId must be set
  controlId: z.string().optional(),      // link directly to a control
  displayType: DisplayTypeSchema,
  colSpan: z.union([z.literal(1), z.literal(2)]).default(1),
  colorTheme: ColorThemeSchema.default("neutral"),
  chartRange: ChartRangeSchema.optional(),
  labelOverride: z.string().optional(),
  minOverride: z.number().optional(),
  maxOverride: z.number().optional(),
  order: z.number().int().default(0),
  displayUnit: z.string().optional(),
  streamConfig: StreamConfigSchema.optional(), // for stream panes only
});
export type PaneDef = z.infer<typeof PaneDefSchema>;

// ─── MQTT Broker Config ──────────────────────────────────────────────────────

export const MqttConfigSchema = z.object({
  host: z.string().default("snekpi"),
  port: z.number().int().default(1880),
  protocol: z.enum(["ws", "wss"]).default("ws"),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type MqttConfig = z.infer<typeof MqttConfigSchema>;

// ─── Location (for solar calculations) ───────────────────────────────────────

export const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().optional(),
  // Habitat reference (animal's native range, for climate data)
  habitatLatitude: z.number().min(-90).max(90).optional(),
  habitatLongitude: z.number().min(-180).max(180).optional(),
  habitatLabel: z.string().optional(),  // e.g., "Kansas Grasslands"
});
export type Location = z.infer<typeof LocationSchema>;

// ─── Enclosure Profiles ──────────────────────────────────────────────────────

export const EnclosureTypeSchema = z.enum(["reptile", "aquarium"]);
export type EnclosureType = z.infer<typeof EnclosureTypeSchema>;

export const EnclosureProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: EnclosureTypeSchema,
  icon: z.string().default("🐍"),
});
export type EnclosureProfile = z.infer<typeof EnclosureProfileSchema>;

// ─── Inhabitants (aquarium) ──────────────────────────────────────────────────

export const InhabitantCategorySchema = z.enum([
  "fish", "shrimp", "snail", "crab", "plant", "coral", "reptile", "other",
]);
export type InhabitantCategory = z.infer<typeof InhabitantCategorySchema>;

export const InhabitantStatusSchema = z.enum([
  "alive", "deceased", "rehomed", "missing",
]);
export type InhabitantStatus = z.infer<typeof InhabitantStatusSchema>;

export const InhabitantSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  species: z.string().min(1),
  commonName: z.string().min(1),
  name: z.string().optional(),
  category: InhabitantCategorySchema,
  count: z.number().int().default(1),
  addedDate: z.string(),
  status: InhabitantStatusSchema.default("alive"),
  deceasedDate: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
  photoUrl: z.string().optional(),
  // Reptile-specific fields
  sex: z.enum(["male", "female", "unsexed"]).optional(),
  birthDate: z.string().optional(),
  morph: z.string().optional(),
  speciesProfileId: z.string().optional(),
});
export type Inhabitant = z.infer<typeof InhabitantSchema>;

// ─── Care Events ─────────────────────────────────────────────────────────────

// All care event types (reptile + aquarium)
export const CareEventTypeSchema = z.enum([
  // Reptile
  "feeding", "handling", "measurement", "shedding", "schedule",
  "bedding_change", "cleaning",
  // Aquarium
  "water_change", "water_test", "addition", "loss", "maintenance", "medication",
]);
export type CareEventType = z.infer<typeof CareEventTypeSchema>;

// Reptile care event types
export const REPTILE_CARE_TYPES: CareEventType[] = [
  "feeding", "handling", "measurement", "shedding", "bedding_change", "cleaning",
];

// Aquarium care event types
export const AQUARIUM_CARE_TYPES: CareEventType[] = [
  "feeding", "water_change", "water_test", "addition", "loss", "maintenance", "medication",
];

// Prey types for reptile feeding
export const PreyTypeSchema = z.enum([
  "pinky", "fuzzy", "hopper", "weanling", "adult", "other",
]);
export type PreyType = z.infer<typeof PreyTypeSchema>;

// Temperament for handling
export const TemperamentSchema = z.enum([
  "calm", "curious", "nervous", "defensive", "nippy", "other",
]);
export type Temperament = z.infer<typeof TemperamentSchema>;

// Shed quality
export const ShedQualitySchema = z.enum(["clean", "partial", "stuck"]);
export type ShedQuality = z.infer<typeof ShedQualitySchema>;

// ─── Reptile Data Shapes ─────────────────────────────────────────────────────

export const FeedingDataSchema = z.object({
  preyType: PreyTypeSchema,
  preyWeightGrams: z.number().positive().optional(),
  accepted: z.boolean(),
  notes: z.string().optional(),
});
export type FeedingData = z.infer<typeof FeedingDataSchema>;

export const HandlingDataSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  temperament: TemperamentSchema,
  notes: z.string().optional(),
});
export type HandlingData = z.infer<typeof HandlingDataSchema>;

export const MeasurementDataSchema = z.object({
  weightGrams: z.number().positive(),
  lengthCm: z.number().positive().optional(),
  notes: z.string().optional(),
});
export type MeasurementData = z.infer<typeof MeasurementDataSchema>;

export const RetainedPieceSchema = z.object({
  location: z.string(),
  resolvedDate: z.string().optional(),
  method: z.string().optional(),
});
export type RetainedPiece = z.infer<typeof RetainedPieceSchema>;

export const SheddingDataSchema = z.object({
  blueDate: z.string().optional(),
  shedDate: z.string().optional(),
  complete: z.boolean(),
  retainedPieces: z.array(RetainedPieceSchema).optional(),
  quality: ShedQualitySchema,
  notes: z.string().optional(),
});
export type SheddingData = z.infer<typeof SheddingDataSchema>;

export const ScheduleEventDataSchema = z.object({
  controlId: z.string(),
  controlLabel: z.string(),
  action: z.enum(["on", "off"]),
  trigger: z.string(),
});
export type ScheduleEventData = z.infer<typeof ScheduleEventDataSchema>;

// ─── Aquarium Data Shapes ────────────────────────────────────────────────────

export const AquariumFoodTypeSchema = z.enum([
  "flake", "pellet", "frozen", "live", "gel", "wafer", "bloodworm", "other",
]);
export type AquariumFoodType = z.infer<typeof AquariumFoodTypeSchema>;

export const AquariumFeedingDataSchema = z.object({
  foodType: AquariumFoodTypeSchema,
  brand: z.string().optional(),
  notes: z.string().optional(),
});
export type AquariumFeedingData = z.infer<typeof AquariumFeedingDataSchema>;

export const WaterChangeDataSchema = z.object({
  percentChanged: z.number().min(0).max(100),
  notes: z.string().optional(),
});
export type WaterChangeData = z.infer<typeof WaterChangeDataSchema>;

export const WaterTestDataSchema = z.object({
  pH: z.number().optional(),
  ammonia: z.number().optional(),
  nitrite: z.number().optional(),
  nitrate: z.number().optional(),
  tempF: z.number().optional(),
  GH: z.number().optional(),
  KH: z.number().optional(),
  notes: z.string().optional(),
});
export type WaterTestData = z.infer<typeof WaterTestDataSchema>;

export const AdditionDataSchema = z.object({
  species: z.string(),
  commonName: z.string(),
  category: InhabitantCategorySchema,
  count: z.number().int().positive().default(1),
  source: z.string().optional(),
  cost: z.number().optional(),
  notes: z.string().optional(),
});
export type AdditionData = z.infer<typeof AdditionDataSchema>;

export const LossDataSchema = z.object({
  inhabitantId: z.string().optional(),
  species: z.string(),
  commonName: z.string(),
  count: z.number().int().positive().default(1),
  suspectedCause: z.enum([
    "disease", "old_age", "aggression", "water_quality",
    "jumping", "unknown", "other",
  ]).default("unknown"),
  notes: z.string().optional(),
});
export type LossData = z.infer<typeof LossDataSchema>;

export const MaintenanceTaskSchema = z.enum([
  "filter_clean", "water_top_off", "equipment_swap",
  "plant_trim", "glass_clean", "substrate_vac", "other",
]);

export const MaintenanceDataSchema = z.object({
  task: MaintenanceTaskSchema,
  equipment: z.string().optional(),
  notes: z.string().optional(),
});
export type MaintenanceData = z.infer<typeof MaintenanceDataSchema>;

export const MedicationDataSchema = z.object({
  medication: z.string(),
  dose: z.string().optional(),
  targetSpecies: z.string().optional(),
  notes: z.string().optional(),
});
export type MedicationData = z.infer<typeof MedicationDataSchema>;

// ─── Reptile Maintenance Data Shapes ─────────────────────────────────────────

export const SubstrateTypeSchema = z.enum([
  "aspen", "coconut_fiber", "cypress_mulch", "paper_towel",
  "reptile_carpet", "bioactive_mix", "topsoil_sand_mix", "other",
]);
export type SubstrateType = z.infer<typeof SubstrateTypeSchema>;

export const BeddingChangeDataSchema = z.object({
  substrateType: SubstrateTypeSchema,
  depthInches: z.number().min(0).max(12).optional(),
  fullChange: z.boolean().default(true),   // full replacement vs spot
  notes: z.string().optional(),
});
export type BeddingChangeData = z.infer<typeof BeddingChangeDataSchema>;

export const CleaningScopeSchema = z.enum(["spot", "partial", "full"]);
export type CleaningScope = z.infer<typeof CleaningScopeSchema>;

export const CleaningDataSchema = z.object({
  scope: CleaningScopeSchema,
  disinfected: z.boolean().default(false),
  disinfectant: z.string().optional(),     // "chlorhexidine", "F10SC", etc.
  waterBowlCleaned: z.boolean().default(false),
  notes: z.string().optional(),
});
export type CleaningData = z.infer<typeof CleaningDataSchema>;

// ─── Unified Care Event ──────────────────────────────────────────────────────

export const CareEventSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  date: z.string(),              // YYYY-MM-DD
  time: z.string().optional(),   // HH:MM (24h)
  type: CareEventTypeSchema,
  data: z.union([
    // Reptile
    FeedingDataSchema,
    HandlingDataSchema,
    MeasurementDataSchema,
    SheddingDataSchema,
    ScheduleEventDataSchema,
    BeddingChangeDataSchema,
    CleaningDataSchema,
    // Aquarium
    AquariumFeedingDataSchema,
    WaterChangeDataSchema,
    WaterTestDataSchema,
    AdditionDataSchema,
    LossDataSchema,
    MaintenanceDataSchema,
    MedicationDataSchema,
  ]),
  photoUrl: z.string().optional(),
  createdAt: z.string(),
});
export type CareEvent = z.infer<typeof CareEventSchema>;
