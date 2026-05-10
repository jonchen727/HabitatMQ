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

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Video, VideoOff, X, Maximize2, WifiOff, Minimize2 } from "lucide-react";
import type { PaneDef, StreamConfig } from "@/lib/schema";

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
  // Use proxy URL so remote viewers can access the camera through the Pi
  const src = directUrl
    ? `/api/streams/${encodeURIComponent(paneId)}/feed?t=${Date.now()}`
    : "";

  if (!directUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Camera feed"
      onError={onError}
      onLoad={onLoad}
      className={cn("w-full h-full object-contain bg-black", className)}
    />
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
  label,
}: {
  open: boolean;
  onClose: () => void;
  config: StreamConfig;
  paneId: string;
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
  const config = pane.streamConfig;
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
        </div>
      </div>

      {/* Fullscreen overlay */}
      {config && (
        <StreamFullscreen
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          config={config}
          paneId={pane.id}
          label={label}
        />
      )}
    </>
  );
}
