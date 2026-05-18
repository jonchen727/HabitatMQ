"use client";

/**
 * Camera Editor — Sheet drawer for adding/editing a camera definition.
 *
 * Auto-detection flow:
 *   1. User enters IP address + optional credentials
 *   2. "Detect Camera" probes RTSP (ffprobe) and ONVIF (SOAP) in parallel
 *   3. Detected streams shown with codec, resolution, fps info
 *   4. User picks a stream — protocol/URL auto-filled
 *   5. Manual override still available via "Advanced" toggle
 */

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, CheckCircle2, AlertCircle, Loader2, Radio, Wifi } from "lucide-react";
import type { CameraDef, StreamProtocol, DetectionMode, ZoneDef, OnvifMotionConfig } from "@/lib/schema";

interface CameraEditorProps {
  open: boolean;
  onClose: () => void;
  camera?: CameraDef | null;
  onSave: (camera: CameraDef) => void;
}

interface DetectedStream {
  url: string;
  label: string;
  codec: string;
  width: number;
  height: number;
  fps: number;
  source: "rtsp" | "onvif";
  profileToken?: string;
}

interface ProbeResult {
  success: boolean;
  streams: DetectedStream[];
  onvif?: {
    manufacturer?: string;
    model?: string;
    profiles: string[];
    status: "ok" | "auth_failed" | "unreachable" | "error";
    statusMessage?: string;
    supportsEvents?: boolean;
  };
  errors: string[];
}

const MODE_OPTIONS: { value: DetectionMode; label: string; desc: string }[] = [
  { value: "reptile", label: "Reptile", desc: "Optimized for slow-moving animals" },
  { value: "aquarium", label: "Aquarium", desc: "Fish tracking (coming soon)" },
  { value: "general", label: "General", desc: "Generic motion detection" },
];

const FPS_PRESETS = [0.5, 1, 2, 5, 10];

