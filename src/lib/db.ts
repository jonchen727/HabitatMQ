/**
 * SQLite Database Layer
 *
 * Persists sensor, control, pane, profile, inhabitant, and MQTT config to disk.
 * Uses better-sqlite3 for synchronous, zero-dependency SQLite access.
 * DB file: data/enclosure.db (relative to project root).
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  SensorDef,
  ControlDef,
  PaneDef,
  MqttConfig,
  Location,
  CareEvent,
  EnclosureProfile,
  Inhabitant,
  ClimateDataCache,
  CameraDef,
} from "./schema";

// ─── Database Path ───────────────────────────────────────────────────────────

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "enclosure.db");

function getDb(): Database.Database {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

// ─── Schema Initialization ──────────────────────────────────────────────────

function initSchema(db: Database.Database) {
  // Step 1: Create tables (IF NOT EXISTS is a no-op for existing tables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensors (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'aspen',
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS controls (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'aspen',
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS panes (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'aspen',
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mqtt_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS care_events (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'aspen',
      date TEXT NOT NULL,
      time TEXT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      photo_url TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_care_events_date ON care_events(date);
    CREATE INDEX IF NOT EXISTS idx_care_events_type ON care_events(type);
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inhabitants (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inhabitants_profile ON inhabitants(profile_id);
    CREATE TABLE IF NOT EXISTS sensor_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id TEXT NOT NULL,
      value REAL NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON sensor_readings(sensor_id, ts);
    CREATE TABLE IF NOT EXISTS control_timers (
      control_id TEXT PRIMARY KEY,
      since INTEGER NOT NULL,
      total_hours REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS climate_cache (
      id TEXT PRIMARY KEY,
      habitat_lat REAL NOT NULL,
      habitat_lng REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cameras (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'aspen',
      data TEXT NOT NULL
    );
  `);

  // Step 2: Migrations — add columns to pre-existing tables that lack them
  try {
    db.exec(`ALTER TABLE sensors ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'aspen'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE controls ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'aspen'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE panes ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'aspen'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE care_events ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'aspen'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE care_events ADD COLUMN time TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE care_events ADD COLUMN photo_url TEXT`);
  } catch { /* column already exists */ }
  // Migration: add total_hours to control_timers if missing
  try {
    db.exec(`ALTER TABLE control_timers ADD COLUMN total_hours REAL NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Step 3: Create profile_id indexes AFTER migrations ensure column exists
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_care_events_profile ON care_events(profile_id)`);
  } catch { /* index already exists or column issue */ }

  // Migration: convert foodType="other" + brand containing bloodworm → foodType="bloodworm"
  try {
    const rows = db.prepare(
      `SELECT id, data FROM care_events WHERE type = 'feeding' AND data LIKE '%"foodType":"other"%' AND (data LIKE '%loodworm%' OR data LIKE '%lood Worm%' OR data LIKE '%lood_worm%')`
    ).all() as { id: string; data: string }[];
    for (const row of rows) {
      const parsed = JSON.parse(row.data);
      if (parsed.foodType === "other" && parsed.brand && /blood\s*worm/i.test(parsed.brand)) {
        parsed.foodType = "bloodworm";
        delete parsed.brand;
        db.prepare(`UPDATE care_events SET data = ? WHERE id = ?`).run(JSON.stringify(parsed), row.id);
      }
    }
  } catch { /* migration already ran or no matching rows */ }
}

// ─── Generic CRUD Helpers ───────────────────────────────────────────────────

