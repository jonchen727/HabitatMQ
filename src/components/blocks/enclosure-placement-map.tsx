"use client";

import { useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { SensorConfig, SensorId, SensorReading, ZoneId } from "@/lib/types";
import { ZONE_COLORS, ZONE_LABELS } from "@/lib/types";

interface Props {
  sensors: SensorConfig[];
  readings: Record<SensorId, SensorReading>;
  placingId: string | null;
  onMapClick: (x: number, y: number) => void;
  onCancelPlacing: () => void;
}

/* 3-column layout matching the physical enclosure: Warm → Transition → Cool */
const ZONES: { id: ZoneId; col: number; row: number; w: number; h: number }[] = [
  // Warm side (col 0)
  { id: "basking",     col: 0, row: 0, w: 1, h: 1 },
  { id: "warm_hide",   col: 0, row: 1, w: 1, h: 1 },
  { id: "burrow",      col: 0, row: 2, w: 1, h: 1 },
  // Transition (col 1)
  { id: "transition",  col: 1, row: 0, w: 1, h: 1 },
  { id: "water",       col: 1, row: 1, w: 1, h: 1 },
  { id: "humid_hide",  col: 1, row: 2, w: 1, h: 1 },
  // Cool side (col 2)
  { id: "cool",        col: 2, row: 0, w: 1, h: 1 },
  { id: "cool_hide",   col: 2, row: 1, w: 1, h: 1 },
  { id: "leaf_litter", col: 2, row: 2, w: 1, h: 1 },
];

export function EnclosurePlacementMap({
  sensors,
  readings,
  placingId,
  onMapClick,
  onCancelPlacing,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!placingId || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
      const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;

      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      onMapClick(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    },
    [placingId, onMapClick]
  );

  const placedSensors = sensors.filter((s) => s.mapPosition);

  return (
    <div className="space-y-3">
      {/* Cancel bar */}
      {placingId && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/30">
          <span className="text-xs text-primary font-medium">
            Tap a location on the map to place the sensor
          </span>
          <Button size="sm" variant="ghost" className="h-8" onClick={onCancelPlacing}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Map */}
      <div
        ref={containerRef}
        className={`relative aspect-[2.8/1] rounded-xl overflow-hidden border transition-all ${
          placingId
            ? "border-primary/50 cursor-crosshair shadow-[0_0_30px_oklch(0.75_0.14_70/0.15)]"
            : "border-border/30"
        }`}
        onClick={handleClick}
        onTouchEnd={handleClick}
      >
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-950/40 via-yellow-950/20 to-blue-950/40" />

        {/* Zone grid */}
        <div className="absolute inset-2 grid grid-cols-3 grid-rows-3 gap-1">
          {ZONES.map((z) => (
            <div
              key={z.id}
              className={`rounded-md border flex items-center justify-center text-center
                ${ZONE_COLORS[z.id].bg} ${ZONE_COLORS[z.id].border}
                ${placingId ? "hover:opacity-80" : ""}
                transition-opacity duration-200`}
              style={{
                gridColumn: `${z.col + 1}`,
                gridRow: `${z.row + 1}`,
              }}
            >
              <span className="text-[9px] text-foreground/60 font-mono pointer-events-none">
                {ZONE_LABELS[z.id]}
              </span>
            </div>
          ))}
        </div>

        {/* Column labels */}
        <div className="absolute top-0 left-2 right-2 flex justify-between pointer-events-none">
          <span className="text-[8px] text-orange-400/60 font-mono uppercase tracking-wider">
            Warm Side
          </span>
          <span className="text-[8px] text-yellow-400/60 font-mono uppercase tracking-wider">
            Transition
          </span>
          <span className="text-[8px] text-blue-400/60 font-mono uppercase tracking-wider">
            Cool Side
          </span>
        </div>

        {/* Placed sensors */}
        {placedSensors.map((sensor) => {
          const reading = readings[sensor.id];
          const isPlacing = sensor.id === placingId;
          return (
            <div
              key={sensor.id}
              className={`absolute flex flex-col items-center pointer-events-none transition-all duration-500
                ${isPlacing ? "opacity-50 scale-90" : ""}
              `}
              style={{
                left: `${sensor.mapPosition!.x}%`,
                top: `${sensor.mapPosition!.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div className="relative">
                <span className="text-lg drop-shadow-[0_0_6px_oklch(0.75_0.14_70/0.5)]">
                  {sensor.icon}
                </span>
                {reading && (
                  <span
                    className={`absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-bold tabular-nums px-1 rounded-sm bg-black/70 whitespace-nowrap ${
                      reading.status === "critical"
                        ? "text-red-400"
                        : reading.status === "warning"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {reading.value.toFixed(1)}
                  </span>
                )}
              </div>
              <span className="text-[7px] text-foreground/50 mt-3 font-mono bg-black/50 px-1 rounded whitespace-nowrap">
                {sensor.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[9px]">
        {placedSensors.length > 0 ? (
          placedSensors.map((s) => (
            <Badge key={s.id} variant="outline" className="text-[8px]">
              {s.icon} {s.label}
              {s.mapPosition && (
                <span className="text-muted-foreground ml-1">
                  ({s.mapPosition.x.toFixed(0)}, {s.mapPosition.y.toFixed(0)})
                </span>
              )}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">
            No sensors placed yet. Use the &quot;Place&quot; button on each sensor card.
          </span>
        )}
      </div>
    </div>
  );
}
