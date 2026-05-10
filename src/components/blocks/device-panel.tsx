"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Settings2 } from "lucide-react";
import type { EnclosureState, DeviceId } from "@/lib/types";

export function DevicePanel({
  devices,
  onToggle,
  onSetOutput,
}: {
  devices: EnclosureState["devices"];
  onToggle: (id: DeviceId) => void;
  onSetOutput?: (id: DeviceId, percent: number) => void;
}) {
  const deviceList = Object.values(devices);

  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          Device Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {deviceList.map((device) => (
          <div
            key={device.deviceId}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/20 touch-card"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">{device.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{device.label}</div>
                {device.type === "pwm" && device.outputPercent !== undefined && (
                  <div className="mt-1.5">
                    <Slider
                      value={[device.outputPercent]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(val) => onSetOutput?.(device.deviceId, Array.isArray(val) ? (val[0] ?? 0) : val)}
                      className="w-full"
                    />
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      Output: {device.outputPercent}%
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              {device.autoMode && (
                <Badge
                  variant="outline"
                  className="text-[8px] px-1.5 py-0 border-blue-500/30 text-blue-400"
                >
                  AUTO
                </Badge>
              )}
              <Switch
                checked={device.isOn}
                onCheckedChange={() => onToggle(device.deviceId)}
                className="touch-target"
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
