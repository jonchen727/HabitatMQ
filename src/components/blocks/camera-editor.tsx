"use client";

/**
 * Camera Editor — Sheet drawer for adding/editing a camera definition.
 *
 * Fields: Label, URL, Protocol, Detection FPS, Sensitivity, Settle Timeout.
 * Zone drawing is handled in a separate ZoneEditor component (launched from here).
 * Same design language as SensorEditor / ControlEditor.
 */

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CameraDef, StreamProtocol, DetectionMode, ZoneDef } from "@/lib/schema";

interface CameraEditorProps {
  open: boolean;
  onClose: () => void;
  camera?: CameraDef | null;
  onSave: (camera: CameraDef) => void;
}

const PROTOCOL_OPTIONS: { value: StreamProtocol; label: string }[] = [
  { value: "mjpeg", label: "MJPEG" },
  { value: "hls", label: "HLS" },
  { value: "img", label: "Snapshot" },
];

const MODE_OPTIONS: { value: DetectionMode; label: string; desc: string }[] = [
  { value: "reptile", label: "Reptile", desc: "Optimized for slow-moving animals" },
  { value: "aquarium", label: "Aquarium", desc: "Fish tracking (coming soon)" },
  { value: "general", label: "General", desc: "Generic motion detection" },
];

const FPS_PRESETS = [0.5, 1, 2, 5, 10];

