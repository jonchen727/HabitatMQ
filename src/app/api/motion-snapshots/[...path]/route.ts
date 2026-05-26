/**
 * Motion Snapshot Serving API
 *
 * GET /api/motion-snapshots/{cameraId}/{startTs}/{filename}.jpg
 *
 * Serves JPEG snapshot files captured during motion events.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { SNAPSHOT_BASE } from "@/lib/motion-snapshots";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Validate path segments to prevent directory traversal
  for (const seg of segments) {
    if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
  }

  const filePath = path.join(SNAPSHOT_BASE, ...segments);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400", // immutable — snapshots don't change
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read snapshot" }, { status: 500 });
  }
}
