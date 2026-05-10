/**
 * Camera Snapshot API
 *
 * GET /api/cameras/[cameraId]/snapshot
 *
 * Grabs a single JPEG frame from the camera's MJPEG stream and returns it.
 * Used by the Zone Editor to show a static snapshot for zone drawing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCamera } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await params;
  const camera = getCamera(cameraId);

  if (!camera) {
    return NextResponse.json({ error: "Camera not found" }, { status: 404 });
  }

  if (!camera.url) {
    return NextResponse.json({ error: "No URL configured" }, { status: 400 });
  }

  try {
    // Grab a single frame from the MJPEG stream
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(camera.url, {
      signal: controller.signal,
    });

    if (!upstream.ok) {
      clearTimeout(timeout);
      return NextResponse.json({ error: `Camera returned ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // If it's a direct JPEG image, return it immediately
    if (contentType.includes("image/jpeg") || contentType.includes("image/png")) {
      clearTimeout(timeout);
      const blob = await upstream.arrayBuffer();
      return new NextResponse(blob, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // If it's MJPEG, extract first frame
    if (contentType.includes("multipart") || contentType.includes("mjpeg")) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        clearTimeout(timeout);
        return NextResponse.json({ error: "No stream body" }, { status: 502 });
      }

      let buffer = new Uint8Array(0);
      const maxBytes = 2 * 1024 * 1024; // 2MB max

      while (buffer.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append chunk
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

          const jpeg = buffer.slice(soi, eoi + 2);
          return new NextResponse(jpeg, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          });
        }
      }

      reader.cancel();
      clearTimeout(timeout);
      return NextResponse.json({ error: "Failed to extract frame" }, { status: 502 });
    }

    clearTimeout(timeout);
    return NextResponse.json({ error: `Unsupported content type: ${contentType}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Snapshot failed: ${msg}` }, { status: 502 });
  }
}

/** Find a byte marker pattern in a Uint8Array */
function findMarker(buf: Uint8Array, marker: number[], startFrom = 0): number {
  for (let i = startFrom; i <= buf.length - marker.length; i++) {
    let found = true;
    for (let j = 0; j < marker.length; j++) {
      if (buf[i + j] !== marker[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}