function listAll<T>(db: Database.Database, table: string): T[] {
  const rows = db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

function listByProfile<T>(db: Database.Database, table: string, profileId: string): T[] {
  const rows = db.prepare(`SELECT data FROM ${table} WHERE profile_id = ?`).all(profileId) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

function getOne<T>(db: Database.Database, table: string, id: string): T | null {
  const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}

function upsert(db: Database.Database, table: string, id: string, data: unknown, profileId?: string) {
  if (profileId) {
    db.prepare(
      `INSERT INTO ${table} (id, profile_id, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, profile_id = excluded.profile_id`
    ).run(id, profileId, JSON.stringify(data));
  } else {
    db.prepare(
      `INSERT INTO ${table} (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).run(id, JSON.stringify(data));
  }
}

function remove(db: Database.Database, table: string, id: string): boolean {
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ─── Profile CRUD ────────────────────────────────────────────────────────────

export function listProfiles(): EnclosureProfile[] {
  const db = getDb();
  try { return listAll<EnclosureProfile>(db, "profiles"); }
  finally { db.close(); }
}

export function getProfile(id: string): EnclosureProfile | null {
  const db = getDb();
  try { return getOne<EnclosureProfile>(db, "profiles", id); }
  finally { db.close(); }
}

export function saveProfile(profile: EnclosureProfile) {
  const db = getDb();
  try { upsert(db, "profiles", profile.id, profile); }
  finally { db.close(); }
}

export function deleteProfile(id: string): boolean {
  const db = getDb();
  try { return remove(db, "profiles", id); }
  finally { db.close(); }
}

export function getActiveProfileId(): string {
  const db = getDb();
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'activeProfileId'").get() as { value: string } | undefined;
    return row?.value ?? "aspen";
  }
  finally { db.close(); }
}

export function setActiveProfileId(id: string) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(id);
  }
  finally { db.close(); }
}

// ─── Sensor CRUD ─────────────────────────────────────────────────────────────

export function listSensors(profileId?: string): SensorDef[] {
  const db = getDb();
  try {
    if (profileId) return listByProfile<SensorDef>(db, "sensors", profileId);
    return listAll<SensorDef>(db, "sensors");
  }
  finally { db.close(); }
}

export function getSensor(id: string): SensorDef | null {
  const db = getDb();
  try { return getOne<SensorDef>(db, "sensors", id); }
  finally { db.close(); }
}

export function saveSensor(sensor: SensorDef, profileId: string = "aspen") {
  const db = getDb();
  try { upsert(db, "sensors", sensor.id, sensor, profileId); }
  finally { db.close(); }
}

export function deleteSensor(id: string): boolean {
  const db = getDb();
  try { return remove(db, "sensors", id); }
  finally { db.close(); }
}

// ─── Control CRUD ────────────────────────────────────────────────────────────

export function listControls(profileId?: string): ControlDef[] {
  const db = getDb();
  try {
    if (profileId) return listByProfile<ControlDef>(db, "controls", profileId);
    return listAll<ControlDef>(db, "controls");
  }
  finally { db.close(); }
}

export function getControl(id: string): ControlDef | null {
  const db = getDb();
  try { return getOne<ControlDef>(db, "controls", id); }
  finally { db.close(); }
}

export function saveControl(control: ControlDef, profileId: string = "aspen") {
  const db = getDb();
  try { upsert(db, "controls", control.id, control, profileId); }
  finally { db.close(); }
}

export function deleteControl(id: string): boolean {
  const db = getDb();
  try { return remove(db, "controls", id); }
  finally { db.close(); }
}

export function updateControl(id: string, control: ControlDef) {
  const db = getDb();
  try {
    // Look up existing profile_id for this control
    const row = db.prepare("SELECT profile_id FROM controls WHERE id = ?").get(id) as { profile_id: string } | undefined;
    const profileId = row?.profile_id ?? "aspen";
    upsert(db, "controls", id, control, profileId);
  } finally { db.close(); }
}

// ─── Pane CRUD ───────────────────────────────────────────────────────────────

export function listPanes(profileId?: string): PaneDef[] {
  const db = getDb();
  try {
    let panes: PaneDef[];
    if (profileId) panes = listByProfile<PaneDef>(db, "panes", profileId);
    else panes = listAll<PaneDef>(db, "panes");
    return panes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  finally { db.close(); }
}

export function getPane(id: string): PaneDef | null {
  const db = getDb();
  try { return getOne<PaneDef>(db, "panes", id); }
  finally { db.close(); }
}

export function savePane(pane: PaneDef, profileId: string = "aspen") {
  const db = getDb();
  try { upsert(db, "panes", pane.id, pane, profileId); }
  finally { db.close(); }
}

export function deletePane(id: string): boolean {
  const db = getDb();
  try { return remove(db, "panes", id); }
  finally { db.close(); }
}

// ─── Camera CRUD ─────────────────────────────────────────────────────────────

export function listCameras(profileId?: string): CameraDef[] {
  const db = getDb();
  try {
    if (profileId) return listByProfile<CameraDef>(db, "cameras", profileId);
    return listAll<CameraDef>(db, "cameras");
  }
  finally { db.close(); }
}

export function getCamera(id: string): CameraDef | null {
  const db = getDb();
  try { return getOne<CameraDef>(db, "cameras", id); }
  finally { db.close(); }
}

export function saveCamera(camera: CameraDef, profileId: string = "aspen") {
  const db = getDb();
  try { upsert(db, "cameras", camera.id, camera, profileId); }
  finally { db.close(); }
}

export function deleteCamera(id: string): boolean {
  const db = getDb();
  try { return remove(db, "cameras", id); }
  finally { db.close(); }
}

// ─── MQTT Config (singleton) ─────────────────────────────────────────────────

const DEFAULT_MQTT: MqttConfig = {
  host: "snekpi",
  port: 9001,
  protocol: "ws",
};

export function getMqttConfig(): MqttConfig {
  const db = getDb();
  try {
    const row = db.prepare("SELECT data FROM mqtt_config WHERE id = 1").get() as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as MqttConfig) : DEFAULT_MQTT;
  }
  finally { db.close(); }
}

export function saveMqttConfig(config: MqttConfig) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO mqtt_config (id, data) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).run(JSON.stringify(config));
  }
  finally { db.close(); }
}

// ─── Location (singleton) ────────────────────────────────────────────────────

export function getLocation(): Location | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT data FROM location WHERE id = 1").get() as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Location) : null;
  }
  finally { db.close(); }
}

export function saveLocation(loc: Location) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO location (id, data) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).run(JSON.stringify(loc));
  }
  finally { db.close(); }
}

// ─── Seed Defaults ───────────────────────────────────────────────────────────

export function seedDefaults() {
  const db = getDb();
  try {
    // Seed profiles if empty
    const profileCount = (db.prepare("SELECT COUNT(*) as c FROM profiles").get() as { c: number }).c;
    if (profileCount === 0) {
      const profiles: EnclosureProfile[] = [
        { id: "aspen", name: "Aspen", type: "reptile", icon: "🐍" },
        { id: "yeshi", name: "Phsh", type: "aquarium", icon: "🐠" },
      ];
      for (const p of profiles) {
        db.prepare("INSERT INTO profiles (id, data) VALUES (?, ?)").run(p.id, JSON.stringify(p));
      }
      // Set default active profile
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('activeProfileId', 'aspen')
         ON CONFLICT(key) DO NOTHING`
      ).run();
    }

    const count = (db.prepare("SELECT COUNT(*) as c FROM sensors").get() as { c: number }).c;
    if (count > 0) return; // Already seeded

    // Default sensors matching existing MQTT topics
    const defaultSensors: SensorDef[] = [
      {
        id: "basking-light-state",
        label: "Basking Light",
        kind: "digital",
        direction: "output",
        mqtt: { topic: "BaskingLight", payloadType: "boolean", trueValue: "true", falseValue: "false" },
        unit: "",
      },
      {
        id: "basking-light-hours",
        label: "Basking Hours",
        kind: "analog",
        direction: "input",
        mqtt: { topic: "BaskingLightHours", payloadType: "raw", trueValue: "true", falseValue: "false" },
        unit: "hrs",
        min: 0,
        max: 24,
      },
    ];

    const defaultControls: ControlDef[] = [
      {
        id: "ctrl-basking-light",
        label: "Basking Light",
        kind: "toggle",
        mqtt: { statusTopic: "BaskingLight", controlTopic: "BaskingLightControl", onValue: "true", offValue: "false" },
        mode: "auto",
        autoStrategy: "schedule",
        hoursSensorId: "basking-light-hours",
      },
    ];

    const defaultPanes: PaneDef[] = [
      { id: "pane-basking-switch", sensorId: "basking-light-state", displayType: "switch", colSpan: 1, colorTheme: "warm", order: 0 },
      { id: "pane-basking-hours", sensorId: "basking-light-hours", displayType: "number", colSpan: 1, colorTheme: "amber", order: 1 },
    ];

    for (const s of defaultSensors) upsert(db, "sensors", s.id, s, "aspen");
    for (const c of defaultControls) upsert(db, "controls", c.id, c, "aspen");
    for (const p of defaultPanes) upsert(db, "panes", p.id, p, "aspen");
  }
  finally { db.close(); }
}

// ─── Care Event CRUD ─────────────────────────────────────────────────────────

export function listCareEvents(month?: string, type?: string, profileId?: string): CareEvent[] {
  const db = getDb();
  try {
    let sql = "SELECT id, profile_id, date, time, type, data, photo_url, created_at FROM care_events WHERE 1=1";
    const params: string[] = [];
    if (profileId) {
      sql += " AND profile_id = ?";
      params.push(profileId);
    }
    if (month) {
      sql += " AND date LIKE ?";
      params.push(`${month}%`);
    }
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    sql += " ORDER BY date DESC, created_at DESC";
    const rows = db.prepare(sql).all(...params) as {
      id: string; profile_id: string; date: string; time: string | null; type: string; data: string; photo_url: string | null; created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      date: r.date,
      time: r.time ?? undefined,
      type: r.type as CareEvent["type"],
      data: JSON.parse(r.data),
      photoUrl: r.photo_url ?? undefined,
      createdAt: r.created_at,
    }));
  }
  finally { db.close(); }
}

