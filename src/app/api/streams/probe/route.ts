/**
 * Camera Probe API — Auto-detect RTSP streams and ONVIF profiles.
 *
 * POST /api/streams/probe
 *   Body: { ip: string, port?: number, username?: string, password?: string }
 *
 * Returns detected streams with codec info, resolution, and RTSP URLs.
 * Tries both RTSP (ffprobe) and ONVIF (SOAP GetProfiles + GetStreamUri).
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash, randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

interface ProbeResult {
  success: boolean;
  /** Detected streams — high quality first */
  streams: DetectedStream[];
  /** ONVIF device info if available */
  onvif?: OnvifInfo;
  /** Raw errors for debugging */
  errors: string[];
}

interface DetectedStream {
  url: string;
  label: string;
  codec: string;        // "h264", "h265", "mjpeg", etc.
  width: number;
  height: number;
  fps: number;
  source: "rtsp" | "onvif";
  /** ONVIF profile token — used for go2rtc onvif:// registration */
  profileToken?: string;
}

interface OnvifInfo {
  manufacturer?: string;
  model?: string;
  profiles: string[];
  /** Status of the ONVIF probe for UI feedback */
  status: "ok" | "auth_failed" | "unreachable" | "error";
  statusMessage?: string;
  /** Whether the camera supports ONVIF Event Service (motion detection) */
  supportsEvents?: boolean;
}

// ── RTSP Probing via ffprobe ─────────────────────────────────────────────────

async function probeRtsp(
  ip: string,
  port: number,
  streamPath: string,
  username?: string,
  password?: string,
): Promise<DetectedStream | null> {
  const cred = username ? (password ? `${username}:${password}@` : `${username}@`) : "";
  const url = `rtsp://${cred}${ip}:${port}${streamPath}`;

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-rtsp_transport", "tcp",
      "-timeout", "5000000",       // 5 second timeout (in microseconds)
      "-show_streams",
      "-show_format",
      "-of", "json",
      url,
    ], { timeout: 10_000 });

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: Record<string, unknown>) => s.codec_type === "video");

    if (!videoStream) return null;

    const fps = (() => {
      const rFps = videoStream.r_frame_rate;
      if (!rFps) return 0;
      const parts = rFps.split("/");
      if (parts.length === 2) return Math.round(parseInt(parts[0]) / parseInt(parts[1]));
      return parseFloat(rFps) || 0;
    })();

    return {
      url: `rtsp://${ip}:${port}${streamPath}`,  // URL without credentials
      label: streamPath === "/stream1" ? "High Quality" : streamPath === "/stream2" ? "Standard Quality" : streamPath,
      codec: (videoStream.codec_name || "unknown").toLowerCase(),
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      fps,
      source: "rtsp",
    };
  } catch {
    return null;
  }
}

// ── WS-Security UsernameToken Digest ─────────────────────────────────────────

function buildWsSecurityHeader(username: string, password: string): string {
  const nonce = randomBytes(16);
  const created = new Date().toISOString();

  // Digest = Base64(SHA-1(nonce + created + password))
  const hash = createHash("sha1");
  hash.update(Buffer.concat([
    nonce,
    Buffer.from(created, "utf-8"),
    Buffer.from(password, "utf-8"),
  ]));
  const digest = hash.digest("base64");
  const nonceB64 = nonce.toString("base64");

  return `
  <s:Header>
    <Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" s:mustUnderstand="true">
      <UsernameToken>
        <Username>${username}</Username>
        <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password>
        <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceB64}</Nonce>
        <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created>
      </UsernameToken>
    </Security>
  </s:Header>`;
}

