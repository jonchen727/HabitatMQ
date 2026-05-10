#!/usr/bin/env node
/**
 * migrate-photos.js — Convert existing uploaded photos to compressed WebP.
 *
 * Run ON the Pi: cd ~/enclosure && node migrate-photos.js
 *
 * For each .jpeg/.jpg/.png in public/uploads/:
 *   1. Convert to WebP (quality 80, max 1600px long edge)
 *   2. Save as new .webp file
 *   3. Update all references in the care_events.photo_url column
 *   4. Remove the original file
 *
 * Skips files that are already .webp or too small (< 100 bytes, e.g. broken uploads).
 */

const sharp = require("sharp");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const DB_PATH = path.join(__dirname, "data", "enclosure.db");
const MAX_DIM = 1600;
const QUALITY = 80;

async function main() {
  const files = fs.readdirSync(UPLOAD_DIR);
  const toConvert = files.filter((f) => {
    const ext = f.split(".").pop()?.toLowerCase();
    return ["jpeg", "jpg", "png", "heic", "heif"].includes(ext ?? "");
  });

  if (!toConvert.length) {
    console.log("No files to convert.");
    return;
  }

  console.log(`Found ${toConvert.length} files to convert to WebP.\n`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const updateStmt = db.prepare(
    "UPDATE care_events SET photo_url = ? WHERE photo_url LIKE ?"
  );

  let totalSavedBytes = 0;

  for (const file of toConvert) {
    const srcPath = path.join(UPLOAD_DIR, file);
    const stat = fs.statSync(srcPath);

    // Skip tiny/broken files
    if (stat.size < 100) {
      console.log(`  SKIP ${file} (${stat.size} bytes — too small)`);
      continue;
    }

    // New filename: same base but .webp
    const baseName = file.replace(/\.[^.]+$/, "");
    const webpName = `${baseName}.webp`;
    const dstPath = path.join(UPLOAD_DIR, webpName);

    try {
      const inputBuffer = fs.readFileSync(srcPath);
      const outputBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(MAX_DIM, MAX_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: QUALITY })
        .toBuffer();

      fs.writeFileSync(dstPath, outputBuffer);

      const saved = stat.size - outputBuffer.length;
      totalSavedBytes += saved;

      console.log(
        `  ✓ ${file} → ${webpName}  (${(stat.size / 1024).toFixed(0)}KB → ${(outputBuffer.length / 1024).toFixed(0)}KB, saved ${(saved / 1024).toFixed(0)}KB)`
      );

      // Update DB references — handle both single URL and JSON array patterns
      const oldUrl = `/api/uploads/${file}`;
      const newUrl = `/api/uploads/${webpName}`;

      // For JSON arrays: replace the old filename inside the JSON string
      const arrayUpdated = db.prepare(
        "UPDATE care_events SET photo_url = REPLACE(photo_url, ?, ?) WHERE photo_url LIKE ?"
      ).run(oldUrl, newUrl, `%${file}%`);

      if (arrayUpdated.changes > 0) {
        console.log(`    DB: updated ${arrayUpdated.changes} care_events`);
      }

      // Remove original
      fs.unlinkSync(srcPath);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  db.close();

  console.log(`\nDone. Total saved: ${(totalSavedBytes / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