export function CameraEditor({ open, onClose, camera, onSave }: CameraEditorProps) {
  const isEdit = !!camera;

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [protocol, setProtocol] = useState<StreamProtocol>("mjpeg");
  const [enabled, setEnabled] = useState(true);
  const [detectionFps, setDetectionFps] = useState(1);
  const [sensitivity, setSensitivity] = useState(25);
  const [minMotionArea, setMinMotionArea] = useState(500);
  const [settleTimeout, setSettleTimeout] = useState(10);
  const [blurKernel, setBlurKernel] = useState(21);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>("reptile");
  const [cameraIndex, setCameraIndex] = useState(0);
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState("");
  const [zones, setZones] = useState<ZoneDef[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (camera) {
      setLabel(camera.label);
      setUrl(camera.url);
      setProtocol(camera.protocol);
      setEnabled(camera.enabled);
      setDetectionFps(camera.detectionFps);
      setSensitivity(camera.sensitivity);
      setMinMotionArea(camera.minMotionArea);
      setSettleTimeout(camera.settleTimeout);
      setBlurKernel(camera.blurKernel);
      setDetectionMode(camera.detectionMode);
      setCameraIndex(camera.cameraIndex);
      setMqttTopicPrefix(camera.mqttTopicPrefix);
      setZones(camera.zones);
    } else {
      setLabel("");
      setUrl("");
      setProtocol("mjpeg");
      setEnabled(true);
      setDetectionFps(1);
      setSensitivity(25);
      setMinMotionArea(500);
      setSettleTimeout(10);
      setBlurKernel(21);
      setDetectionMode("reptile");
      setCameraIndex(0);
      setMqttTopicPrefix("");
      setZones([]);
      setShowAdvanced(false);
    }
  }, [camera, open]);

  const canSave = label.trim().length > 0;

  const handleSave = () => {
    const id = isEdit ? camera!.id : `cam-${Date.now()}`;
    const def: CameraDef = {
      id,
      label: label.trim(),
      url: url.trim(),
      protocol,
      enabled,
      detectionFps,
      sensitivity,
      minMotionArea,
      settleTimeout,
      blurKernel,
      zones,
      detectionMode,
      cameraIndex,
      mqttTopicPrefix: mqttTopicPrefix.trim(),
    };
    onSave(def);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-3xl glass-heavy border-t border-white/[0.06] px-6 pb-8">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-[16px] font-bold text-white/80">
            {isEdit ? "Edit Camera" : "Add Camera"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* ── Basic Info ── */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Camera Name
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enclosure Cam 1"
                className="field-input"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Camera URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.x:8080/video"
                className="field-input"
              />
              <p className="text-[8px] text-white/15 leading-relaxed">
                Use <span className="text-white/25 font-semibold">SimpleIPCamera</span> (free iOS app) — copy the MJPEG URL
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Protocol
              </label>
              <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
                {PROTOCOL_OPTIONS.map((p) => (
                  <button key={p.value} onClick={() => setProtocol(p.value)} className={cn(
                    "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                    protocol === p.value ? "bg-white/[0.08] text-white/70" : "text-white/20"
                  )}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Detection Mode ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Detection Mode
            </label>
            <div className="space-y-1.5">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setDetectionMode(m.value)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                    detectionMode === m.value
                      ? "bg-white/[0.06] ring-1 ring-white/10"
                      : "bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full border-2 transition-colors shrink-0",
                    detectionMode === m.value
                      ? "border-emerald-400 bg-emerald-400"
                      : "border-white/15"
                  )} />
                  <div className="min-w-0">
                    <p className={cn(
                      "text-[11px] font-semibold",
                      detectionMode === m.value ? "text-white/70" : "text-white/30"
                    )}>
                      {m.label}
                      {m.value === "aquarium" && (
                        <span className="ml-1.5 text-[7px] text-amber-400/60 uppercase">Soon</span>
                      )}
                    </p>
                    <p className="text-[8px] text-white/15">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Detection FPS ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Detection FPS — {detectionFps}
            </label>
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
              {FPS_PRESETS.map((f) => (
                <button key={f} onClick={() => setDetectionFps(f)} className={cn(
                  "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                  detectionFps === f ? "bg-white/[0.08] text-white/70" : "text-white/20"
                )}>
                  {f}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={detectionFps}
              onChange={(e) => setDetectionFps(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-[7px] text-white/10">
              <span>0.1 FPS (low power)</span>
              <span>10 FPS (real-time)</span>
            </div>
          </div>

          {/* ── Sensitivity ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Sensitivity — {sensitivity}
            </label>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseInt(e.target.value))}
              className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[7px] text-white/10">
              <span>1 (very sensitive)</span>
              <span>100 (only large changes)</span>
            </div>
          </div>

          {/* ── Settle Timeout ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Settle Timeout — {settleTimeout}s
            </label>
            <input
              type="range"
              min={1}
              max={120}
              step={1}
              value={settleTimeout}
              onChange={(e) => setSettleTimeout(parseInt(e.target.value))}
              className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[7px] text-white/10">
              <span>1s (fast settle)</span>
              <span>120s (slow settle)</span>
            </div>
          </div>

          {/* ── Zones Summary ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Detection Zones — {zones.length} configured
            </label>
            <div className="glass rounded-xl p-3">
              {zones.length === 0 ? (
                <p className="text-[10px] text-white/15 text-center py-2">
                  No zones configured — save camera first, then draw zones
                </p>
              ) : (
                <div className="space-y-1.5">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-2 py-1.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: z.color }}
                      />
                      <span className="text-[10px] text-white/50 font-medium flex-1 truncate">
                        {z.label}
                      </span>
                      <button
                        onClick={() => setZones(zones.filter((zz) => zz.id !== z.id))}
                        className="text-[8px] text-red-400/40 hover:text-red-400/60"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Advanced Toggle ── */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full text-[9px] font-semibold text-white/15 hover:text-white/30 transition-colors py-1"
          >
            {showAdvanced ? "▾ Hide Advanced" : "▸ Show Advanced"}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pl-2 border-l border-white/[0.04]">
              {/* Blur Kernel */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Blur Kernel — {blurKernel}
                </label>
                <input
                  type="range" min={3} max={31} step={2}
                  value={blurKernel}
                  onChange={(e) => setBlurKernel(parseInt(e.target.value))}
                  className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-400"
                />
              </div>

              {/* Min Motion Area */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Min Motion Area — {minMotionArea}px²
                </label>
                <input
                  type="range" min={10} max={5000} step={10}
                  value={minMotionArea}
                  onChange={(e) => setMinMotionArea(parseInt(e.target.value))}
                  className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-400"
                />
              </div>

              {/* Camera Index (multi-cam) */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Camera Index (multi-cam)
                </label>
                <input
                  type="number" min={0} max={7}
                  value={cameraIndex}
                  onChange={(e) => setCameraIndex(parseInt(e.target.value) || 0)}
                  className="field-input"
                />
                <p className="text-[8px] text-white/10">For future 3D interpolation with multiple cameras</p>
              </div>

              {/* MQTT Topic Prefix */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  MQTT Topic Prefix
                </label>
                <input
                  value={mqttTopicPrefix}
                  onChange={(e) => setMqttTopicPrefix(e.target.value)}
                  placeholder="enclosure/aspen"
                  className="field-input"
                />
                <p className="text-[8px] text-white/10">
                  Publishes to <span className="font-mono">{mqttTopicPrefix || "enclosure/aspen"}/location</span>
                </p>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Detection Enabled
                </label>
                <button
                  onClick={() => setEnabled(!enabled)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    enabled ? "bg-emerald-500/30" : "bg-white/[0.06]"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white/60 absolute top-0.5 transition-transform",
                    enabled ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} className="flex-1 text-white/30">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}
              className="flex-1 bg-white/[0.08] text-white/80 hover:bg-white/[0.12]">
              {isEdit ? "Update" : "Add Camera"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
