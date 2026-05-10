/**
 * POST /api/uploads
 * Accept a multipart file upload, compress/convert to WebP, save to public/uploads/, return the URL.
 *
 * Handles HEIC/HEIF from iPhones — sharp converts everything to WebP at quality 80,
 * resized to max 1600px on the long edge. Typical 8MB HEIC → ~200KB WebP.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const MAX_DIMENSION = 1600; // px — long edge cap
const WEBP_QUALITY = 80;   // good visual quality, ~10-20x smaller than HEIC

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
        { error: "Unsupported file type. Use JPEG, PNG, WebP, or HEIC." },
        { status: 400 }
      );
    }

    // 10MB limit (raw upload — will be compressed)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename (always .webp after conversion)
    const hash = crypto.randomBytes(8).toString("hex");
    const filename = `${Date.now()}-${hash}.webp`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Read buffer from upload
    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Compress: resize to max 1600px long edge, convert to WebP
    const outputBuffer = await sharp(inputBuffer)
      .rotate()                            // Auto-rotate based on EXIF
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",                     // Preserve aspect ratio, shrink only
        withoutEnlargement: true,          // Don't upscale small images
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    await writeFile(filepath, outputBuffer);

    const url = `/api/uploads/${filename}`;
    return NextResponse.json({
      url,
      filename,
      originalSize: file.size,
      compressedSize: outputBuffer.length,
    });
  } catch (err) {
    console.error("[uploads] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
