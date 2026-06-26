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
    CREATE TABLE IF NOT EXISTS sensor_rollups (
      sensor_id TEXT NOT NULL,
      bucket INTEGER NOT NULL,
      avg_value REAL NOT NULL,
      min_value REAL NOT NULL,
      max_value REAL NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (sensor_id, bucket)
    );
    CREATE INDEX IF NOT EXISTS idx_rollups_sensor_bucket ON sensor_rollups(sensor_id, bucket);
    CREATE TABLE IF NOT EXISTS motion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      motion INTEGER NOT NULL,
      snapshot_path TEXT,
      UNIQUE(camera_id, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_motion_camera_ts ON motion_events(camera_id, ts);
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
  host: "localhost",
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
    return rows.map((r) => {
      // photo_url stores either a JSON array (multi-photo) or a legacy single URL string
      let photoUrls: string[] | undefined;
      if (r.photo_url) {
        if (r.photo_url.startsWith("[")) {
          try { photoUrls = JSON.parse(r.photo_url); } catch { photoUrls = [r.photo_url]; }
        } else {
          photoUrls = [r.photo_url]; // legacy single-photo backfill
        }
      }
      return {
        id: r.id,
        profileId: r.profile_id,
        date: r.date,
        time: r.time ?? undefined,
        type: r.type as CareEvent["type"],
        data: JSON.parse(r.data),
        photoUrls: photoUrls?.length ? photoUrls : undefined,
        // Keep deprecated photoUrl populated for any consumers still using it
        photoUrl: photoUrls?.[0],
        createdAt: r.created_at,
      };
    });
  }
  finally { db.close(); }
}

