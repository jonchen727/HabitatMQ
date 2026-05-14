"use client";

/**
 * Pane Editor — Sheet drawer for adding/editing a dashboard pane.
 *
 * Flow: Choose Source (Sensor or Control) → Pick Display Type → Configure Layout.
 * Supports both sensor-backed and control-backed panes.
 */

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DISPLAY_TYPE_ICONS } from "@/components/blocks/widget-registry";
import { Search, Loader2, Camera } from "lucide-react";
import { useDashboardStore } from "@/store/use-dashboard-store";
import type { SensorDef, ControlDef, PaneDef, DisplayType, ColorTheme, ChartRange, StreamProtocol } from "@/lib/schema";

interface PaneEditorProps {
  open: boolean;
  onClose: () => void;
  pane?: PaneDef | null;
  sensors: SensorDef[];
  controls: ControlDef[];
  nextOrder: number;
  onSave: (pane: PaneDef) => void;
}

type SourceType = "sensor" | "control" | "camera" | "stream";

const DISPLAY_TYPES: DisplayType[] = ["gauge", "number", "chart", "bar", "switch", "stream"];
const COLOR_THEMES: { value: ColorTheme; label: string; swatch: string }[] = [
  { value: "warm", label: "Warm", swatch: "bg-orange-400" },
  { value: "cool", label: "Cool", swatch: "bg-cyan-400" },
  { value: "amber", label: "Amber", swatch: "bg-amber-400" },
  { value: "green", label: "Green", swatch: "bg-emerald-400" },
  { value: "neutral", label: "Neutral", swatch: "bg-slate-400" },
];
const CHART_RANGES: ChartRange[] = ["1h", "6h", "24h", "7d", "30d"];

