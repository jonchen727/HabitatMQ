/**
 * Stream Feed Proxy — MJPEG passthrough + RTSP→MJPEG transcoding.
 *
 * Proxies camera streams from the local network to the browser.
 * Supports three modes:
 *
 *   mjpeg / img — HTTP fetch passthrough (zero overhead)
 *   rtsp        — ffmpeg child process transcodes RTSP→MJPEG
 *   hls         — HTTP fetch passthrough (browser handles HLS.js)
 *
 * Credentials (username/password) are injected server-side into the
 * upstream URL — the browser never sees them.
 *
 * GET /api/streams/[paneId]/feed
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn, type ChildProcess } from "child_process";

// ── Track active ffmpeg processes for cleanup ────────────────────────────────
const activeProcesses = new Map<string, ChildProcess>();

interface StreamConfig {
  url: string;
  protocol: "hls" | "mjpeg" | "img" | "rtsp";
  refreshInterval?: number;
  label?: string;
  username?: string;
  password?: string;
}

interface PaneDef {
  id: string;
  displayType: string;
  cameraId?: string;
  streamConfig?: StreamConfig;
  [key: string]: unknown;
}

/**
 * Inject username:password into a URL if credentials are provided.
 * Handles both http(s):// and rtsp:// schemes.
 */
function buildAuthUrl(baseUrl: string, username?: string, password?: string): string {
  if (!username) return baseUrl;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.username) return baseUrl;
    parsed.username = encodeURIComponent(username);
    if (password) parsed.password = encodeURIComponent(password);
    return parsed.toString();
  } catch {
    // Non-standard scheme (rtsp://) — inject manually
    const cred = password ? `${username}:${password}` : username;
    return baseUrl.replace(/^(rtsp|http|https):\/\//, `$1://${cred}@`);
  }
}

async function getPaneConfig(paneId: string): Promise<PaneDef | null> {
  try {
    const { getPane } = await import("@/lib/db");
    const pane = getPane(paneId);
    return pane as PaneDef | null;
  } catch {
    return null;
  }
}

// ── RTSP → MJPEG via ffmpeg ──────────────────────────────────────────────────

function spawnRtspProxy(paneId: string, rtspUrl: string): ReadableStream {
  // Kill any existing process for this pane
  const existing = activeProcesses.get(paneId);
  if (existing) {
    existing.kill("SIGTERM");
    activeProcesses.delete(paneId);
  }

  const boundary = "ffmpeg_mjpeg_boundary";

  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "warning",
    // Input: RTSP over TCP (more reliable than UDP for NAT'd cameras)
    "-rtsp_transport", "tcp",
    "-i", rtspUrl,
    // Transcode to MJPEG — low-latency settings
    "-an",                        // drop audio
    "-c:v", "mjpeg",              // MJPEG codec
    "-q:v", "5",                  // quality (2=best, 31=worst) — 5 is sharp
    "-r", "10",                   // cap at 10fps to save Pi CPU
    "-f", "mpjpeg",               // multipart JPEG output
    "-boundary_tag", boundary,    // custom boundary for Content-Type header
    "pipe:1",                     // output to stdout
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeProcesses.set(paneId, ffmpeg);

  // Log stderr for debugging (ffmpeg warnings/errors)
  ffmpeg.stderr.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[rtsp-proxy:${paneId}] ${msg}`);
  });

  ffmpeg.on("close", (code) => {
    activeProcesses.delete(paneId);
    if (code && code !== 0 && code !== 255) {
      console.error(`[rtsp-proxy:${paneId}] ffmpeg exited with code ${code}`);
    }
  });

  // Convert Node stream → Web ReadableStream
  const nodeStream = ffmpeg.stdout;

  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          // Stream was cancelled by client
          ffmpeg.kill("SIGTERM");
        }
      });

      nodeStream.on("end", () => {
        try { controller.close(); } catch { /* already closed */ }
      });

      nodeStream.on("error", (err) => {
        console.error(`[rtsp-proxy:${paneId}] stream error:`, err.message);
        try { controller.error(err); } catch { /* already closed */ }
      });
    },
    cancel() {
      // Client disconnected — kill ffmpeg
      ffmpeg.kill("SIGTERM");
      activeProcesses.delete(paneId);
    },
  });
}

// ── HTTP handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paneId: string }> }
) {
  const { paneId } = await params;
  const pane = await getPaneConfig(paneId);

  if (!pane) {
    return NextResponse.json(
      { error: "Pane not found", paneId },
      { status: 404 }
    );
  }

  // Resolve stream config: cameraId → camera DB lookup, or inline streamConfig
  let streamUrl: string | undefined;
  let streamProtocol: string | undefined;
  let streamUsername: string | undefined;
  let streamPassword: string | undefined;

  if (pane.cameraId) {
    // Dynamic import to avoid bundling db in client
    const { getCamera } = await import("@/lib/db");
    const cam = getCamera(pane.cameraId);
    if (!cam) {
      return NextResponse.json(
        { error: "Camera not found", cameraId: pane.cameraId },
        { status: 404 }
      );
    }
    streamUrl = cam.url;
    streamProtocol = cam.protocol;
    streamUsername = cam.username;
    streamPassword = cam.password;
  } else if (pane.streamConfig?.url) {
    streamUrl = pane.streamConfig.url;
    streamProtocol = pane.streamConfig.protocol;
    streamUsername = pane.streamConfig.username;
    streamPassword = pane.streamConfig.password;
  }

  if (!streamUrl) {
    return NextResponse.json(
      { error: "Stream not configured", paneId },
      { status: 404 }
    );
  }

  const url = buildAuthUrl(streamUrl, streamUsername, streamPassword);
  const protocol = streamProtocol ?? "mjpeg";

  // ── RTSP mode: spawn ffmpeg to transcode ───────────────────────────────
  if (protocol === "rtsp") {
    try {
      const boundary = "ffmpeg_mjpeg_boundary";
      const stream = spawnRtspProxy(paneId, url);

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: "Failed to start RTSP proxy", detail: message },
        { status: 502 }
      );
    }
  }

  // ── HTTP modes: fetch passthrough (mjpeg, img, hls) ────────────────────
  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Camera offline or unreachable", status: upstream.status },
        { status: 502 }
      );
    }

    const upstreamContentType = upstream.headers.get("content-type");
    let contentType: string;

    if (protocol === "mjpeg") {
      contentType = upstreamContentType ?? "multipart/x-mixed-replace; boundary=frame";
    } else if (protocol === "img") {
      contentType = upstreamContentType ?? "image/jpeg";
    } else {
      contentType = upstreamContentType ?? "application/octet-stream";
    }

    return new Response(upstream.body as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect to camera", detail: message },
      { status: 502 }
    );
  }
}
