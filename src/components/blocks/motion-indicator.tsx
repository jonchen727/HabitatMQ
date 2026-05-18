"use client";

/**
 * Motion Indicator — Subtle overlay showing ONVIF motion detection status.
 *
 * Shows a pulsing dot when motion is active and a timestamp of last event.
 * Polls the motion status API for updates.
 */

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface MotionIndicatorProps {
  cameraId: string;
  enabled?: boolean;
  className?: string;
}

interface MotionState {
  motion: boolean;
  lastEvent: number;
}

export function MotionIndicator({ cameraId, enabled = true, className }: MotionIndicatorProps) {
  const [state, setState] = useState<MotionState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const resp = await fetch("/api/cameras/motion");
        if (resp.ok) {
          const states: Record<string, MotionState> = await resp.json();
          setState(states[cameraId] ?? null);
        }
      } catch {
        // silently fail — not critical
      }
    };

    // Initial poll + interval
    poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cameraId, enabled]);

  if (!enabled || !state) return null;

  const timeAgo = state.lastEvent > 0
    ? formatTimeAgo(state.lastEvent)
    : null;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-md transition-all",
      state.motion
        ? "bg-red-500/20 border border-red-500/30"
        : "bg-black/30 border border-white/[0.1]",
      className,
    )}>
      {/* Pulsing dot */}
      <div className="relative">
        <div className={cn(
          "w-2 h-2 rounded-full transition-colors",
          state.motion ? "bg-red-400" : "bg-emerald-400/50"
        )} />
        {state.motion && (
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-400 animate-ping" />
        )}
      </div>

      <span className={cn(
        "text-[8px] font-semibold uppercase tracking-wider",
        state.motion ? "text-red-400" : "text-white/50"
      )}>
        {state.motion ? "Motion" : "Still"}
      </span>

      {timeAgo && (
        <span className="text-[7px] text-white/30 font-mono">
          {timeAgo}
        </span>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