export function PaneEditor({ open, onClose, pane, sensors, controls, nextOrder, onSave }: PaneEditorProps) {
  const isEdit = !!pane;
  const cameras = useDashboardStore((s) => s.cameras);

  const [sourceType, setSourceType] = useState<SourceType>("sensor");
  const [sensorId, setSensorId] = useState("");
  const [controlId, setControlId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [displayType, setDisplayType] = useState<DisplayType>("gauge");
  const [colSpan, setColSpan] = useState<1 | 2>(1);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("neutral");
  const [chartRange, setChartRange] = useState<ChartRange>("24h");
  const [labelOverride, setLabelOverride] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [streamProtocol, setStreamProtocol] = useState<StreamProtocol>("mjpeg");
  const [streamRefreshInterval, setStreamRefreshInterval] = useState(5000);
  const [streamUsername, setStreamUsername] = useState("");
  const [streamPassword, setStreamPassword] = useState("");
  const [streamIp, setStreamIp] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeStatus, setProbeStatus] = useState<string>("");

  useEffect(() => {
    if (pane) {
      // Determine source type from existing pane
      if (pane.cameraId) {
        setSourceType("camera");
        setCameraId(pane.cameraId);
      } else if (pane.displayType === "stream") {
        setSourceType("stream");
        setStreamUrl(pane.streamConfig?.url ?? "");
        setStreamProtocol(pane.streamConfig?.protocol ?? "mjpeg");
        setStreamRefreshInterval(pane.streamConfig?.refreshInterval ?? 5000);
        setStreamUsername(pane.streamConfig?.username ?? "");
        setStreamPassword(pane.streamConfig?.password ?? "");
      } else if (pane.controlId) {
        setSourceType("control");
        setControlId(pane.controlId);
        setSensorId(pane.sensorId ?? "");
      } else {
        setSourceType("sensor");
        setSensorId(pane.sensorId ?? sensors[0]?.id ?? "");
        setControlId("");
      }
      setDisplayType(pane.displayType);
      setColSpan(pane.colSpan);
      setColorTheme(pane.colorTheme);
      setChartRange((pane.chartRange as ChartRange) ?? "24h");
      setLabelOverride(pane.labelOverride ?? "");
    } else {
      setSourceType("sensor");
      setSensorId(sensors[0]?.id ?? "");
      setControlId(controls[0]?.id ?? "");
      setDisplayType("gauge");
      setColSpan(1);
      setColorTheme("neutral");
      setChartRange("24h");
      setLabelOverride("");
      setStreamUrl("");
      setStreamProtocol("mjpeg");
      setStreamRefreshInterval(5000);
      setStreamUsername("");
      setStreamPassword("");
      setStreamIp("");
      setProbeStatus("");
      setCameraId("");
    }
  }, [pane, open, sensors, controls, cameras]);

  const handleProbeStream = useCallback(async () => {
    if (!streamIp.trim()) return;
    setProbing(true);
    setProbeStatus("Detecting...");
    try {
      const resp = await fetch("/api/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: streamIp.trim(),
          username: streamUsername || undefined,
          password: streamPassword || undefined,
        }),
      });
      const result = await resp.json();
      if (result.success && result.streams.length > 0) {
        const stream = result.streams[0];
        setStreamUrl(stream.url);
        setStreamProtocol("rtsp");
        setProbeStatus(`✓ ${stream.codec.toUpperCase()} ${stream.width}×${stream.height} @ ${stream.fps}fps`);
        if (!labelOverride.trim() && result.onvif?.model) {
          setLabelOverride(`${result.onvif.manufacturer ?? ""} ${result.onvif.model}`.trim());
        }
      } else {
        setProbeStatus("✗ No streams found — check IP and credentials");
      }
    } catch {
      setProbeStatus("✗ Probe failed");
    } finally {
      setProbing(false);
    }
  }, [streamIp, streamUsername, streamPassword, labelOverride]);

  // When switching to "control" source, default to "switch" display
  const handleSourceChange = (st: SourceType) => {
    setSourceType(st);
    if (st === "control") {
      setDisplayType("switch");
      if (!controlId && controls.length > 0) setControlId(controls[0].id);
    } else if (st === "camera") {
      setDisplayType("stream");
      if (!cameraId && cameras.length > 0) setCameraId(cameras[0].id);
    } else if (st === "stream") {
      setDisplayType("stream");
    } else {
      if (!sensorId && sensors.length > 0) setSensorId(sensors[0].id);
    }
  };

  const canSave = sourceType === "camera" ? !!cameraId : sourceType === "stream" ? true : sourceType === "sensor" ? !!sensorId : !!controlId;

  const handleSave = () => {
    const id = isEdit ? pane!.id : `pane-${Date.now()}`;

    // When source is control, find the matching sensor (by statusTopic) if one exists
    let resolvedSensorId = sensorId;
    if (sourceType === "control" && controlId) {
      const ctrl = controls.find((c) => c.id === controlId);
      if (ctrl) {
        const matchingSensor = sensors.find(
          (s) => s.mqtt.topic === ctrl.mqtt.statusTopic
        );
        if (matchingSensor) {
          resolvedSensorId = matchingSensor.id;
        }
      }
    }

    const def: PaneDef = {
      id,
      ...(sourceType === "camera"
        ? { cameraId }
        : sourceType === "stream"
          ? {
              streamConfig: {
                url: streamUrl,
                protocol: streamProtocol,
                refreshInterval: streamRefreshInterval,
                label: labelOverride || undefined,
                ...(streamUsername ? { username: streamUsername } : {}),
                ...(streamPassword ? { password: streamPassword } : {}),
              },
            }
          : sourceType === "sensor"
            ? { sensorId }
            : { controlId, ...(resolvedSensorId ? { sensorId: resolvedSensorId } : {}) }),
      displayType: (sourceType === "stream" || sourceType === "camera") ? "stream" as const : displayType,
      colSpan,
      colorTheme,
      order: isEdit ? pane!.order : nextOrder,
      ...(displayType === "chart" ? { chartRange } : {}),
      ...(labelOverride ? { labelOverride } : {}),
    };
    onSave(def);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto overflow-x-hidden rounded-t-3xl glass-heavy border-t border-white/[0.06] px-6 pb-8">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-[16px] font-bold text-white/80">
            {isEdit ? "Edit Pane" : "Add Pane"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Source Type Toggle */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Source
            </label>
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
              <button onClick={() => handleSourceChange("sensor")} className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                sourceType === "sensor" ? "bg-white/[0.08] text-white/70" : "text-white/20"
              )}>
                Sensor
              </button>
              <button onClick={() => handleSourceChange("control")} className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                sourceType === "control" ? "bg-white/[0.08] text-white/70" : "text-white/20"
              )}>
                Control
              </button>
              <button onClick={() => handleSourceChange("camera")} className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                sourceType === "camera" ? "bg-white/[0.08] text-white/70" : "text-white/20"
              )}>
                <span className="flex items-center justify-center gap-1">
                  <Camera className="w-3 h-3" /> Camera
                </span>
              </button>
            </div>
          </div>

          {/* Sensor / Control Selector */}
          {sourceType === "sensor" ? (
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Sensor
              </label>
              <select
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                className="field-input w-full"
              >
                {sensors.length === 0 && (
                  <option value="" disabled>No sensors configured</option>
                )}
                {sensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.mqtt.topic})
                  </option>
                ))}
              </select>
            </div>
          ) : sourceType === "control" ? (
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Control
              </label>
              <select
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
                className="field-input w-full"
              >
                {controls.length === 0 && (
                  <option value="" disabled>No controls configured</option>
                )}
                {controls.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.mqtt.controlTopic})
                  </option>
                ))}
              </select>
            </div>
          ) : sourceType === "camera" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Camera
                </label>
                {cameras.length === 0 ? (
                  <p className="text-[10px] text-white/20 italic py-3">
                    No cameras configured — go to <span className="text-white/40 font-semibold">Config → Cameras</span> to add one first.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {cameras.map((cam) => (
                      <button
                        key={cam.id}
                        onClick={() => setCameraId(cam.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                          cameraId === cam.id
                            ? "bg-white/[0.08] ring-1 ring-white/10"
                            : "bg-white/[0.02] hover:bg-white/[0.05]"
                        )}
                      >
                        <Camera className={cn(
                          "w-5 h-5 shrink-0",
                          cameraId === cam.id ? "text-cyan-400" : "text-white/15"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-[11px] font-semibold truncate",
                            cameraId === cam.id ? "text-white/70" : "text-white/30"
                          )}>
                            {cam.label || cam.id}
                          </p>
                          <p className="text-[8px] text-white/15 truncate font-mono">
                            {cam.protocol?.toUpperCase() ?? "MJPEG"} · {cam.url}
                          </p>
                        </div>
                        {cameraId === cam.id && (
                          <span className="text-[8px] font-bold text-cyan-400/60 uppercase tracking-wider">Selected</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : sourceType === "stream" ? (
            /* ── Stream Configuration ── */
            <div className="space-y-3">
              {/* IP + Detect */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Camera IP Address
                </label>
                <div className="flex gap-2">
                  <input
                    value={streamIp}
                    onChange={(e) => setStreamIp(e.target.value)}
                    placeholder="192.168.1.55"
                    className="field-input flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleProbeStream()}
                  />
                  <button
                    onClick={handleProbeStream}
                    disabled={probing || !streamIp.trim()}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[10px] font-semibold transition-all flex items-center gap-1.5 shrink-0",
                      probing
                        ? "bg-cyan-500/10 text-cyan-400/50"
                        : "bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 active:scale-95"
                    )}
                  >
                    {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {probing ? "..." : "Detect"}
                  </button>
                </div>
                {probeStatus && (
                  <p className={cn(
                    "text-[8px] font-semibold",
                    probeStatus.startsWith("✓") ? "text-emerald-400/60" : probeStatus.startsWith("✗") ? "text-red-400/50" : "text-white/20"
                  )}>
                    {probeStatus}
                  </p>
                )}
              </div>

              {/* Credentials */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Username</label>
                  <input
                    value={streamUsername}
                    onChange={(e) => setStreamUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="off"
                    className="field-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Password</label>
                  <input
                    type="password"
                    value={streamPassword}
                    onChange={(e) => setStreamPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="field-input"
                  />
                </div>
              </div>

              {/* Stream URL (auto-filled or manual) */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Stream URL
                </label>
                <input
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="rtsp://192.168.1.55:554/stream1"
                  className="field-input font-mono text-[10px]"
                />
              </div>

              {/* Protocol */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Protocol
                </label>
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
                  {(["rtsp", "mjpeg", "hls", "img"] as const).map((p) => (
                    <button key={p} onClick={() => setStreamProtocol(p)} className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all uppercase",
                      streamProtocol === p ? "bg-white/[0.08] text-white/70" : "text-white/20"
                    )}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {streamProtocol === "img" && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                    Refresh Interval (ms)
                  </label>
                  <input
                    type="number"
                    value={streamRefreshInterval}
                    onChange={(e) => setStreamRefreshInterval(parseInt(e.target.value) || 5000)}
                    className="field-input"
                    min={1000}
                    step={1000}
                  />
                </div>
              )}
              <p className="text-[8px] text-white/10">
                Credentials injected server-side — never exposed to the browser
              </p>
            </div>
          ) : null}

          {/* Display Type Picker (hidden for stream/camera) */}
          {sourceType !== "stream" && sourceType !== "camera" && (
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Display Type
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {DISPLAY_TYPES.map((dt) => {
                const Icon = DISPLAY_TYPE_ICONS[dt];
                return (
                  <button
                    key={dt}
                    onClick={() => setDisplayType(dt)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all",
                      displayType === dt
                        ? "bg-white/[0.08] text-white/70 shadow-sm"
                        : "bg-white/[0.02] text-white/20 hover:text-white/35"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[8px] font-semibold capitalize">{dt}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Chart Range (conditional) */}
          {displayType === "chart" && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Time Range
              </label>
              <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
                {CHART_RANGES.map((r) => (
                  <button key={r} onClick={() => setChartRange(r)} className={cn(
                    "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                    chartRange === r
                      ? "bg-white/[0.08] text-white/70"
                      : "text-white/20 hover:text-white/35"
                  )}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color Theme */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Color Theme
            </label>
            <div className="flex gap-2">
              {COLOR_THEMES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setColorTheme(ct.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all",
                    colorTheme === ct.value
                      ? "bg-white/[0.08] shadow-sm"
                      : "bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-full", ct.swatch)} />
                  <span className={cn(
                    "text-[7px] font-semibold uppercase tracking-wider",
                    colorTheme === ct.value ? "text-white/60" : "text-white/15"
                  )}>
                    {ct.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Column Span */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Width
            </label>
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
              <button onClick={() => setColSpan(1)} className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                colSpan === 1 ? "bg-white/[0.08] text-white/70" : "text-white/20"
              )}>
                Half
              </button>
              <button onClick={() => setColSpan(2)} className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                colSpan === 2 ? "bg-white/[0.08] text-white/70" : "text-white/20"
              )}>
                Full
              </button>
            </div>
          </div>

          {/* Label Override */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Label Override (optional)
            </label>
            <input
              value={labelOverride}
              onChange={(e) => setLabelOverride(e.target.value)}
              placeholder={sourceType === "sensor" ? "Uses sensor label if empty" : "Uses control label if empty"}
              className="field-input"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} className="flex-1 text-white/30">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}
              className="flex-1 bg-white/[0.08] text-white/80 hover:bg-white/[0.12]">
              {isEdit ? "Update" : "Add Pane"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
