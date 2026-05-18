"use client";

/**
 * Settings Page — Hub for sensor, pane, control, and MQTT configuration.
 *
 * Sub-sections: Sensors, Dashboard Panes, MQTT Broker.
 * Each section has a list view with add/edit/delete actions.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/store/use-dashboard-store";
import { useProfileStore } from "@/store/use-profile-store";
import { ProfileSwitcher } from "@/components/blocks/profile-switcher";
import { SensorEditor } from "@/components/blocks/sensor-editor";
import { PaneEditor } from "@/components/blocks/pane-editor";
import { MqttSettings } from "@/components/blocks/mqtt-settings";
import { ControlEditor } from "@/components/blocks/control-editor";
import { CameraEditor } from "@/components/blocks/camera-editor";
import { ZoneEditor } from "@/components/blocks/zone-editor";
import { DISPLAY_TYPE_ICONS } from "@/components/blocks/widget-registry";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Radio, LayoutGrid, Wifi, Camera, FileText,
  ChevronRight, ChevronUp, ChevronDown, Thermometer, ToggleLeft, Zap, MapPin,
} from "lucide-react";
import type { SensorDef, PaneDef, ControlDef, Location, CameraDef } from "@/lib/schema";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

type Section = "sensors" | "panes" | "controls" | "cameras" | "mqtt" | "location";

export default function ConfigPage() {
  const store = useDashboardStore();
  const { sensors, controls, panes, cameras, mqttConfig, fetchAll, isLoaded } = store;
  const { activeProfileId } = useProfileStore();

  const [activeSection, setActiveSection] = useState<Section>("sensors");
  const [sensorEditorOpen, setSensorEditorOpen] = useState(false);
  const [editingSensor, setEditingSensor] = useState<SensorDef | null>(null);
  const [paneEditorOpen, setPaneEditorOpen] = useState(false);
  const [editingPane, setEditingPane] = useState<PaneDef | null>(null);
  const [controlEditorOpen, setControlEditorOpen] = useState(false);
  const [editingControl, setEditingControl] = useState<ControlDef | null>(null);
  const [cameraEditorOpen, setCameraEditorOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraDef | null>(null);
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [zoneEditCamera, setZoneEditCamera] = useState<CameraDef | null>(null);
  const [location, setLocation] = useState<Location>({ latitude: 0, longitude: 0, label: "" });
  const [locationSaved, setLocationSaved] = useState(false);

  useEffect(() => { fetchAll(activeProfileId); }, [fetchAll, activeProfileId]);

  // Fetch location on mount
  useEffect(() => {
    fetch("/api/location").then((r) => r.json()).then(setLocation).catch(() => {});
  }, []);

  // ── Sensor Actions ──────────────────────────────────────────
  const handleSaveSensor = useCallback(async (sensor: SensorDef) => {
    if (editingSensor) {
      await store.updateSensor(sensor.id, sensor);
    } else {
      await store.addSensor(sensor);
    }
    setEditingSensor(null);
  }, [editingSensor, store]);

  const handleDeleteSensor = useCallback(async (id: string) => {
    await store.removeSensor(id);
  }, [store]);

  // ── Pane Actions ────────────────────────────────────────────
  const handleSavePane = useCallback(async (pane: PaneDef) => {
    if (editingPane) {
      await store.updatePane(pane.id, pane);
    } else {
      await store.addPane(pane);
    }
    setEditingPane(null);
  }, [editingPane, store]);

  const handleDeletePane = useCallback(async (id: string) => {
    await store.removePane(id);
  }, [store]);

  // ── Camera Actions ──────────────────────────────────────────
  const handleSaveCamera = useCallback(async (camera: CameraDef) => {
    if (editingCamera) {
      await store.updateCamera(camera.id, camera);
    } else {
      await store.addCamera(camera);
    }
    setEditingCamera(null);
  }, [editingCamera, store]);

  const handleDeleteCamera = useCallback(async (id: string) => {
    await store.removeCamera(id);
  }, [store]);

  const handleSaveZones = useCallback(async (zones: import("@/lib/schema").ZoneDef[]) => {
    if (!zoneEditCamera) return;
    const updated = { ...zoneEditCamera, zones };
    await store.updateCamera(zoneEditCamera.id, updated);
    setZoneEditCamera(null);
  }, [zoneEditCamera, store]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-white/15 animate-pulse text-sm font-light">Loading…</div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 pt-5">
      <motion.div variants={item} className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none">Settings</h1>
          <ProfileSwitcher />
        </div>
      </motion.div>

      {/* ── Section Tabs ───────────────────────────────────────── */}
      <motion.div variants={item} className="flex gap-1.5 p-1 rounded-2xl bg-white/[0.03]">
        {([
          { key: "sensors" as Section, icon: Radio, label: "Sensors" },
          { key: "panes" as Section, icon: LayoutGrid, label: "Panes" },
          { key: "controls" as Section, icon: Zap, label: "Controls" },
          { key: "cameras" as Section, icon: Camera, label: "Cameras" },
          { key: "mqtt" as Section, icon: Wifi, label: "MQTT" },
          { key: "location" as Section, icon: MapPin, label: "Location" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-semibold transition-all",
              activeSection === key
                ? "bg-white/[0.08] text-white/70 shadow-sm"
                : "text-white/20 hover:text-white/35"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </motion.div>

      {/* ── Sensors Section ────────────────────────────────────── */}
      {activeSection === "sensors" && (
        <motion.div variants={container} className="space-y-3">
          {sensors.map((s) => (
            <motion.div key={s.id} variants={item}
              className="glass rounded-[20px] p-4 flex items-center justify-between touch-card"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
                  {s.kind === "digital" ? (
                    <ToggleLeft className="w-4 h-4 text-white/25" />
                  ) : (
                    <Thermometer className="w-4 h-4 text-white/25" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white/60 truncate">{s.label}</p>
                  <p className="text-[9px] text-white/20 font-medium truncate">
                    {s.mqtt.topic} · {s.mqtt.payloadType} · {s.unit || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => { setEditingSensor(s); setSensorEditorOpen(true); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                  <Pencil className="w-3 h-3 text-white/25" />
                </button>
                <button onClick={() => handleDeleteSensor(s.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-3 h-3 text-white/25" />
                </button>
              </div>
            </motion.div>
          ))}

          {/* Add Sensor Button */}
          <motion.button
            variants={item}
            onClick={() => { setEditingSensor(null); setSensorEditorOpen(true); }}
            className="w-full glass rounded-[20px] p-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-white/25 hover:text-white/40 hover:bg-white/[0.04] transition-all touch-card"
          >
            <Plus className="w-4 h-4" />
            Add Sensor
          </motion.button>
        </motion.div>
      )}

      {/* ── Panes Section ──────────────────────────────────────── */}
      {activeSection === "panes" && (
        <motion.div variants={container} className="space-y-3">
          {panes.map((p, idx) => {
            const sensor = sensors.find((s) => s.id === p.sensorId);
            const ctrl = p.controlId ? controls.find((c) => c.id === p.controlId) : undefined;
            const Icon = DISPLAY_TYPE_ICONS[p.displayType];
            const sourceLabel = p.controlId ? `control: ${ctrl?.label ?? p.controlId}` : `sensor: ${sensor?.label ?? p.sensorId}`;
            return (
              <motion.div key={p.id} variants={item}
                className="glass rounded-[20px] p-4 flex items-center justify-between touch-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-white/25" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/60 truncate">
                      {p.labelOverride || ctrl?.label || sensor?.label || p.sensorId || p.controlId}
                    </p>
                    <p className="text-[9px] text-white/20 font-medium">
                      {p.displayType} · {p.colSpan === 2 ? "full" : "half"} · {sourceLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 mr-1">
                    <button
                      onClick={async () => {
                        if (idx === 0) return;
                        const prev = panes[idx - 1];
                        const curOrder = p.order ?? idx;
                        const prevOrder = prev.order ?? (idx - 1);
                        await store.updatePane(p.id, { ...p, order: prevOrder });
                        await store.updatePane(prev.id, { ...prev, order: curOrder });
                        await fetchAll();
                      }}
                      disabled={idx === 0}
                      className={cn(
                        "w-6 h-5 rounded flex items-center justify-center transition-colors",
                        idx === 0 ? "opacity-10" : "bg-white/[0.04] hover:bg-white/[0.08]"
                      )}
                    >
                      <ChevronUp className="w-3 h-3 text-white/30" />
                    </button>
                    <button
                      onClick={async () => {
                        if (idx === panes.length - 1) return;
                        const next = panes[idx + 1];
                        const curOrder = p.order ?? idx;
                        const nextOrder = next.order ?? (idx + 1);
                        await store.updatePane(p.id, { ...p, order: nextOrder });
                        await store.updatePane(next.id, { ...next, order: curOrder });
                        await fetchAll();
                      }}
                      disabled={idx === panes.length - 1}
                      className={cn(
                        "w-6 h-5 rounded flex items-center justify-center transition-colors",
                        idx === panes.length - 1 ? "opacity-10" : "bg-white/[0.04] hover:bg-white/[0.08]"
                      )}
                    >
                      <ChevronDown className="w-3 h-3 text-white/30" />
                    </button>
                  </div>
                  <button onClick={() => { setEditingPane(p); setPaneEditorOpen(true); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                    <Pencil className="w-3 h-3 text-white/25" />
                  </button>
                  <button onClick={() => handleDeletePane(p.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3 h-3 text-white/25" />
                  </button>
                </div>
              </motion.div>
            );
          })}

          {/* Add Pane Button */}
          <motion.button
            variants={item}
            onClick={() => { setEditingPane(null); setPaneEditorOpen(true); }}
            disabled={sensors.length === 0}
            className={cn(
              "w-full glass rounded-[20px] p-4 flex items-center justify-center gap-2 text-[11px] font-semibold transition-all touch-card",
              sensors.length === 0
                ? "text-white/10 cursor-not-allowed"
                : "text-white/25 hover:text-white/40 hover:bg-white/[0.04]"
            )}
          >
            <Plus className="w-4 h-4" />
            {sensors.length === 0 ? "Add sensors first" : "Add Pane"}
          </motion.button>
        </motion.div>
      )}

      {/* ── MQTT Section ───────────────────────────────────────── */}
      {activeSection === "mqtt" && (
        <motion.div variants={item}>
          <MqttSettings config={mqttConfig} onSave={store.updateMqttConfig} />
        </motion.div>
      )}

      {/* ── Controls Section ────────────────────────────────────── */}
      {activeSection === "controls" && (
        <motion.div variants={container} className="space-y-3">
          {controls.map((c) => (
            <motion.div key={c.id} variants={item}
              className="glass rounded-[20px] p-4 flex items-center justify-between touch-card"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-white/25" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white/60 truncate">{c.label}</p>
                  <p className="text-[9px] text-white/20 font-medium truncate">
                    {c.mode} · {c.schedule?.type ?? "no schedule"} · {c.mqtt.controlTopic}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => { setEditingControl(c); setControlEditorOpen(true); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                  <Pencil className="w-3 h-3 text-white/25" />
                </button>
                <button onClick={() => store.removeControl(c.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-3 h-3 text-white/25" />
                </button>
              </div>
            </motion.div>
          ))}
          <motion.button
            variants={item}
            onClick={() => { setEditingControl(null); setControlEditorOpen(true); }}
            className="w-full glass rounded-[20px] p-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-white/25 hover:text-white/40 hover:bg-white/[0.04] transition-all touch-card"
          >
            <Plus className="w-4 h-4" />
            Add Control
          </motion.button>
        </motion.div>
      )}

      {/* ── Cameras Section ──────────────────────────────────────── */}
      {activeSection === "cameras" && (
        <motion.div variants={container} className="space-y-3">
          {cameras.map((c) => (
            <motion.div key={c.id} variants={item}
              className="glass rounded-[20px] p-4 space-y-3 touch-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4 text-white/25" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/60 truncate">{c.label}</p>
                    <p className="text-[9px] text-white/20 font-medium truncate">
                      {c.protocol.toUpperCase()} · {c.detectionFps} FPS · {c.zones.length} zones
                      {!c.enabled && " · paused"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setZoneEditCamera(c);
                      setZoneEditorOpen(true);
                    }}
                    className="px-2 h-7 rounded-lg flex items-center justify-center gap-1 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                  >
                    <MapPin className="w-3 h-3 text-white/25" />
                    <span className="text-[8px] font-semibold text-white/25">Zones</span>
                  </button>
                  <button onClick={() => { setEditingCamera(c); setCameraEditorOpen(true); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                    <Pencil className="w-3 h-3 text-white/25" />
                  </button>
                  <button onClick={() => handleDeleteCamera(c.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3 h-3 text-white/25" />
                  </button>
                </div>
              </div>

              {/* Zone chips */}
              {c.zones.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03]">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                      <span className="text-[8px] text-white/30 font-medium">{z.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}

          {/* Add Camera Button */}
          <motion.button
            variants={item}
            onClick={() => { setEditingCamera(null); setCameraEditorOpen(true); }}
            className="w-full glass rounded-[20px] p-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-white/25 hover:text-white/40 hover:bg-white/[0.04] transition-all touch-card"
          >
            <Plus className="w-4 h-4" />
            Add Camera
          </motion.button>
        </motion.div>
      )}

      {/* ── Location Section ────────────────────────────────────── */}
      {activeSection === "location" && (
        <motion.div variants={item} className="glass rounded-[20px] p-5 space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-white/60">Location</p>
            <p className="text-[9px] text-white/20 mt-0.5">Used for solar schedule calculations (sunrise/sunset)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Latitude</label>
              <input type="number" step="0.0001" min={-90} max={90}
                value={location.latitude || ""}
                onChange={(e) => setLocation({ ...location, latitude: parseFloat(e.target.value) || 0 })}
                placeholder="37.7749"
                className="input-field" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Longitude</label>
              <input type="number" step="0.0001" min={-180} max={180}
                value={location.longitude || ""}
                onChange={(e) => setLocation({ ...location, longitude: parseFloat(e.target.value) || 0 })}
                placeholder="-122.4194"
                className="input-field" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Label (optional)</label>
            <input value={location.label ?? ""}
              onChange={(e) => setLocation({ ...location, label: e.target.value })}
              placeholder="San Francisco" className="input-field" />
          </div>

          {/* ── Habitat Reference Location ── */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] font-semibold text-white/50">Habitat Reference Location</p>
            <p className="text-[8px] text-white/20 mt-0.5 mb-3">
              Animal&apos;s native range — drives climate data for Natural Cycle PID scheduling
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Habitat Lat</label>
                <input type="number" step="0.0001" min={-90} max={90}
                  value={location.habitatLatitude ?? ""}
                  onChange={(e) => setLocation({ ...location, habitatLatitude: parseFloat(e.target.value) || undefined })}
                  placeholder="39.0"
                  className="input-field" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Habitat Lng</label>
                <input type="number" step="0.0001" min={-180} max={180}
                  value={location.habitatLongitude ?? ""}
                  onChange={(e) => setLocation({ ...location, habitatLongitude: parseFloat(e.target.value) || undefined })}
                  placeholder="-98.0"
                  className="input-field" />
              </div>
            </div>
            <div className="space-y-1.5 mt-2">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Habitat Label</label>
              <input value={location.habitatLabel ?? ""}
                onChange={(e) => setLocation({ ...location, habitatLabel: e.target.value })}
                placeholder="Kansas Grasslands (Western Hognose)" className="input-field" />
            </div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/location", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(location),
              });
              setLocationSaved(true);
              setTimeout(() => setLocationSaved(false), 2000);
            }}
            className="w-full py-3 rounded-2xl bg-emerald-500/20 text-emerald-400 font-semibold text-[12px] hover:bg-emerald-500/30 transition-all"
          >
            {locationSaved ? "✓ Saved" : "Save Location"}
          </button>
        </motion.div>
      )}

      {/* ── Editors ────────────────────────────────────────────── */}
      <SensorEditor
        open={sensorEditorOpen}
        onClose={() => { setSensorEditorOpen(false); setEditingSensor(null); }}
        sensor={editingSensor}
        onSave={handleSaveSensor}
      />

      <PaneEditor
        open={paneEditorOpen}
        onClose={() => { setPaneEditorOpen(false); setEditingPane(null); }}
        pane={editingPane}
        sensors={sensors}
        controls={controls}
        nextOrder={panes.length}
        onSave={handleSavePane}
      />

      <ControlEditor
        open={controlEditorOpen}
        initial={editingControl}
        sensors={sensors}
        onSave={async (ctrl) => {
          if (editingControl) await store.updateControl(ctrl.id, ctrl);
          else await store.addControl(ctrl);
          setEditingControl(null);
        }}
        onClose={() => { setControlEditorOpen(false); setEditingControl(null); }}
      />

      <CameraEditor
        open={cameraEditorOpen}
        camera={editingCamera}
        onSave={handleSaveCamera}
        onClose={() => { setCameraEditorOpen(false); setEditingCamera(null); }}
      />

      <ZoneEditor
        open={zoneEditorOpen}
        zones={zoneEditCamera?.zones ?? []}
        cameraUrl={zoneEditCamera?.url ?? ""}
        paneId={zoneEditCamera?.id}
        onSave={handleSaveZones}
        onClose={() => { setZoneEditorOpen(false); setZoneEditCamera(null); }}
      />

      {/* ── About Footer ─────────────────────────────────────── */}
      <motion.div variants={item} className="mt-6 pt-4 border-t border-white/[0.03]">
        <Link
          href="/changelog"
          className="glass rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors touch-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-emerald-400/60" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-white/60">Changelog</p>
              <p className="text-[9px] text-white/20">See what&apos;s new in HabitatMQ</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/15" />
        </Link>
      </motion.div>
    </motion.div>
  );
}
