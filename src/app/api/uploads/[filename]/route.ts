/**
 * GET /api/uploads/[filename] — Serve uploaded files from the uploads directory.
 * Next.js doesn't serve dynamically-added files from public/ at runtime,
 * so we need this API route to serve them.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Must match the path in ../route.ts — persistent storage outside the app directory
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ?? (process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "..", "enclosure-data", "uploads")
    : path.join(process.cwd(), "public", "uploads"));

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize filename (prevent directory traversal)
  const safe = path.basename(filename);
  const filepath = path.join(UPLOAD_DIR, safe);

  try {
    const buffer = await readFile(filepath);
    const ext = safe.split(".").pop()?.toLowerCase() ?? "jpg";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