export function saveCareEvent(event: CareEvent) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO care_events (id, profile_id, date, time, type, data, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET profile_id = excluded.profile_id, date = excluded.date, time = excluded.time, type = excluded.type, data = excluded.data, photo_url = excluded.photo_url`
    ).run(event.id, event.profileId, event.date, event.time ?? null, event.type, JSON.stringify(event.data), event.photoUrl ?? null, event.createdAt);
  }
  finally { db.close(); }
}

export function deleteCareEvent(id: string): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM care_events WHERE id = ?").run(id);
    return result.changes > 0;
  }
  finally { db.close(); }
}

// ─── Inhabitant CRUD ─────────────────────────────────────────────────────────

export function listInhabitants(profileId: string): Inhabitant[] {
  const db = getDb();
  try {
    return listByProfile<Inhabitant>(db, "inhabitants", profileId);
  }
  finally { db.close(); }
}

export function getInhabitant(id: string): Inhabitant | null {
  const db = getDb();
  try { return getOne<Inhabitant>(db, "inhabitants", id); }
  finally { db.close(); }
}

export function saveInhabitant(inhabitant: Inhabitant) {
  const db = getDb();
  try {
    upsert(db, "inhabitants", inhabitant.id, inhabitant, inhabitant.profileId);
  }
  finally { db.close(); }
}

export function deleteInhabitant(id: string): boolean {
  const db = getDb();
  try { return remove(db, "inhabitants", id); }
  finally { db.close(); }
}

// ─── Sensor Readings (Time-Series) ──────────────────────────────────────────

export function logReading(sensorId: string, value: number) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO sensor_readings (sensor_id, value, ts) VALUES (?, ?, ?)`
    ).run(sensorId, value, Date.now());
  } finally { db.close(); }
}

