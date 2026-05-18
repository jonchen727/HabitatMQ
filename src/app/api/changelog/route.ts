import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface ChangelogEntry {
  text: string;
}

interface ChangelogSection {
  category: string;
  entries: ChangelogEntry[];
}

interface ChangelogVersion {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

/**
 * GET /api/changelog
 *
 * Parses CHANGELOG.md and returns structured JSON.
 * Used by the in-app changelog page.
 */
export async function GET() {
  try {
    const changelogPath = join(process.cwd(), "CHANGELOG.md");
    const raw = await readFile(changelogPath, "utf-8");
    const versions = parseChangelog(raw);
    return NextResponse.json({ versions });
  } catch {
    return NextResponse.json({ versions: [], error: "Changelog not found" }, { status: 404 });
  }
}

function parseChangelog(raw: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let currentVersion: ChangelogVersion | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const line of raw.split("\n")) {
    // Match version header: ## [2026.05.3] — 2026-05-18
    const versionMatch = line.match(/^## \[(.+?)\]\s*[—-]\s*(\d{4}-\d{2}-\d{2})/);
    if (versionMatch) {
      currentVersion = { version: versionMatch[1], date: versionMatch[2], sections: [] };
      versions.push(currentVersion);
      currentSection = null;
      continue;
    }

    // Match section header: ### Added, ### Fixed, etc.
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && currentVersion) {
      currentSection = { category: sectionMatch[1], entries: [] };
      currentVersion.sections.push(currentSection);
      continue;
    }

    // Match list entry: - **Something** — description
    const entryMatch = line.match(/^- (.+)/);
    if (entryMatch && currentSection) {
      currentSection.entries.push({ text: entryMatch[1] });
    }
  }

  return versions;
}
