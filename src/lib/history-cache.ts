/**
 * History Cache — Server-side in-memory cache for sensor/control history.
 *
 * Uses stale-while-revalidate semantics with range-aware TTLs.
 * Keyed by `${range}:${id}` — entries are evicted on a 60s sweep.
 */

import type { ReadingPoint } from "./db";

interface CacheEntry {
  points: ReadingPoint[];
  fetchedAt: number;
  ttlMs: number;
}

const cache = new Map<string, CacheEntry>();

/** TTL by range — longer ranges change less frequently */
const RANGE_TTL: Record<string, number> = {
  "1h":  30_000,  // 30s
  "6h":  60_000,  // 1m
  "24h": 60_000,  // 1m
  "7d":  120_000, // 2m
};

function cacheKey(id: string, range: string): string {
  return `${range}:${id}`;
}

/** Get cached points if still fresh, or null if stale/missing */
export function getCached(id: string, range: string): ReadingPoint[] | null {
  const key = cacheKey(id, range);
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAt;
  if (age > entry.ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry.points;
}

/** Store points in cache with range-appropriate TTL */
export function setCached(id: string, range: string, points: ReadingPoint[]): void {
  const key = cacheKey(id, range);
  const ttlMs = RANGE_TTL[range] ?? 60_000;
  cache.set(key, { points, fetchedAt: Date.now(), ttlMs });
}

/** Bulk get — returns Map of cached entries, and list of missing IDs */
export function getMultiCached(
  ids: string[],
  range: string,
): { cached: Map<string, ReadingPoint[]>; missing: string[] } {
  const cached = new Map<string, ReadingPoint[]>();
  const missing: string[] = [];

  for (const id of ids) {
    const points = getCached(id, range);
    if (points) cached.set(id, points);
    else missing.push(id);
  }

  return { cached, missing };
}

/** Bulk set */
export function setMultiCached(
  entries: Map<string, ReadingPoint[]>,
  range: string,
): void {
  for (const [id, points] of entries) {
    setCached(id, range, points);
  }
}

/** Evict stale entries — called periodically */
function sweep() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt > entry.ttlMs) {
      cache.delete(key);
    }
  }
}

// Run sweep every 60s
setInterval(sweep, 60_000);