export function saveCareEvent(event: CareEvent) {
  const db = getDb();
  try {
    // Serialize photoUrls as JSON array into photo_url column
    const urls = event.photoUrls?.length ? event.photoUrls
      : event.photoUrl ? [event.photoUrl]
      : null;
    const photoUrlJson = urls ? JSON.stringify(urls) : null;
    db.prepare(
      `INSERT INTO care_events (id, profile_id, date, time, type, data, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET profile_id = excluded.profile_id, date = excluded.date, time = excluded.time, type = excluded.type, data = excluded.data, photo_url = excluded.photo_url`
    ).run(event.id, event.profileId, event.date, event.time ?? null, event.type, JSON.stringify(event.data), photoUrlJson, event.createdAt);
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

/** Get a single care event by ID */
export function getCareEvent(id: string): CareEvent | null {
  const db = getDb();
  try {
    const r = db.prepare(
      "SELECT id, profile_id, date, time, type, data, photo_url, created_at FROM care_events WHERE id = ?"
    ).get(id) as { id: string; profile_id: string; date: string; time: string | null; type: string; data: string; photo_url: string | null; created_at: string } | undefined;
    if (!r) return null;
    let photoUrls: string[] | undefined;
    if (r.photo_url) {
      if (r.photo_url.startsWith("[")) {
        try { photoUrls = JSON.parse(r.photo_url); } catch { photoUrls = [r.photo_url]; }
      } else {
        photoUrls = [r.photo_url];
      }
    }
    return {
      id: r.id,
      profileId: r.profile_id,
      date: r.date,
      time: r.time ?? undefined,
      type: r.type as CareEvent["type"],
      data: JSON.parse(r.data),
      photoUrls: photoUrls?.length ? photoUrls : undefined,
      photoUrl: photoUrls?.[0],
      createdAt: r.created_at,
    };
  }
  finally { db.close(); }
}

/** Get the most recent feeding event for a profile (for observation auto-linking) */
export function getLastFeedingEvent(profileId: string): CareEvent | null {
  const db = getDb();
  try {
    const r = db.prepare(
      `SELECT id, profile_id, date, time, type, data, photo_url, created_at
       FROM care_events WHERE profile_id = ? AND type = 'feeding'
       ORDER BY date DESC, time DESC, created_at DESC LIMIT 1`
    ).get(profileId) as { id: string; profile_id: string; date: string; time: string | null; type: string; data: string; photo_url: string | null; created_at: string } | undefined;
    if (!r) return null;
    return {
      id: r.id,
      profileId: r.profile_id,
      date: r.date,
      time: r.time ?? undefined,
      type: r.type as CareEvent["type"],
      data: JSON.parse(r.data),
      photoUrl: undefined,
      createdAt: r.created_at,
    };
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

/** In-memory write throttle — only persist one reading per minute per sensor */
const lastWriteTs = new Map<string, number>();
const WRITE_THROTTLE_MS = 60_000; // 1 minute

export function logReading(sensorId: string, value: number) {
  const now = Date.now();
  const last = lastWriteTs.get(sensorId) ?? 0;
  if (now - last < WRITE_THROTTLE_MS) return; // skip — too soon
  lastWriteTs.set(sensorId, now);
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO sensor_readings (sensor_id, value, ts) VALUES (?, ?, ?)`
    ).run(sensorId, value, now);
  } finally { db.close(); }
}

export interface ReadingPoint {
  value: number;
  ts: number;
}

/**
 * Get sensor readings for a time range.
 * maxPoints controls downsampling — if more rows exist, we time-bucket average.
 * Uses integer division on timestamp for O(n) single-pass grouping (no window functions).
 */
export function getReadings(
  sensorId: string,
  sinceMs: number,
  maxPoints = 200,
): ReadingPoint[] {
  const db = getDb();
  try {
    const now = Date.now();
    const rangeMs = now - sinceMs;
    const bucketMs = Math.ceil(rangeMs / maxPoints);

    // Single query — time-bucket GROUP BY avoids ROW_NUMBER() window function
    const rows = db.prepare(
      `SELECT AVG(value) as value, MIN(ts) as ts
       FROM sensor_readings
       WHERE sensor_id = ? AND ts >= ?
       GROUP BY (ts / ?)
       ORDER BY ts ASC`
    ).all(sensorId, sinceMs, bucketMs) as ReadingPoint[];
    return rows;
  } finally { db.close(); }
}

/**
 * Get readings from the rollup table for longer time ranges (>6h).
 * Falls back to raw readings if rollups don't exist yet.
 */
export function getReadingsFromRollups(
  sensorId: string,
  sinceMs: number,
  maxPoints = 200,
): ReadingPoint[] {
  const db = getDb();
  try {
    // Check if rollups exist for this sensor in the time range
    const rollupCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM sensor_rollups WHERE sensor_id = ? AND bucket >= ?`
    ).get(sensorId, sinceMs) as { cnt: number }).cnt;

    if (rollupCount === 0) {
      // No rollups yet — fall back to raw readings
      db.close();
      return getReadings(sensorId, sinceMs, maxPoints);
    }

    const rangeMs = Date.now() - sinceMs;
    const bucketMs = Math.ceil(rangeMs / maxPoints);
    const ROLLUP_INTERVAL = 300_000; // 5 minutes

    if (bucketMs <= ROLLUP_INTERVAL) {
      // Rollup granularity is sufficient — return directly
      return db.prepare(
        `SELECT avg_value as value, bucket as ts
         FROM sensor_rollups
         WHERE sensor_id = ? AND bucket >= ?
         ORDER BY bucket ASC`
      ).all(sensorId, sinceMs) as ReadingPoint[];
    }

    // Re-bucket rollups into coarser intervals
    return db.prepare(
      `SELECT AVG(avg_value) as value, MIN(bucket) as ts
       FROM sensor_rollups
       WHERE sensor_id = ? AND bucket >= ?
       GROUP BY (bucket / ?)
       ORDER BY ts ASC`
    ).all(sensorId, sinceMs, bucketMs) as ReadingPoint[];
  } finally { db.close(); }
}

/**
 * Batch-fetch readings for multiple sensor/control IDs in a single DB session.
 * Returns Map<id, ReadingPoint[]>.
 */
export function getMultiReadings(
  ids: string[],
  sinceMs: number,
  maxPoints = 200,
  _useRollups = false, // kept for API compat but now always merges both
): Map<string, ReadingPoint[]> {
  const result = new Map<string, ReadingPoint[]>();
  if (ids.length === 0) return result;

  // Use a single DB connection for all queries
  const db = getDb();
  try {
    const now = Date.now();
    const rangeMs = now - sinceMs;
    const bucketMs = Math.ceil(rangeMs / maxPoints);

    // Always merge raw + rollup tables via UNION ALL.
    // After compaction, recent data is in raw and older data is in rollups.
    // Querying only one table causes gaps.
    const stmt = db.prepare(
      `SELECT AVG(value) as value, MIN(ts) as ts FROM (
         SELECT value, ts FROM sensor_readings
           WHERE sensor_id = ? AND ts >= ?
         UNION ALL
         SELECT avg_value as value, bucket as ts FROM sensor_rollups
           WHERE sensor_id = ? AND bucket >= ?
       ) combined
       GROUP BY (ts / ?)
       ORDER BY ts ASC`
    );

    for (const id of ids) {
      const rows = stmt.all(id, sinceMs, id, sinceMs, bucketMs) as ReadingPoint[];
      result.set(id, rows);
    }
  } finally { db.close(); }
  return result;
}

/**
 * Get the last reading for each control before a timestamp.
 * Used by batch API to prepend synthetic ON points for control bands.
 */
export function getMultiLastReadingBefore(
  ids: string[],
  beforeMs: number,
): Map<string, ReadingPoint> {
  const result = new Map<string, ReadingPoint>();
  if (ids.length === 0) return result;
  const db = getDb();
  try {
    const stmt = db.prepare(
      `SELECT value, ts FROM sensor_readings WHERE sensor_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1`
    );
    for (const id of ids) {
      const row = stmt.get(id, beforeMs) as ReadingPoint | undefined;
      if (row) result.set(id, row);
    }
  } finally { db.close(); }
  return result;
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

// ─── Motion Events ──────────────────────────────────────────────────────────

export interface MotionEvent {
  camera_id: string;
  ts: number;
  motion: number; // 1=start, 0=end
  snapshot_path: string | null;
}

/** Log a motion start/end event, optionally with a snapshot path */
export function logMotionEvent(cameraId: string, motion: boolean, snapshotPath?: string): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT OR IGNORE INTO motion_events (camera_id, ts, motion, snapshot_path) VALUES (?, ?, ?, ?)`
    ).run(cameraId, Date.now(), motion ? 1 : 0, snapshotPath ?? null);
  } finally { db.close(); }
}

/** Get motion events for a camera within a time range */
export function getMotionEvents(cameraId: string, sinceMs: number): MotionEvent[] {
  const db = getDb();
  try {
    return db.prepare(
      `SELECT camera_id, ts, motion, snapshot_path FROM motion_events
       WHERE camera_id = ? AND ts >= ?
       ORDER BY ts ASC`
    ).all(cameraId, sinceMs) as MotionEvent[];
  } finally { db.close(); }
}

/** Get the last motion event before a given timestamp (for state-before-range) */
export function getMotionBefore(cameraId: string, beforeMs: number): MotionEvent | null {
  const db = getDb();
  try {
    return (db.prepare(
      `SELECT camera_id, ts, motion, snapshot_path FROM motion_events
       WHERE camera_id = ? AND ts < ?
       ORDER BY ts DESC LIMIT 1`
    ).get(cameraId, beforeMs) as MotionEvent | undefined) ?? null;
  } finally { db.close(); }
}

/** Prune motion events older than retention period + delete snapshot files */
export function pruneMotionEvents(retentionMs = 7 * 24 * 60 * 60 * 1000): number {
  const db = getDb();
  try {
    const cutoff = Date.now() - retentionMs;
    // Get snapshot paths before deleting rows
    const oldEvents = db.prepare(
      `SELECT snapshot_path FROM motion_events WHERE ts < ? AND snapshot_path IS NOT NULL`
    ).all(cutoff) as { snapshot_path: string }[];

    // Delete old snapshot files
    const SNAPSHOT_BASE = process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "..", "enclosure-data", "motion-snapshots")
      : path.join(process.cwd(), "public", "motion-snapshots");
    for (const { snapshot_path } of oldEvents) {
      try {
        const fullPath = path.join(SNAPSHOT_BASE, snapshot_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch { /* best effort */ }
    }

    // Delete rows
    const result = db.prepare(`DELETE FROM motion_events WHERE ts < ?`).run(cutoff);
    return result.changes;
  } finally { db.close(); }
}

// ─── Rollup Compaction ──────────────────────────────────────────────────────

const ROLLUP_INTERVAL_MS = 300_000; // 5-minute buckets
const COMPACT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // compact data older than 2 hours

/**
 * Compact raw sensor_readings older than 2 hours into 5-minute rollup buckets.
 * After aggregation, the compacted raw rows are deleted to save space.
 * Safe to call repeatedly — uses INSERT OR REPLACE for idempotency.
 */
export function compactReadings() {
  const db = getDb();
  try {
    const cutoff = Date.now() - COMPACT_THRESHOLD_MS;

    // Aggregate raw readings into rollup buckets
    db.prepare(
      `INSERT OR REPLACE INTO sensor_rollups (sensor_id, bucket, avg_value, min_value, max_value, count)
       SELECT
         sensor_id,
         (ts / ${ROLLUP_INTERVAL_MS}) * ${ROLLUP_INTERVAL_MS} as bucket,
         AVG(value),
         MIN(value),
         MAX(value),
         COUNT(*)
       FROM sensor_readings
       WHERE ts < ?
       GROUP BY sensor_id, bucket`
    ).run(cutoff);

    // Delete the compacted raw rows
    db.prepare(`DELETE FROM sensor_readings WHERE ts < ?`).run(cutoff);

    console.log(`[db] compacted readings older than ${new Date(cutoff).toISOString()}`);
  } finally { db.close(); }
}

// ─── Daily Extremes (for care log) ──────────────────────────────────────────

export interface DailyExtreme {
  date: string; // YYYY-MM-DD
  sensorId: string;
  high: number;
  low: number;
  avg: number;
  count: number;
}

/**
 * Get daily high/low/avg for sensors over a date range.
 * Combines raw readings + rollup data for full coverage.
 * Used by the care calendar to show temperature conditions.
 */
export function getDailyExtremes(
  sensorIds: string[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): DailyExtreme[] {
  if (sensorIds.length === 0) return [];
  const db = getDb();
  try {
    const startMs = new Date(startDate + "T00:00:00").getTime();
    const endMs = new Date(endDate + "T23:59:59.999").getTime();
    const results: DailyExtreme[] = [];

    // Query rollups (filter out glitch 0°C readings from min aggregation)
    const rollupStmt = db.prepare(
      `SELECT
         sensor_id,
         date(bucket / 1000, 'unixepoch', 'localtime') as day,
         AVG(avg_value) as avg_val,
         MIN(CASE WHEN min_value > 1 THEN min_value END) as min_val,
         MAX(max_value) as max_val,
         SUM(count) as total_count
       FROM sensor_rollups
       WHERE sensor_id = ? AND bucket >= ? AND bucket <= ? AND avg_value > 1
       GROUP BY sensor_id, day
       ORDER BY day ASC`
    );

    // Query raw readings (for recent data not yet compacted, filter glitch 0s)
    const rawStmt = db.prepare(
      `SELECT
         sensor_id,
         date(ts / 1000, 'unixepoch', 'localtime') as day,
         AVG(value) as avg_val,
         MIN(CASE WHEN value > 1 THEN value END) as min_val,
         MAX(value) as max_val,
         COUNT(*) as total_count
       FROM sensor_readings
       WHERE sensor_id = ? AND ts >= ? AND ts <= ? AND value > 1
       GROUP BY sensor_id, day
       ORDER BY day ASC`
    );

    for (const sensorId of sensorIds) {
      // Merge rollup + raw data per day
      const dayMap = new Map<string, { sum: number; min: number; max: number; count: number }>();

      const rollupRows = rollupStmt.all(sensorId, startMs, endMs) as {
        sensor_id: string; day: string; avg_val: number; min_val: number; max_val: number; total_count: number;
      }[];
      for (const r of rollupRows) {
        dayMap.set(r.day, {
          sum: r.avg_val * r.total_count,
          min: r.min_val,
          max: r.max_val,
          count: r.total_count,
        });
      }

      const rawRows = rawStmt.all(sensorId, startMs, endMs) as {
        sensor_id: string; day: string; avg_val: number; min_val: number; max_val: number; total_count: number;
      }[];
      for (const r of rawRows) {
        const existing = dayMap.get(r.day);
        if (existing) {
          existing.sum += r.avg_val * r.total_count;
          existing.min = Math.min(existing.min, r.min_val);
          existing.max = Math.max(existing.max, r.max_val);
          existing.count += r.total_count;
        } else {
          dayMap.set(r.day, {
            sum: r.avg_val * r.total_count,
            min: r.min_val,
            max: r.max_val,
            count: r.total_count,
          });
        }
      }

      for (const [day, data] of dayMap) {
        results.push({
          date: day,
          sensorId,
          high: Math.round(data.max * 10) / 10,
          low: Math.round(data.min * 10) / 10,
          avg: Math.round((data.sum / data.count) * 10) / 10,
          count: data.count,
        });
      }
    }

    return results.sort((a, b) => a.date.localeCompare(b.date) || a.sensorId.localeCompare(b.sensorId));
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
