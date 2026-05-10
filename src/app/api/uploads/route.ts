/**
 * POST /api/uploads
 * Accept a multipart file upload, save to public/uploads/, return the URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const hash = crypto.randomBytes(8).toString("hex");
    const filename = `${Date.now()}-${hash}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const url = `/api/uploads/${filename}`;
    return NextResponse.json({ url, filename });
  } catch (err) {
    console.error("[uploads] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
