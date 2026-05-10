"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import type { ZoneId, ZoneDetection } from "@/lib/types";
import { ZONE_LABELS, ZONE_COLORS } from "@/lib/types";

function ZoneCell({
  zone,
  label,
  active,
}: {
  zone: ZoneId;
  label: string;
  active: boolean;
}) {
  const colors = ZONE_COLORS[zone];
  return (
    <div
      className={`
        rounded-md border p-2 h-full flex items-center justify-center text-center
        transition-all duration-700 text-[10px] font-mono
        ${colors.bg} ${colors.border}
        ${active ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-[1.02] shadow-[0_0_20px_oklch(0.75_0.14_70/0.3)]" : "opacity-60"}
      `}
    >
      <span className={active ? "font-bold text-foreground" : "text-muted-foreground"}>
        {label}
        {active && (
          <span className="block text-primary text-[9px] mt-0.5 animate-pulse">
            ● HERE
          </span>
        )}
      </span>
    </div>
  );
}

export function ZoneMap({
  currentZone,
  zone,
}: {
  currentZone: ZoneId;
  zone: ZoneDetection;
}) {
  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Enclosure Zone Map
          <Badge
            variant="outline"
            className="ml-auto text-[10px] border-primary/30 text-primary"
          >
            AI Detection
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-1 aspect-[2.4/1] relative font-mono text-[10px]">
          {/* Warm Zone */}
          <div className="space-y-1">
            <ZoneCell zone="basking" label="🔥 Basking" active={currentZone === "basking"} />
            <ZoneCell zone="warm_hide" label="🏠 Warm Hide" active={currentZone === "warm_hide"} />
            <ZoneCell zone="burrow" label="🕳️ Burrow" active={currentZone === "burrow"} />
          </div>

          {/* Transition Zone */}
          <div className="space-y-1">
            <ZoneCell zone="transition" label="↔️ Transition" active={currentZone === "transition"} />
            <ZoneCell zone="water" label="💧 Water" active={currentZone === "water"} />
            <ZoneCell zone="humid_hide" label="🌿 Humid Hide" active={currentZone === "humid_hide"} />
          </div>

          {/* Cool Zone */}
          <div className="space-y-1">
            <ZoneCell zone="cool" label="❄️ Cool" active={currentZone === "cool"} />
            <ZoneCell zone="cool_hide" label="🏠 Cool Hide" active={currentZone === "cool_hide"} />
            <ZoneCell zone="leaf_litter" label="🍂 Leaf Litter" active={currentZone === "leaf_litter"} />
          </div>
        </div>

        {/* Detection Info */}
        <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30">
          <div>
            <div className="text-sm font-semibold">🐍 {ZONE_LABELS[currentZone]}</div>
            <div className="text-xs text-muted-foreground">
              {zone.activity} · {zone.duration}m in zone · Last movement {zone.lastMovement}m ago
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-lg font-bold tabular-nums ${
                zone.confidence > 0.9
                  ? "text-emerald-400"
                  : zone.confidence > 0
                    ? "text-amber-400"
                    : "text-muted-foreground"
              }`}
            >
              {zone.confidence > 0 ? `${(zone.confidence * 100).toFixed(0)}%` : "—"}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Confidence
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