function buildSoapEnvelope(body: string, username?: string, password?: string): string {
  const secHeader = (username && password) ? buildWsSecurityHeader(username, password) : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  ${secHeader}
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

// ── ONVIF Probing via SOAP ───────────────────────────────────────────────────

const ONVIF_MEDIA_NS = "http://www.onvif.org/ver10/media/wsdl";
const ONVIF_SCHEMA_NS = "http://www.onvif.org/ver10/schema";

async function soapRequest(
  url: string,
  action: string,
  body: string,
  username?: string,
  password?: string,
  timeout = 5000,
): Promise<string> {
  const envelope = buildSoapEnvelope(body, username, password);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml;charset=UTF-8",
      "SOAPAction": action,
    },
    body: envelope,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await resp.text();
  // Check for ONVIF auth failures
  if (text.includes("NotAuthorized") || text.includes("sender not authorized") || resp.status === 401) {
    throw new Error("ONVIF_AUTH_FAILED");
  }
  return text;
}

/** Extract text content between XML tags (simple regex — no XML parser needed) */
function xmlExtract(xml: string, tag: string): string[] {
  const regex = new RegExp(`<[^>]*?${tag}[^>]*?>([^<]*)<`, "gi");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml))) {
    if (m[1]?.trim()) matches.push(m[1].trim());
  }
  return matches;
}

/** Extract attribute value from XML tag */
function xmlAttr(xml: string, tag: string, attr: string): string[] {
  const regex = new RegExp(`<[^>]*?${tag}[^>]*?${attr}="([^"]*)"`, "gi");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml))) {
    if (m[1]?.trim()) matches.push(m[1].trim());
  }
  return matches;
}