export interface ReadingPoint {
  value: number;
  ts: number;
}

/**
 * Get sensor readings for a time range.
 * maxPoints controls downsampling — if more rows exist, we bucket-average.
 */
export function getReadings(
  sensorId: string,
  sinceMs: number,
  maxPoints = 200,
): ReadingPoint[] {
  const db = getDb();
  try {
    // Get raw count first
    const countRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM sensor_readings WHERE sensor_id = ? AND ts >= ?`
    ).get(sensorId, sinceMs) as { cnt: number };

    if (countRow.cnt <= maxPoints) {
      // Return all points
      return db.prepare(
        `SELECT value, ts FROM sensor_readings WHERE sensor_id = ? AND ts >= ? ORDER BY ts ASC`
      ).all(sensorId, sinceMs) as ReadingPoint[];
    }

    // Downsample: bucket into maxPoints intervals
    const bucketSize = Math.ceil(countRow.cnt / maxPoints);
    const rows = db.prepare(
      `SELECT AVG(value) as value, MIN(ts) as ts
       FROM (
         SELECT value, ts, (ROW_NUMBER() OVER (ORDER BY ts ASC) - 1) / ? as bucket
         FROM sensor_readings
         WHERE sensor_id = ? AND ts >= ?
       ) GROUP BY bucket ORDER BY ts ASC`
    ).all(bucketSize, sensorId, sinceMs) as ReadingPoint[];
    return rows;
  } finally { db.close(); }
}

/** Get the last reading for a sensor before the given timestamp */
export function getLastReadingBefore(
  sensorId: string,
  beforeMs: number,
): ReadingPoint | null {
  const db = getDb();
  try {
    const row = db.prepare(
      `SELECT value, ts FROM sensor_readings WHERE sensor_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1`
    ).get(sensorId, beforeMs) as ReadingPoint | undefined;
    return row ?? null;
  } finally { db.close(); }
}

/** Prune readings older than retentionMs (default 7 days) */
export function pruneOldReadings(retentionMs = 7 * 24 * 60 * 60 * 1000) {
  const db = getDb();
  try {
    const cutoff = Date.now() - retentionMs;
    db.prepare(`DELETE FROM sensor_readings WHERE ts < ?`).run(cutoff);
  } finally { db.close(); }
}

// ─── Control Timer Persistence ─────────────────────────────────────────────

export interface PersistedTimer { since: number; totalHours: number; }

/** Load all persisted control timers from DB */
export function loadControlTimers(): Map<string, PersistedTimer> {
  const db = getDb();
  try {
    const rows = db.prepare(`SELECT control_id, since, total_hours FROM control_timers`).all() as { control_id: string; since: number; total_hours: number }[];
    const m = new Map<string, PersistedTimer>();
    for (const r of rows) m.set(r.control_id, { since: r.since, totalHours: r.total_hours });
    return m;
  } finally { db.close(); }
}

/** Save/update a single control timer */
export function saveControlTimer(controlId: string, since: number, totalHours: number) {
  const db = getDb();
  try {
    db.prepare(`INSERT OR REPLACE INTO control_timers (control_id, since, total_hours) VALUES (?, ?, ?)`).run(controlId, since, totalHours);
  } finally { db.close(); }
}

// ─── Control State Logging (uses sensor_readings as time-series store) ────────

/** Log a control state change — only writes if state actually changed from last reading */
export function logControlStateChange(controlId: string, isOn: boolean) {
  const db = getDb();
  try {
    const last = db.prepare(
      `SELECT value FROM sensor_readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1`
    ).get(controlId) as { value: number } | undefined;

    const newVal = isOn ? 1 : 0;
    if (!last || last.value !== newVal) {
      db.prepare(
        `INSERT INTO sensor_readings (sensor_id, value, ts) VALUES (?, ?, ?)`
      ).run(controlId, newVal, Date.now());
    }
  } finally { db.close(); }
}

// ─── Climate Data Cache ─────────────────────────────────────────────────────

const CLIMATE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function climateCacheId(lat: number, lng: number): string {
  return `${lat.toFixed(1)}:${lng.toFixed(1)}`;
}

export function getClimateCache(lat: number, lng: number, force = false): ClimateDataCache | null {
  const db = getDb();
  try {
    const id = climateCacheId(lat, lng);
    const row = db.prepare(
      `SELECT data, fetched_at FROM climate_cache WHERE id = ?`
    ).get(id) as { data: string; fetched_at: string } | undefined;
    if (!row) return null;
    // Check staleness (unless forced)
    if (!force) {
      const fetchedAt = new Date(row.fetched_at).getTime();
      if (Date.now() - fetchedAt > CLIMATE_CACHE_MAX_AGE_MS) return null;
    }
    return JSON.parse(row.data) as ClimateDataCache;
  } finally { db.close(); }
}

export function saveClimateCache(lat: number, lng: number, data: ClimateDataCache): void {
  const db = getDb();
  try {
    const id = climateCacheId(lat, lng);
    db.prepare(
      `INSERT OR REPLACE INTO climate_cache (id, habitat_lat, habitat_lng, fetched_at, data) VALUES (?, ?, ?, ?, ?)`
    ).run(id, lat, lng, new Date().toISOString(), JSON.stringify(data));
  } finally { db.close(); }
}
