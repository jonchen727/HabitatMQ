/**
 * Motion Snapshot Capture Service
 *
 * Captures JPEG frames at ~1fps from a camera's MJPEG stream during active
 * motion events. Snapshots are stored to disk and logged to the motion_events
 * table so the history chart can display them on hover.
 *
 * Each motion event creates a folder: {cameraId}/{startTs}/
 * Frames are named by their capture timestamp: {ts}.jpg
 *
 * Storage: enclosure-data/motion-snapshots/ (production)
 *          public/motion-snapshots/ (dev)
 */

import path from "path";
import fs from "fs";
import type { CameraDef } from "@/lib/schema";

// ─── Storage Config ──────────────────────────────────────────────────────────

export const SNAPSHOT_BASE = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "..", "enclosure-data", "motion-snapshots")
  : path.join(process.cwd(), "public", "motion-snapshots");

// ─── Active Capture Sessions ────────────────────────────────────────────────

interface CaptureSession {
  cameraId: string;
  startTs: number;
  timer: ReturnType<typeof setInterval>;
  snapshotDir: string;
  frameCount: number;
  maxFrames: number;   // safety cap: stop after N frames (~N seconds)
}

const activeSessions = new Map<string, CaptureSession>();

// Max duration of continuous capture (120 seconds)
const MAX_CAPTURE_SECONDS = 120;
// Capture interval
const CAPTURE_INTERVAL_MS = 1000; // 1fps
// Thumbnail quality — small enough for quick hover, big enough to see detail
const SNAPSHOT_MAX_DIM = 640; // px long edge
const JPEG_QUALITY = 70;

/**
 * Start capturing screenshots for a motion event.
 * Called when motion=true is detected.
 * Returns the relative path prefix for the capture session.
 */
export function startMotionCapture(camera: CameraDef): string | null {
  const { id } = camera;

  // Don't double-start
  if (activeSessions.has(id)) {
    console.log(`[motion-snapshots] capture already active for ${id}`);
    return null;
  }

  const startTs = Date.now();
  const relDir = path.join(id, String(startTs));
  const absDir = path.join(SNAPSHOT_BASE, relDir);

  // Ensure directory exists
  try {
    fs.mkdirSync(absDir, { recursive: true });
  } catch (err) {
    console.error(`[motion-snapshots] failed to create dir ${absDir}:`, err);
    return null;
  }

  const session: CaptureSession = {
    cameraId: id,
    startTs,
    timer: setInterval(() => captureFrame(camera, session), CAPTURE_INTERVAL_MS),
    snapshotDir: absDir,
    frameCount: 0,
    maxFrames: MAX_CAPTURE_SECONDS,
  };

  activeSessions.set(id, session);
  console.log(`[motion-snapshots] started capture for ${id} → ${relDir}`);

  // Capture first frame immediately (don't wait 1s)
  captureFrame(camera, session);

  return relDir;
}

/**
 * Stop capturing screenshots for a camera.
 * Called when motion=false is detected.
 * Returns the snapshot directory path (relative) and frame count.
 */
export function stopMotionCapture(cameraId: string): { relDir: string; frames: number } | null {
  const session = activeSessions.get(cameraId);
  if (!session) return null;

  clearInterval(session.timer);
  activeSessions.delete(cameraId);

  const relDir = path.join(session.cameraId, String(session.startTs));
  console.log(`[motion-snapshots] stopped capture for ${cameraId} — ${session.frameCount} frames`);

  return { relDir, frames: session.frameCount };
}

/**
 * Get the snapshot URL for serving from the API.
 */
export function getSnapshotUrl(relPath: string): string {
  return `/api/motion-snapshots/${relPath}`;
}

/**
 * List all snapshot frames in a motion event directory.
 */
export function listSnapshotFrames(relDir: string): string[] {
  const absDir = path.join(SNAPSHOT_BASE, relDir);
  try {
    if (!fs.existsSync(absDir)) return [];
    return fs.readdirSync(absDir)
      .filter(f => f.endsWith(".jpg"))
      .sort()
      .map(f => path.join(relDir, f));
  } catch {
    return [];
  }
}

