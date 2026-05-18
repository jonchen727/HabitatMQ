"use client";

/**
 * Stream Widget — Displays live camera feeds in dashboard panes.
 *
 * Lowest-latency approach: MJPEG proxy passthrough.
 *   iPhone (SimpleIPCamera app) → Wi-Fi → Pi (API proxy) → Browser (<img>)
 *
 * The Pi's API route at /api/streams/[paneId]/feed proxies the MJPEG
 * stream from the camera so remote viewers can see it too.
 *
 * Supports:
 *   mjpeg — MJPEG via server proxy (default, lowest latency)
 *   hls   — HLS.js player for .m3u8 streams
 *   img   — Periodic snapshot refresh
 *
 * Click the pane to expand fullscreen with pinch-to-zoom.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Video, VideoOff, X, Maximize2, WifiOff, Minimize2 } from "lucide-react";
import type { PaneDef, StreamConfig } from "@/lib/schema";
import { useDashboardStore } from "@/store/use-dashboard-store";
import { MotionIndicator } from "@/components/blocks/motion-indicator";

/* ═══════════════════════════════════════════════════════════════════════════
   HLS Player — Lazy-loads hls.js only when needed
   ═══════════════════════════════════════════════════════════════════════════ */
function HlsPlayer({
  url,
  className,
  onError,
}: {
  url: string;
  className?: string;
  onError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!url || !videoRef.current) return;
    let hls: import("hls.js").default | null = null;

    const init = async () => {
      const Hls = (await import("hls.js")).default;
      if (!videoRef.current) return;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 0,
        });
        hls.loadSource(url);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) onError();
        });
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = url;
      } else {
        onError();
      }
    };

    init();
    return () => { hls?.destroy(); };
  }, [url, onError]);

  return (
    <video
      ref={videoRef}
      autoPlay muted playsInline
      className={cn("w-full h-full object-contain bg-black rounded-lg", className)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MJPEG Player — Uses server proxy for lowest latency
   ═══════════════════════════════════════════════════════════════════════════ */
function MjpegPlayer({
  paneId,
  directUrl,
  className,
  onError,
  onLoad,
}: {
  paneId: string;
  directUrl?: string;
  className?: string;
  onError: () => void;
  onLoad?: () => void;
}) {
  const [connecting, setConnecting] = useState(true);
  const [ready, setReady] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable URL — must NOT change on re-render or the browser aborts the
  // active multipart/x-mixed-replace stream and reconnects (killing ffmpeg)
  const src = useMemo(
    () => directUrl ? `/api/streams/${encodeURIComponent(paneId)}/feed` : "",
    [directUrl, paneId]
  );

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleLoad = useCallback(() => {
    // First frame arrived — stream is live
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setConnecting(false);
    setReady(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    if (ready) {
      // Stream was working then failed — immediate error
      onError();
      return;
    }
    // During initial connection, delay error by 15s to allow ffmpeg warmup
    if (!errorTimerRef.current) {
      errorTimerRef.current = setTimeout(() => {
        if (!ready) onError();
      }, 15000);
    }
  }, [ready, onError]);

  if (!directUrl) return null;

  return (
    <div className="relative w-full h-full">
      {connecting && !ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
          <div className="w-4 h-4 border-2 border-white/10 border-t-cyan-400/50 rounded-full animate-spin" />
          <p className="text-[8px] text-white/20 font-medium">Connecting to stream…</p>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Camera feed"
        onError={handleError}
        onLoad={handleLoad}
        className={cn(
          "w-full h-full object-contain bg-black transition-opacity duration-500",
          ready ? "opacity-100" : "opacity-0",
          className
        )}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MSE Player — Zero-transcode H264 via go2rtc WebSocket
   Browser decodes H264 natively. CPU usage: ~0% vs ~300% with ffmpeg.
   ═══════════════════════════════════════════════════════════════════════════ */
function MsePlayer({
  cameraId,
  className,
  onError,
  onLoad,
}: {
  cameraId: string;
  className?: string;
  onError: () => void;
  onLoad?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const msRef = useRef<MediaSource | null>(null);
  const readyRef = useRef(false);
  const [connecting, setConnecting] = useState(true);
  const [ready, setReady] = useState(false);

  // Stable refs for callbacks to avoid deps-triggered reconnects
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!cameraId) return;

    // ManagedMediaSource for iOS Safari, MediaSource for everything else
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MSE: typeof MediaSource | undefined = (window as any).ManagedMediaSource ?? window.MediaSource;
    if (!MSE) return; // No MSE support at all — bail
    const isManagedMSE = 'ManagedMediaSource' in window;

    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const CODECS = [
      'avc1.640029',      // H.264 high 4.1
      'avc1.64002A',      // H.264 high 4.2
      'avc1.640033',      // H.264 high 5.1
      'hvc1.1.6.L153.B0', // H.265
      'mp4a.40.2',        // AAC LC
      'mp4a.40.5',        // AAC HE
      'flac',             // FLAC (go2rtc converts PCMA to FLAC)
      'opus',             // Opus
    ];

    const supportedCodecs = CODECS
      .filter(c => MSE.isTypeSupported(`video/mp4; codecs="${c}"`))
      .join(",");

    const connect = async () => {
      try {
        // Get connection info (and ensure stream is registered if needed)
        const res = await fetch(`/api/streams/go2rtc?cameraId=${encodeURIComponent(cameraId)}`);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const info = await res.json();
        if (!info.healthy) throw new Error("go2rtc not reachable");
        if (!mounted) return;

        const video = videoRef.current;
        if (!video) return;

        const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
        // Route through the Next.js custom server's WS proxy so it works
        // through Cloudflare Tunnel (port 1984 isn't tunneled directly)
        const wsUrl = `${wsProto}//${window.location.host}/api/streams/go2rtc/ws?src=${encodeURIComponent(cameraId)}`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        // --- go2rtc MSE protocol (matches video-rtc.js v1.6.0) ---
        // 1. Create MediaSource, attach to video, play()
        // 2. On sourceopen → send codec negotiation
        // 3. Server responds with {type:"mse", value:"<mime>"}
        // 4. Create SourceBuffer with that MIME
        // 5. Receive binary fMP4 segments

        let sourceBuffer: SourceBuffer | null = null;
        // Pre-allocated buffer for queuing binary data (2MB, same as go2rtc)
        const buf = new Uint8Array(2 * 1024 * 1024);
        let bufLen = 0;

        const ms = new MSE();
        msRef.current = ms as unknown as MediaSource;

        // Step 1: Attach MediaSource to video
        ms.addEventListener("sourceopen", () => {
          if (!isManagedMSE) URL.revokeObjectURL(video.src);
          // Step 2: Send codec negotiation AFTER sourceopen
          if (ws.readyState === WebSocket.OPEN) {
            console.log(`[MsePlayer] sourceopen, sending codecs: ${supportedCodecs}`);
            ws.send(JSON.stringify({ type: "mse", value: supportedCodecs }));
          }
        }, { once: true });

        if (isManagedMSE) {
          // Safari iOS: ManagedMediaSource uses srcObject
          video.disableRemotePlayback = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (video as any).srcObject = ms;
        } else {
          video.src = URL.createObjectURL(ms);
          video.srcObject = null;
        }

        video.play().catch(() => {
          if (!video.muted) {
            video.muted = true;
            video.play().catch(() => { /* ok */ });
          }
        });

        ws.onopen = () => {
          console.log("[MsePlayer] ws connected");
          // If sourceopen already fired, send codecs now
          if (ms.readyState === "open" && !sourceBuffer) {
            console.log(`[MsePlayer] sending codecs (deferred): ${supportedCodecs}`);
            ws.send(JSON.stringify({ type: "mse", value: supportedCodecs }));
          }
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data === "string") {
            const msg = JSON.parse(ev.data);
            if (msg.type === "mse") {
              // Step 4: Server sends the full MIME — use directly
              console.log(`[MsePlayer] server codec: ${msg.value}`);
              try {
                sourceBuffer = ms.addSourceBuffer(msg.value);
                sourceBuffer.mode = "segments";

                sourceBuffer.addEventListener("updateend", () => {
                  // Flush queued data
                  if (!sourceBuffer!.updating && bufLen > 0) {
                    try {
                      const data = buf.slice(0, bufLen);
                      sourceBuffer!.appendBuffer(data);
                      bufLen = 0;
                    } catch { /* QuotaExceeded */ }
                  }

                  // Trim old buffer and keep stream live
                  if (!sourceBuffer!.updating && sourceBuffer!.buffered?.length) {
                    const end = sourceBuffer!.buffered.end(sourceBuffer!.buffered.length - 1);
                    const start = end - 5;
                    const start0 = sourceBuffer!.buffered.start(0);
                    if (start > start0) {
                      sourceBuffer!.remove(start0, start);
                      ms.setLiveSeekableRange(start, end);
                    }
                    // Keep playback at the live edge
                    if (video.currentTime < start) {
                      video.currentTime = start;
                    }
                    const gap = end - video.currentTime;
                    video.playbackRate = gap > 0.1 ? gap : 0.1;
                  }
                });

                // Mark as ready when first frame plays
                video.addEventListener("playing", () => {
                  if (mounted) {
                    readyRef.current = true;
                    setConnecting(false);
                    setReady(true);
                    onLoadRef.current?.();
                  }
                }, { once: true });

              } catch (e) {
                console.error("[MsePlayer] addSourceBuffer error:", e);
                if (mounted) onErrorRef.current();
              }
            }
            return;
          }

          // Step 5: Binary fMP4 segment
          if (sourceBuffer && !sourceBuffer.updating && bufLen === 0) {
            try {
              sourceBuffer.appendBuffer(ev.data);
            } catch { /* QuotaExceeded — will be flushed on updateend */ }
          } else {
            // Queue into pre-allocated buffer
            const b = new Uint8Array(ev.data);
            if (bufLen + b.byteLength <= buf.byteLength) {
              buf.set(b, bufLen);
              bufLen += b.byteLength;
            }
          }
        };

        ws.onclose = () => {
          if (mounted && !readyRef.current) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          if (mounted) {
            if (!readyRef.current) {
              reconnectTimer = setTimeout(connect, 3000);
            } else {
              onErrorRef.current();
            }
          }
        };

      } catch (e) {
        console.error("[MsePlayer] connect error:", e);
        if (mounted) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      if (msRef.current?.readyState === "open") {
        try { msRef.current.endOfStream(); } catch { /* ok */ }
      }
      msRef.current = null;
      if (videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  return (
    <div className="relative w-full h-full">
      {connecting && !ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
          <div className="w-4 h-4 border-2 border-white/10 border-t-cyan-400/50 rounded-full animate-spin" />
          <p className="text-[8px] text-white/20 font-medium">Connecting to stream…</p>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          "w-full h-full object-contain bg-black transition-opacity duration-500",
          ready ? "opacity-100" : "opacity-0",
          className
        )}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Snapshot Player — Periodic image refresh
   ═══════════════════════════════════════════════════════════════════════════ */
function SnapshotPlayer({
  paneId,
  interval,
  className,
  onError,
}: {
  paneId: string;
  interval: number;
  className?: string;
  onError: () => void;
}) {
  const [src, setSrc] = useState(`/api/streams/${encodeURIComponent(paneId)}/feed?t=${Date.now()}`);

  useEffect(() => {
    const iv = setInterval(() => {
      setSrc(`/api/streams/${encodeURIComponent(paneId)}/feed?t=${Date.now()}`);
    }, interval);
    return () => clearInterval(iv);
  }, [paneId, interval]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Camera snapshot"
      onError={onError}
      className={cn("w-full h-full object-contain bg-black", className)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Fullscreen Overlay — Portal-rendered, pinch-to-zoom
   ═══════════════════════════════════════════════════════════════════════════ */
function StreamFullscreen({
  open,
  onClose,
  config,
  paneId,
  cameraId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  config: StreamConfig;
  paneId: string;
  cameraId?: string;
  label: string;
}) {
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) setError(false);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95"
            onClick={onClose}
          />

          {/* Stream Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ touchAction: "pinch-zoom" }}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/20">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Live</span>
                </div>
                <p className="text-[13px] font-semibold text-white/80">{label}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-white/50" />
              </button>
            </div>

            {/* Stream — full viewport, pinch-to-zoom */}
            <div
              className="flex-1 flex items-center justify-center px-2 pb-8 overflow-hidden"
              style={{ touchAction: "pinch-zoom pan-x pan-y" }}
            >
              {error ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                    <WifiOff className="w-7 h-7 text-white/15" />
                  </div>
                  <p className="text-[13px] font-semibold text-white/30">Camera Offline</p>
                  <p className="text-[10px] text-white/15 max-w-[220px]">
                    Check that the camera app is running on the phone and both devices are on the same Wi-Fi
                  </p>
                  <button
                    onClick={() => setError(false)}
                    className="mt-2 px-4 py-2 rounded-xl bg-white/[0.06] text-[10px] font-semibold text-white/40 hover:text-white/60"
                  >
                    Retry
                  </button>
                </div>
              ) : config.protocol === "hls" ? (
                <HlsPlayer
                  url={config.url}
                  className="max-h-full rounded-2xl"
                  onError={() => setError(true)}
                />
              ) : config.protocol === "rtsp" && cameraId ? (
                <MsePlayer
                  cameraId={cameraId}
                  className="max-h-full w-auto rounded-2xl"
                  onError={() => setError(true)}
                />
              ) : config.protocol === "mjpeg" ? (
                <MjpegPlayer
                  paneId={paneId}
                  directUrl={config.url}
                  className="max-h-full w-auto rounded-2xl"
                  onError={() => setError(true)}
                />
              ) : (
                <SnapshotPlayer
                  paneId={paneId}
                  interval={config.refreshInterval ?? 5000}
                  className="max-h-full rounded-2xl"
                  onError={() => setError(true)}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Stream Widget — Dashboard pane card content
   ═══════════════════════════════════════════════════════════════════════════ */
export function StreamWidget({ pane }: { pane: PaneDef }) {
  // Resolve camera reference → StreamConfig (preferred over inline streamConfig)
  const cameras = useDashboardStore((s) => s.cameras);
  const config: StreamConfig | undefined = (() => {
    if (pane.cameraId) {
      const cam = cameras.find((c) => c.id === pane.cameraId);
      if (cam) return {
        url: cam.url,
        protocol: cam.protocol,
        label: cam.label,
        refreshInterval: 5000,
        username: cam.username,
        password: cam.password,
      };
    }
    return pane.streamConfig;
  })();
  // Check if this camera has ONVIF motion detection enabled
  const motionEnabled = (() => {
    if (pane.cameraId) {
      const cam = cameras.find((c) => c.id === pane.cameraId);
      return cam?.motionDetection?.enabled ?? false;
    }
    return false;
  })();
  const label = pane.labelOverride ?? config?.label ?? "Camera";
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const handleError = useCallback(() => setError(true), []);
  const handleLoad = useCallback(() => setLoaded(true), []);

  const hasUrl = !!config?.url;

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-2 cursor-pointer group",
          "active:scale-[0.97] transition-transform"
        )}
        onClick={() => hasUrl && !error && setFullscreen(true)}
      >
        {/* Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[13px] font-semibold text-white/85 truncate">{label}</p>
            {hasUrl && !error && loaded && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[7px] font-bold text-red-400/80 uppercase tracking-wider">Live</span>
              </div>
            )}
          </div>
          {hasUrl && !error && (
            <Maximize2 className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors shrink-0" />
          )}
        </div>

        {/* Preview */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/40">
          {!hasUrl ? (
            /* No stream configured */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                <Video className="w-5 h-5 text-white/10" />
              </div>
              <p className="text-[10px] text-white/15 font-medium">No camera configured</p>
              <p className="text-[8px] text-white/10 text-center px-4 leading-relaxed">
                Add a camera URL in Config → Panes
              </p>
            </div>
          ) : error ? (
            /* Camera offline */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <VideoOff className="w-5 h-5 text-red-400/30" />
              <p className="text-[9px] text-red-400/40 font-medium">Camera offline</p>
              <button
                onClick={(e) => { e.stopPropagation(); setError(false); setLoaded(false); }}
                className="text-[8px] text-white/20 hover:text-white/40 underline"
              >
                Retry
              </button>
            </div>
          ) : config.protocol === "hls" ? (
            <HlsPlayer url={config.url} onError={handleError} />
          ) : config.protocol === "rtsp" && pane.cameraId ? (
            <MsePlayer
              cameraId={pane.cameraId}
              onError={handleError}
              onLoad={handleLoad}
            />
          ) : config.protocol === "mjpeg" ? (
            <MjpegPlayer
              paneId={pane.id}
              directUrl={config.url}
              onError={handleError}
              onLoad={handleLoad}
            />
          ) : (
            <SnapshotPlayer
              paneId={pane.id}
              interval={config.refreshInterval ?? 5000}
              onError={handleError}
            />
          )}

          {/* ONVIF Motion Detection Indicator */}
          {pane.cameraId && motionEnabled && (
            <MotionIndicator
              cameraId={pane.cameraId}
              enabled={motionEnabled}
              className="absolute top-2 right-2 z-10"
            />
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {config && (
        <StreamFullscreen
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          config={config}
          paneId={pane.id}
          cameraId={pane.cameraId}
          label={label}
        />
      )}
    </>
  );
}