async function probeOnvif(
  ip: string,
  port: number,
  username?: string,
  password?: string,
): Promise<{ streams: DetectedStream[]; info?: OnvifInfo }> {
  const result: { streams: DetectedStream[]; info?: OnvifInfo } = { streams: [] };
  const mediaUrl = `http://${ip}:${port}/onvif/media_service`;

  try {
    // Step 1: GetProfiles — discover available media profiles
    const profilesXml = await soapRequest(
      mediaUrl,
      `${ONVIF_MEDIA_NS}/GetProfiles`,
      `<GetProfiles xmlns="${ONVIF_MEDIA_NS}"/>`,
      username,
      password,
    );

    // Extract profile tokens
    const tokens = xmlAttr(profilesXml, "Profiles", "token");
    const profileNames = xmlExtract(profilesXml, "Name");

    // Extract resolution info from profiles
    const widths = xmlExtract(profilesXml, "Width");
    const heights = xmlExtract(profilesXml, "Height");

    result.info = {
      profiles: tokens,
      status: "ok",
    };

    // Step 2: GetStreamUri for each profile
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        const uriXml = await soapRequest(
          mediaUrl,
          `${ONVIF_MEDIA_NS}/GetStreamUri`,
          `<GetStreamUri xmlns="${ONVIF_MEDIA_NS}">
            <StreamSetup>
              <Stream xmlns="${ONVIF_SCHEMA_NS}">RTP-Unicast</Stream>
              <Transport xmlns="${ONVIF_SCHEMA_NS}"><Protocol>RTSP</Protocol></Transport>
            </StreamSetup>
            <ProfileToken>${token}</ProfileToken>
          </GetStreamUri>`,
          username,
          password,
        );

        const uris = xmlExtract(uriXml, "Uri");
        if (uris.length > 0) {
          let streamUrl = uris[0];
          // Replace embedded credentials or hostname with the known IP
          try {
            const parsed = new URL(streamUrl);
            parsed.hostname = ip;
            parsed.username = "";
            parsed.password = "";
            streamUrl = parsed.toString();
          } catch {
            // Keep original URL
          }

          result.streams.push({
            url: streamUrl,
            label: profileNames[i] || `Profile ${i + 1}`,
            codec: "auto",  // Will be detected by ffprobe later
            width: parseInt(widths[i]) || 0,
            height: parseInt(heights[i]) || 0,
            fps: 0,
            source: "onvif",
            profileToken: token,
          });
        }
      } catch {
        // Skip this profile
        continue;
      }
    }

    // Try to get device info
    try {
      const deviceUrl = `http://${ip}:${port}/onvif/device_service`;
      const infoXml = await soapRequest(
        deviceUrl,
        "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
        `<GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>`,
        username,
        password,
      );
      const manufacturers = xmlExtract(infoXml, "Manufacturer");
      const models = xmlExtract(infoXml, "Model");
      if (manufacturers.length) result.info!.manufacturer = manufacturers[0];
      if (models.length) result.info!.model = models[0];
    } catch {
      // Device info is optional
    }

    // Step 4: Probe Event Service — check if camera supports motion events
    try {
      const eventUrl = `http://${ip}:${port}/onvif/event_service`;
      const eventXml = await soapRequest(
        eventUrl,
        "http://www.onvif.org/ver10/events/wsdl/GetEventProperties",
        `<GetEventProperties xmlns="http://www.onvif.org/ver10/events/wsdl"/>`,
        username,
        password,
        3000,
      );
      // If we get any response with topics, events are supported
      const hasMotionTopic = eventXml.includes("CellMotionDetector") || eventXml.includes("MotionAlarm") || eventXml.includes("Motion");
      result.info!.supportsEvents = hasMotionTopic;
      if (!hasMotionTopic) {
        // Events endpoint exists but no motion topics
        result.info!.supportsEvents = eventXml.includes("TopicSet");
      }
    } catch {
      result.info!.supportsEvents = false;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ONVIF_AUTH_FAILED") {
      result.info = {
        profiles: [],
        status: "auth_failed",
        statusMessage: "ONVIF authentication failed — check camera account credentials",
      };
    } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
      result.info = {
        profiles: [],
        status: "unreachable",
        statusMessage: `ONVIF service unreachable on port ${port}`,
      };
    } else {
      result.info = {
        profiles: [],
        status: "error",
        statusMessage: `ONVIF error: ${msg}`,
      };
    }
  }

  return result;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { ip?: string; port?: number; onvifPort?: number; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ip, port = 554, onvifPort = 2020, username, password } = body;

  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 });
  }

  const result: ProbeResult = {
    success: false,
    streams: [],
    errors: [],
  };

  // ── Run RTSP and ONVIF probes in parallel ──────────────────────────────
  const [rtspResults, onvifResult] = await Promise.all([
    // Probe common RTSP paths
    Promise.all([
      probeRtsp(ip, port, "/stream1", username, password),
      probeRtsp(ip, port, "/stream2", username, password),
      probeRtsp(ip, port, "/", username, password),
    ]).catch((err) => {
      result.errors.push(`RTSP probe failed: ${err.message}`);
      return [null, null, null];
    }),

    // Probe ONVIF
    probeOnvif(ip, onvifPort, username, password).catch((err) => {
      result.errors.push(`ONVIF probe failed: ${err.message}`);
      return { streams: [] as DetectedStream[], info: undefined };
    }),
  ]);

  // Collect RTSP results
  for (const stream of rtspResults) {
    if (stream) result.streams.push(stream);
  }

  // Collect ONVIF results (avoid duplicates by checking URL path)
  if (onvifResult.info) result.onvif = onvifResult.info;
  for (const stream of onvifResult.streams) {
    const existing = result.streams.find((s) => {
      try {
        return new URL(s.url).pathname === new URL(stream.url).pathname;
      } catch { return false; }
    });
    if (!existing) {
      // ONVIF gave us a URL — try to ffprobe it for codec info
      const probed = await probeRtsp(ip, port, new URL(stream.url).pathname, username, password).catch(() => null);
      if (probed) {
        probed.label = stream.label; // Keep the ONVIF profile name
        probed.source = "onvif";
        result.streams.push(probed);
      } else {
        result.streams.push(stream);
      }
    }
  }

  // Sort: high quality (larger resolution) first
  result.streams.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  result.success = result.streams.length > 0;

  return NextResponse.json(result);
}