export function CameraEditor({ open, onClose, camera, onSave }: CameraEditorProps) {
  const isEdit = !!camera;

  // ── Basic fields ──
  const [label, setLabel] = useState("");
  const [cameraIp, setCameraIp] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [protocol, setProtocol] = useState<StreamProtocol>("rtsp");
  const [enabled, setEnabled] = useState(true);

  // ── Detection fields ──
  const [detectionFps, setDetectionFps] = useState(1);
  const [sensitivity, setSensitivity] = useState(25);
  const [minMotionArea, setMinMotionArea] = useState(500);
  const [settleTimeout, setSettleTimeout] = useState(10);
  const [blurKernel, setBlurKernel] = useState(21);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>("reptile");
  const [cameraIndex, setCameraIndex] = useState(0);
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState("");
  const [zones, setZones] = useState<ZoneDef[]>([]);

  // ── ONVIF fields ──
  const [useOnvif, setUseOnvif] = useState(false);
  const [onvifPort, setOnvifPort] = useState(2020);
  const [onvifProfile, setOnvifProfile] = useState("");
  const [motionDetection, setMotionDetection] = useState<OnvifMotionConfig>({
    enabled: false,
    mqttTopic: "",
    cooldownSeconds: 30,
  });

  // ── UI state ──
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [selectedStreamIdx, setSelectedStreamIdx] = useState<number>(0);

  // ── Extract IP from a URL (for edit mode) ──
  const extractIp = (urlStr: string): string => {
    try {
      // Handle rtsp:// URLs
      const match = urlStr.match(/(?:rtsp|http|https):\/\/(?:[^@]+@)?([^/:]+)/);
      return match?.[1] ?? urlStr;
    } catch {
      return urlStr;
    }
  };

  useEffect(() => {
    if (camera) {
      setLabel(camera.label);
      setUrl(camera.url);
      setCameraIp(extractIp(camera.url));
      setUsername(camera.username ?? "");
      setPassword(camera.password ?? "");
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
      setUseOnvif(camera.useOnvif ?? false);
      setOnvifPort(camera.onvifPort ?? 2020);
      setOnvifProfile(camera.onvifProfile ?? "");
      setMotionDetection(camera.motionDetection ?? { enabled: false, mqttTopic: "", cooldownSeconds: 30 });
      setProbeResult(null);
    } else {
      setLabel("");
      setUrl("");
      setCameraIp("");
      setUsername("");
      setPassword("");
      setProtocol("rtsp");
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
      setUseOnvif(false);
      setOnvifPort(2020);
      setOnvifProfile("");
      setMotionDetection({ enabled: false, mqttTopic: "", cooldownSeconds: 30 });
      setShowAdvanced(false);
      setProbeResult(null);
      setSelectedStreamIdx(0);
    }
  }, [camera, open]);

  // ── Auto-detect camera ──
  const handleProbe = useCallback(async () => {
    if (!cameraIp.trim()) return;
    setProbing(true);
    setProbeResult(null);
    try {
      const resp = await fetch("/api/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: cameraIp.trim(),
          username: username || undefined,
          password: password || undefined,
        }),
      });
      const result: ProbeResult = await resp.json();
      setProbeResult(result);

      // Auto-select first stream and populate fields
      if (result.success && result.streams.length > 0) {
        const stream = result.streams[0];
        setSelectedStreamIdx(0);
        setUrl(stream.url);
        setProtocol("rtsp");

        // ONVIF auto-populate
        if (stream.source === "onvif" && stream.profileToken) {
          setUseOnvif(true);
          setOnvifProfile(stream.profileToken);
          if (result.onvif?.supportsEvents) {
            setMotionDetection(prev => ({
              ...prev,
              mqttTopic: `enclosure/${cameraIp.replace(/\./g, "_")}/motion`,
            }));
          }
        }

        if (!label.trim()) {
          const deviceLabel = result.onvif?.model
            ? `${result.onvif.manufacturer ?? ""} ${result.onvif.model}`.trim()
            : "Camera";
          setLabel(deviceLabel);
        }
      }
    } catch (err) {
      setProbeResult({
        success: false,
        streams: [],
        errors: [err instanceof Error ? err.message : "Probe failed"],
      });
    } finally {
      setProbing(false);
    }
  }, [cameraIp, username, password, label]);

  // ── Select a detected stream ──
  const handleSelectStream = (idx: number) => {
    setSelectedStreamIdx(idx);
    const stream = probeResult?.streams[idx];
    if (stream) {
      setUrl(stream.url);
      setProtocol("rtsp");
      // Auto-set ONVIF profile if available
      if (stream.source === "onvif" && stream.profileToken) {
        setUseOnvif(true);
        setOnvifProfile(stream.profileToken);
      } else {
        setUseOnvif(false);
        setOnvifProfile("");
      }
    }
  };

  const canSave = label.trim().length > 0 && url.trim().length > 0;

  const handleSave = () => {
    const id = isEdit ? camera!.id : `cam-${Date.now()}`;
    const def: CameraDef = {
      id,
      label: label.trim(),
      url: url.trim(),
      protocol,
      enabled,
      ...(username ? { username: username.trim() } : {}),
      ...(password ? { password: password.trim() } : {}),
      useOnvif,
      onvifPort,
      ...(onvifProfile ? { onvifProfile } : {}),
      motionDetection,
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

  const codecBadgeColor = (codec: string) => {
    switch (codec.toLowerCase()) {
      case "h264": return "text-emerald-400 bg-emerald-400/10";
      case "h265": case "hevc": return "text-cyan-400 bg-cyan-400/10";
      case "mjpeg": return "text-amber-400 bg-amber-400/10";
      default: return "text-white/40 bg-white/5";
    }
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
          {/* ── Camera Name ── */}
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

          {/* ── Camera IP + Detect ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Camera IP Address
            </label>
            <div className="flex gap-2">
              <input
                value={cameraIp}
                onChange={(e) => setCameraIp(e.target.value)}
                placeholder="192.168.1.55"
                className="field-input flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleProbe()}
              />
              <button
                onClick={handleProbe}
                disabled={probing || !cameraIp.trim()}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-semibold transition-all flex items-center gap-1.5 shrink-0",
                  probing
                    ? "bg-cyan-500/10 text-cyan-400/50"
                    : "bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 active:scale-95"
                )}
              >
                {probing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                {probing ? "Detecting..." : "Detect"}
              </button>
            </div>
            <p className="text-[8px] text-white/15 leading-relaxed">
              Enter the camera&apos;s IP address — we&apos;ll probe RTSP (port 554) and ONVIF (port 2020) automatically
            </p>
          </div>

          {/* ── Credentials ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
                className="field-input"
              />
            </div>
          </div>

          {/* ── Probe Results ── */}
          {probeResult && (
            <div className="space-y-2">
              {/* Device info header */}
              {probeResult.onvif?.manufacturer && (
                <div className="flex items-center gap-2 py-1.5">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400/50" />
                  <span className="text-[10px] text-white/40">
                    {probeResult.onvif.manufacturer} {probeResult.onvif.model ?? ""}
                  </span>
                </div>
              )}

              {/* ONVIF status */}
              {probeResult.onvif && probeResult.onvif.status !== "ok" && (
                <div className={cn(
                  "flex items-center gap-2 py-1.5 px-2 rounded-lg text-[9px]",
                  probeResult.onvif.status === "auth_failed" ? "bg-amber-500/10 text-amber-400/70" :
                  probeResult.onvif.status === "unreachable" ? "bg-white/[0.03] text-white/20" :
                  "bg-red-500/10 text-red-400/50"
                )}>
                  <Wifi className="w-3 h-3 shrink-0" />
                  <span>ONVIF: {probeResult.onvif.statusMessage}</span>
                </div>
              )}
              {probeResult.onvif?.status === "ok" && !probeResult.onvif?.manufacturer && (
                <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-emerald-500/10 text-emerald-400/50 text-[9px]">
                  <Wifi className="w-3 h-3 shrink-0" />
                  <span>ONVIF: Connected ({probeResult.onvif.profiles.length} profiles)</span>
                </div>
              )}

              {probeResult.success ? (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                    Detected Streams — {probeResult.streams.length} found
                  </label>
                  {probeResult.streams.map((stream, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectStream(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                        selectedStreamIdx === idx
                          ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                          : "bg-white/[0.02] hover:bg-white/[0.04]"
                      )}
                    >
                      {selectedStreamIdx === idx ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Radio className="w-4 h-4 text-white/15 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            "text-[11px] font-semibold truncate",
                            selectedStreamIdx === idx ? "text-white/70" : "text-white/30"
                          )}>
                            {stream.label}
                          </p>
                          <span className={cn(
                            "text-[7px] font-bold uppercase px-1.5 py-0.5 rounded-md",
                            codecBadgeColor(stream.codec)
                          )}>
                            {stream.codec}
                          </span>
                          <span className="text-[7px] text-white/15 font-mono uppercase">
                            {stream.source}
                          </span>
                        </div>
                        <p className="text-[8px] text-white/15 font-mono truncate mt-0.5">
                          {stream.width > 0 && `${stream.width}×${stream.height}`}
                          {stream.fps > 0 && ` @ ${stream.fps}fps`}
                          {stream.width === 0 && "Resolution detecting..."}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5">
                  <AlertCircle className="w-4 h-4 text-red-400/50 shrink-0" />
                  <div>
                    <p className="text-[10px] text-red-400/60 font-semibold">No streams detected</p>
                    <p className="text-[8px] text-white/15">
                      {probeResult.errors.length > 0
                        ? probeResult.errors[0]
                        : "Check the IP address and credentials, then try again"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ONVIF Configuration (shown after probe or if useOnvif is set) ── */}
          {(useOnvif || probeResult?.onvif?.status === "ok") && (
            <div className="space-y-3 p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400/50" />
                  <span className="text-[10px] font-semibold text-cyan-400/60 uppercase tracking-wider">ONVIF Configuration</span>
                </div>
                {/* useOnvif Toggle */}
                <button
                  onClick={() => setUseOnvif(!useOnvif)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    useOnvif ? "bg-cyan-500/30" : "bg-white/[0.06]"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white/60 absolute top-0.5 transition-transform",
                    useOnvif ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              {useOnvif && (
                <>
                  {/* ONVIF Profile Selector */}
                  {probeResult?.onvif?.profiles && probeResult.onvif.profiles.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                        ONVIF Profile
                      </label>
                      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
                        {probeResult.onvif.profiles.map((token) => (
                          <button
                            key={token}
                            onClick={() => setOnvifProfile(token)}
                            className={cn(
                              "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                              onvifProfile === token
                                ? "bg-cyan-500/15 text-cyan-400/80"
                                : "text-white/20 hover:text-white/30"
                            )}
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ONVIF Port */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                      ONVIF Port
                    </label>
                    <input
                      type="number"
                      value={onvifPort}
                      onChange={(e) => setOnvifPort(parseInt(e.target.value) || 2020)}
                      className="field-input w-24"
                      min={1}
                      max={65535}
                    />
                  </div>

                  <p className="text-[8px] text-white/10 leading-relaxed">
                    ONVIF mode lets go2rtc auto-negotiate the stream — no manual RTSP path needed
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Motion Detection via ONVIF Events ── */}
          {(useOnvif || probeResult?.onvif?.supportsEvents) && (
            <div className="space-y-3 p-3 rounded-xl bg-amber-500/[0.03] border border-amber-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-amber-400/50" />
                  <span className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-wider">
                    Motion Detection
                  </span>
                  {probeResult?.onvif?.supportsEvents && (
                    <span className="text-[7px] text-emerald-400/50 bg-emerald-500/10 px-1.5 py-0.5 rounded-md font-bold uppercase">
                      Supported
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setMotionDetection(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    motionDetection.enabled ? "bg-amber-500/30" : "bg-white/[0.06]"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white/60 absolute top-0.5 transition-transform",
                    motionDetection.enabled ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              {motionDetection.enabled && (
                <>
                  {/* MQTT Topic */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                      MQTT Motion Topic
                    </label>
                    <input
                      value={motionDetection.mqttTopic}
                      onChange={(e) => setMotionDetection(prev => ({ ...prev, mqttTopic: e.target.value }))}
                      placeholder="enclosure/camera/motion"
                      className="field-input font-mono text-[10px]"
                    />
                    <p className="text-[8px] text-white/10">
                      Motion events published here as {`{motion: true/false, timestamp}`}
                    </p>
                  </div>

                  {/* Cooldown */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                      Cooldown — {motionDetection.cooldownSeconds}s
                    </label>
                    <input
                      type="range" min={0} max={120} step={5}
                      value={motionDetection.cooldownSeconds}
                      onChange={(e) => setMotionDetection(prev => ({ ...prev, cooldownSeconds: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-amber-400"
                    />
                    <div className="flex justify-between text-[7px] text-white/10">
                      <span>0s (every event)</span>
                      <span>120s (debounce)</span>
                    </div>
                  </div>

                  <p className="text-[8px] text-white/10 leading-relaxed">
                    Uses ONVIF PullMessages — camera&apos;s built-in detector does the work, zero CPU on Pi
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Stream URL (auto-filled or manual) ── */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
              Stream URL {probeResult?.success ? "(auto-detected)" : ""} {useOnvif ? "· ONVIF mode" : ""}
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={useOnvif ? "Auto-negotiated via ONVIF" : "rtsp://192.168.1.55:554/stream1"}
              className={cn("field-input font-mono text-[10px]", useOnvif && "opacity-50")}
              disabled={useOnvif}
            />
            <p className="text-[8px] text-white/10">
              {useOnvif
                ? "ONVIF mode — go2rtc discovers the stream automatically from the camera"
                : "Credentials are injected server-side — only enter the URL without username:password"}
            </p>
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
              type="range" min={0.1} max={10} step={0.1}
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
              type="range" min={1} max={100} step={1}
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
              type="range" min={1} max={120} step={1}
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
              {/* Protocol Override */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
                  Protocol Override
                </label>
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
                  {(["rtsp", "mjpeg", "hls", "img"] as const).map((p) => (
                    <button key={p} onClick={() => setProtocol(p)} className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all uppercase",
                      protocol === p ? "bg-white/[0.08] text-white/70" : "text-white/20"
                    )}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-white/10">
                  Auto-detected as <span className="font-semibold text-white/20">{protocol.toUpperCase()}</span> — override only if auto-detect is wrong
                </p>
              </div>

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