// ─── Internal Frame Capture ─────────────────────────────────────────────────

async function captureFrame(camera: CameraDef, session: CaptureSession): Promise<void> {
  // Safety cap
  if (session.frameCount >= session.maxFrames) {
    console.log(`[motion-snapshots] max frames reached for ${camera.id}, stopping`);
    stopMotionCapture(camera.id);
    return;
  }

  try {
    const frameTs = Date.now();
    const framePath = path.join(session.snapshotDir, `${frameTs}.jpg`);

    // Grab a frame from the camera's MJPEG stream
    const jpegBuffer = await grabMjpegFrame(camera);
    if (!jpegBuffer) return;

    // Resize to thumbnail — use sharp if available, otherwise save raw
    let outputBuffer: Buffer;
    try {
      const sharp = (await import("sharp")).default;
      outputBuffer = await sharp(jpegBuffer)
        .resize(SNAPSHOT_MAX_DIM, SNAPSHOT_MAX_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
    } catch {
      // sharp not available (unlikely on Pi but safe fallback)
      outputBuffer = jpegBuffer;
    }

    fs.writeFileSync(framePath, outputBuffer);
    session.frameCount++;
  } catch (err) {
    console.error(`[motion-snapshots] frame capture failed for ${camera.id}:`, err);
  }
}

/**
 * Grab a single JPEG frame from a camera.
 *
 * Strategy:
 *  1. go2rtc frame API — works for RTSP streams (go2rtc is already decoding)
 *  2. Direct HTTP/MJPEG fetch — fallback for non-go2rtc cameras
 */
async function grabMjpegFrame(camera: CameraDef): Promise<Buffer | null> {
  // ── Try go2rtc first (handles RTSP streams) ──
  try {
    const go2rtcHost = process.env.GO2RTC_HOST ?? "localhost";
    const go2rtcPort = process.env.GO2RTC_PORT ?? "1984";
    // go2rtc stream name = sanitized camera ID (same as go2rtc.ts streamName)
    const streamName = camera.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const go2rtcUrl = `http://${go2rtcHost}:${go2rtcPort}/api/frame.jpeg?src=${encodeURIComponent(streamName)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(go2rtcUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("image/jpeg") || contentType.includes("image/png")) {
        return Buffer.from(await res.arrayBuffer());
      }
    }
  } catch {
    // go2rtc not available or stream not registered — fall through
  }

  // ── Fallback: direct HTTP/MJPEG fetch ──
  if (!camera.url || camera.url.startsWith("rtsp://")) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const upstream = await fetch(camera.url, { signal: controller.signal });
    if (!upstream.ok) { clearTimeout(timeout); return null; }

    const contentType = upstream.headers.get("content-type") || "";

    // Direct JPEG
    if (contentType.includes("image/jpeg") || contentType.includes("image/png")) {
      clearTimeout(timeout);
      return Buffer.from(await upstream.arrayBuffer());
    }

    // MJPEG stream — extract first frame
    if (contentType.includes("multipart") || contentType.includes("mjpeg")) {
      const reader = upstream.body?.getReader();
      if (!reader) { clearTimeout(timeout); return null; }

      let buffer = new Uint8Array(0);
      const maxBytes = 1 * 1024 * 1024; // 1MB max per frame

      while (buffer.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;

        const newBuf = new Uint8Array(buffer.length + value.length);
        newBuf.set(buffer);
        newBuf.set(value, buffer.length);
        buffer = newBuf;

        // Look for JPEG SOI + EOI markers
        const soi = findMarker(buffer, [0xff, 0xd8]);
        const eoi = findMarker(buffer, [0xff, 0xd9], soi);

        if (soi !== -1 && eoi !== -1 && eoi > soi) {
          reader.cancel();
          clearTimeout(timeout);
          return Buffer.from(buffer.slice(soi, eoi + 2));
        }
      }

      reader.cancel();
    }

    clearTimeout(timeout);
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function findMarker(buf: Uint8Array, marker: number[], startFrom = 0): number {
  for (let i = startFrom; i <= buf.length - marker.length; i++) {
    let found = true;
    for (let j = 0; j < marker.length; j++) {
      if (buf[i + j] !== marker[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
