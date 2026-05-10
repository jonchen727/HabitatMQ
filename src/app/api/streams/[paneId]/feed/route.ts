/**
 * MJPEG Stream Proxy — Zero-overhead passthrough.
 *
 * Proxies an MJPEG (or snapshot) stream from a camera on the local network
 * to the browser. This lets remote dashboard viewers see cameras that are
 * only accessible from the Pi's network.
 *
 * Flow:  iPhone (SimpleIPCamera) → Wi-Fi → Pi (this proxy) → Browser
 *
 * GET /api/streams/[paneId]/feed
 *   Reads the pane's streamConfig.url, fetches it, and pipes the response
 *   body directly to the client with the correct Content-Type.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

interface StreamConfig {
  url: string;
  protocol: "hls" | "mjpeg" | "img";
  refreshInterval?: number;
  label?: string;
}

interface PaneDef {
  id: string;
  displayType: string;
  streamConfig?: StreamConfig;
  [key: string]: unknown;
}

async function getPaneConfig(paneId: string): Promise<PaneDef | null> {
  try {
    // Try all profile directories to find the pane
    const profilesDir = path.join(DATA_DIR, "profiles");
    let profiles: string[] = [];
    try {
      profiles = await fs.readdir(profilesDir);
    } catch {
      // Fallback: try root data/panes.json
      const rootPanes = path.join(DATA_DIR, "panes.json");
      const data = JSON.parse(await fs.readFile(rootPanes, "utf-8"));
      return (data as PaneDef[]).find((p) => p.id === paneId) ?? null;
    }

    for (const profileDir of profiles) {
      try {
        const panesPath = path.join(profilesDir, profileDir, "panes.json");
        const data = JSON.parse(await fs.readFile(panesPath, "utf-8"));
        const pane = (data as PaneDef[]).find((p) => p.id === paneId);
        if (pane) return pane;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paneId: string }> }
) {
  const { paneId } = await params;
  const pane = await getPaneConfig(paneId);

  if (!pane?.streamConfig?.url) {
    return NextResponse.json(
      { error: "Stream not configured", paneId },
      { status: 404 }
    );
  }

  const { url, protocol } = pane.streamConfig;

  try {
    // Fetch upstream stream from the camera
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

    // Determine content type
    const upstreamContentType = upstream.headers.get("content-type");
    let contentType: string;

    if (protocol === "mjpeg") {
      // Preserve the multipart boundary from the upstream MJPEG stream
      contentType = upstreamContentType ?? "multipart/x-mixed-replace; boundary=frame";
    } else if (protocol === "img") {
      contentType = upstreamContentType ?? "image/jpeg";
    } else {
      contentType = upstreamContentType ?? "application/octet-stream";
    }

    // Pipe the upstream body directly to the client — zero transcoding
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
