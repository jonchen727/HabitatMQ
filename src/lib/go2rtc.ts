/**
 * go2rtc Client — Manages camera streams via go2rtc's REST API.
 *
 * go2rtc restreams RTSP → MSE/WebRTC with zero transcoding.
 * The browser decodes H264 natively, so CPU usage is ~0% vs 300%+ with ffmpeg.
 *
 * API reference: https://github.com/AlexxIT/go2rtc
 */

const GO2RTC_HOST = process.env.GO2RTC_HOST ?? "localhost";
const GO2RTC_PORT = process.env.GO2RTC_PORT ?? "1984";
const GO2RTC_BASE = `http://${GO2RTC_HOST}:${GO2RTC_PORT}`;

/** Sanitize camera ID into a go2rtc-safe stream name */
function streamName(cameraId: string): string {
  return cameraId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Check if a stream already exists in go2rtc.
 * Used to avoid re-registering (which resets the producer and kills active consumers).
 */
export async function streamExists(cameraId: string): Promise<boolean> {
  const name = streamName(cameraId);
  try {
    const res = await fetch(`${GO2RTC_BASE}/api/streams`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const streams = await res.json();
    return name in streams;
  } catch {
    return false;
  }
}

/** Build full RTSP URL with credentials injected */
function buildRtspUrl(
  baseUrl: string,
  username?: string,
  password?: string
): string {
  if (!username) return baseUrl;
  const cred = password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}`
    : encodeURIComponent(username);
  return baseUrl.replace(/^rtsp:\/\//, `rtsp://${cred}@`);
}

/**
 * Build an ONVIF source URL for go2rtc.
 * go2rtc auto-discovers the best RTSP stream via the camera's ONVIF profiles.
 * Format: onvif://user:pass@ip:port?profile=token
 */
function buildOnvifUrl(
  ip: string,
  port: number,
  username?: string,
  password?: string,
  profile?: string,
): string {
  const cred = username
    ? (password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : `${encodeURIComponent(username)}@`)
    : "";
  const profileParam = profile ? `?profile=${encodeURIComponent(profile)}` : "";
  return `onvif://${cred}${ip}:${port}${profileParam}`;
}

/** Options for registering a stream — mirrors CameraDef fields */
export interface RegisterStreamOpts {
  cameraId: string;
  url: string;
  username?: string;
  password?: string;
  useOnvif?: boolean;
  onvifPort?: number;
  onvifProfile?: string;
  /** IP address — extracted from url if not provided */
  ip?: string;
}

/**
 * Register (or update) a camera stream in go2rtc.
 * Supports two modes:
 *   - RTSP: rtsp://user:pass@ip/stream1#video=copy#audio=opus
 *   - ONVIF: onvif://user:pass@ip:port?profile=token (go2rtc auto-negotiates stream)
 */
export async function registerStream(opts: RegisterStreamOpts): Promise<boolean>;
/** @deprecated Use object form. Kept for backward-compat. */
export async function registerStream(cameraId: string, rtspUrl: string, username?: string, password?: string): Promise<boolean>;
export async function registerStream(
  cameraIdOrOpts: string | RegisterStreamOpts,
  rtspUrl?: string,
  username?: string,
  password?: string,
): Promise<boolean> {
  // Normalize to opts
  const opts: RegisterStreamOpts = typeof cameraIdOrOpts === "string"
    ? { cameraId: cameraIdOrOpts, url: rtspUrl ?? "", username, password }
    : cameraIdOrOpts;

  const name = streamName(opts.cameraId);
  let srcUrl: string;

  if (opts.useOnvif) {
    // ONVIF mode — go2rtc discovers the stream via ONVIF protocol
    const ip = opts.ip ?? extractIpFromUrl(opts.url);
    srcUrl = buildOnvifUrl(ip, opts.onvifPort ?? 2020, opts.username, opts.password, opts.onvifProfile);
  } else {
    // RTSP mode — direct stream URL
    const fullUrl = buildRtspUrl(opts.url, opts.username, opts.password);
    // go2rtc stream modifiers:
    // #video=copy  — passthrough H264 (no transcode)
    // #audio=opus  — transcode camera audio (usually PCMA/G.711) to Opus for MSE browser compat
    srcUrl = `${fullUrl}#video=copy#audio=opus`;
  }

  try {
    const res = await fetch(
      `${GO2RTC_BASE}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(srcUrl)}`,
      { method: "PUT" }
    );
    console.log(`[go2rtc] registered stream ${name} (${opts.useOnvif ? "onvif" : "rtsp"}): ${res.ok ? "ok" : res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`[go2rtc] failed to register stream ${name}:`, err);
    return false;
  }
}

/**
 * Remove a camera stream from go2rtc.
 * Called when a camera is deleted in the UI.
 */
export async function unregisterStream(cameraId: string): Promise<boolean> {
  const name = streamName(cameraId);
  try {
    const res = await fetch(
      `${GO2RTC_BASE}/api/streams?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    console.log(`[go2rtc] unregistered stream ${name}: ${res.ok ? "ok" : res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`[go2rtc] failed to unregister stream ${name}:`, err);
    return false;
  }
}

/** Extract IP address from an RTSP/HTTP URL */
function extractIpFromUrl(url: string): string {
  const match = url.match(/(?:rtsp|http|https):\/\/(?:[^@]+@)?([^/:]+)/);
  return match?.[1] ?? "localhost";
}

/**
 * Sync all cameras from the DB to go2rtc.
 * Called on server startup to ensure go2rtc has all streams registered.
 */
export async function syncAllStreams(): Promise<void> {
  try {
    const { listCameras } = await import("@/lib/db");
    const cameras = listCameras();
    for (const cam of cameras) {
      if (cam.enabled && (cam.url || cam.useOnvif) && (cam.protocol === "rtsp" || cam.useOnvif)) {
        await registerStream({
          cameraId: cam.id,
          url: cam.url,
          username: cam.username,
          password: cam.password,
          useOnvif: cam.useOnvif,
          onvifPort: cam.onvifPort,
          onvifProfile: cam.onvifProfile,
        });
      }
    }
    console.log(`[go2rtc] synced ${cameras.length} camera(s)`);
  } catch (err) {
    console.error("[go2rtc] sync failed:", err);
  }
}

/**
 * Check if go2rtc is reachable.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${GO2RTC_BASE}/api`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get the WebSocket URL for MSE streaming.
 * This is what the browser connects to for zero-transcode H264 playback.
 */
export function getMseWsUrl(cameraId: string): string {
  const name = streamName(cameraId);
  return `ws://${GO2RTC_HOST}:${GO2RTC_PORT}/api/ws?src=${encodeURIComponent(name)}`;
}

/**
 * Get the go2rtc stream viewer URL (built-in player for debugging).
 */
export function getStreamViewerUrl(cameraId: string): string {
  const name = streamName(cameraId);
  return `http://${GO2RTC_HOST}:${GO2RTC_PORT}/stream.html?src=${encodeURIComponent(name)}&mode=mse`;
}

export { streamName, GO2RTC_HOST, GO2RTC_PORT };
