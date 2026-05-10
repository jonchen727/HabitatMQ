/**
 * GET /api/system
 *
 * Returns Raspberry Pi system stats: CPU usage, RAM, and SoC temperature.
 * Reads directly from /proc and /sys — no external dependencies.
 */

import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

interface SystemStats {
  cpu: { usagePercent: number; cores: number; loadAvg1m: number };
  ram: { totalMB: number; usedMB: number; usagePercent: number };
  disk: { totalGB: number; usedGB: number; availGB: number; usagePercent: number };
  temp: { celsius: number };
  uptime: number; // seconds
}

// ─── CPU snapshot for delta calculation ──────────────────────────────────────
let prevIdle = 0;
let prevTotal = 0;
let cpuPercent = 0;

function updateCpuUsage() {
  try {
    const stat = fs.readFileSync("/proc/stat", "utf-8");
    const cpuLine = stat.split("\n")[0]; // "cpu  user nice system idle ..."
    const parts = cpuLine.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] ?? 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);

    if (prevTotal > 0) {
      const dTotal = total - prevTotal;
      const dIdle = idle - prevIdle;
      cpuPercent = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;
    }
    prevIdle = idle;
    prevTotal = total;
  } catch {
    cpuPercent = 0;
  }
}

// Tick CPU every 2s so the GET always has a recent delta
updateCpuUsage();
const cpuTimer = setInterval(updateCpuUsage, 2000);
// Keep the process alive but allow clean exit
if (cpuTimer.unref) cpuTimer.unref();

function getTemp(): number {
  try {
    const raw = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf-8");
    return Math.round(parseInt(raw, 10) / 100) / 10; // e.g. 40780 → 40.8
  } catch {
    return 0;
  }
}

function getRam(): { totalMB: number; usedMB: number; usagePercent: number } {
  const totalMB = Math.round(os.totalmem() / 1024 / 1024);
  const freeMB = Math.round(os.freemem() / 1024 / 1024);
  const usedMB = totalMB - freeMB;
  const usagePercent = Math.round((usedMB / totalMB) * 100);
  return { totalMB, usedMB, usagePercent };
}

function getDisk(): { totalGB: number; usedGB: number; availGB: number; usagePercent: number } {
  try {
    // df -B1 / gives bytes for the root partition
    const raw = execSync("df -B1 / | tail -1", { encoding: "utf-8" });
    const parts = raw.trim().split(/\s+/);
    // parts: [device, total, used, avail, use%, mount]
    const totalGB = Math.round((parseInt(parts[1], 10) / 1073741824) * 10) / 10;
    const usedGB = Math.round((parseInt(parts[2], 10) / 1073741824) * 10) / 10;
    const availGB = Math.round((parseInt(parts[3], 10) / 1073741824) * 10) / 10;
    const usagePercent = parseInt(parts[4], 10);
    return { totalGB, usedGB, availGB, usagePercent };
  } catch {
    return { totalGB: 0, usedGB: 0, availGB: 0, usagePercent: 0 };
  }
}

export async function GET() {
  const stats: SystemStats = {
    cpu: {
      usagePercent: cpuPercent,
      cores: os.cpus().length,
      loadAvg1m: Math.round(os.loadavg()[0] * 100) / 100,
    },
    ram: getRam(),
    disk: getDisk(),
    temp: { celsius: getTemp() },
    uptime: Math.round(os.uptime()),
  };

  return NextResponse.json(stats);
}
