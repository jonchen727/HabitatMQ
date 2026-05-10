"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { SensorConfig, SensorType, ZoneId } from "@/lib/types";
import { ZONE_LABELS } from "@/lib/types";

const SENSOR_TYPES: { value: SensorType; label: string; unit: string }[] = [
  { value: "temperature", label: "Temperature", unit: "°F" },
  { value: "humidity", label: "Humidity", unit: "%RH" },
  { value: "lux", label: "Light Level", unit: "lux" },
];

const HARDWARE_OPTIONS: Record<SensorType, string[]> = {
  temperature: ["DS18B20", "DHT22"],
  humidity: ["DHT22"],
  lux: ["BH1750"],
};

const ZONE_OPTIONS: { value: ZoneId; label: string }[] = Object.entries(ZONE_LABELS).map(
  ([value, label]) => ({ value: value as ZoneId, label })
);

interface SensorFormProps {
  sensor: SensorConfig | null;
  onSave: (sensor: SensorConfig) => void;
  onCancel: () => void;
}

export function SensorForm({ sensor, onSave, onCancel }: SensorFormProps) {
  const [form, setForm] = useState<SensorConfig>(
    sensor ?? {
      id: `sensor_${Date.now()}`,
      label: "",
      type: "temperature",
      location: "",
      unit: "°F",
      hardware: "DS18B20",
      gpioPin: "",
      zoneId: null,
      dayTarget: [80, 90],
      nightTarget: [70, 80],
      warningThresholds: [75, 95],
      criticalThresholds: [70, 100],
      icon: "🌡️",
      mapPosition: null,
    }
  );

  const update = useCallback(
    <K extends keyof SensorConfig>(key: K, value: SensorConfig[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleTypeChange = useCallback(
    (type: SensorType) => {
      const info = SENSOR_TYPES.find((t) => t.value === type)!;
      const hardware = HARDWARE_OPTIONS[type]?.[0] ?? "";
      const icon = type === "temperature" ? "🌡️" : type === "humidity" ? "💧" : "☀️";
      setForm((prev) => ({
        ...prev,
        type,
        unit: info.unit as SensorConfig["unit"],
        hardware: hardware as SensorConfig["hardware"],
        icon,
      }));
    },
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    onSave(form);
  };

  const inputClass =
    "w-full h-12 px-3 rounded-lg bg-secondary/30 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 touch-target";
  const labelClass =
    "block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-4">
      {/* Sensor Name */}
      <div>
        <label className={labelClass}>Sensor Name</label>
        <input
          type="text"
          className={inputClass}
          value={form.label}
          onChange={(e) => update("label", e.target.value)}
          placeholder="e.g. Basking Surface"
          autoFocus
        />
      </div>

      {/* Type + Hardware */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Type</label>
          <select
            className={inputClass}
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value as SensorType)}
          >
            {SENSOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Hardware</label>
          <select
            className={inputClass}
            value={form.hardware}
            onChange={(e) => update("hardware", e.target.value as SensorConfig["hardware"])}
          >
            {(HARDWARE_OPTIONS[form.type] ?? []).map((hw) => (
              <option key={hw} value={hw}>
                {hw}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* GPIO + Zone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>GPIO Pin / Bus</label>
          <input
            type="text"
            className={inputClass}
            value={form.gpioPin}
            onChange={(e) => update("gpioPin", e.target.value)}
            placeholder="e.g. GPIO4"
          />
        </div>
        <div>
          <label className={labelClass}>Zone Assignment</label>
          <select
            className={inputClass}
            value={form.zoneId ?? ""}
            onChange={(e) =>
              update("zoneId", e.target.value ? (e.target.value as ZoneId) : null)
            }
          >
            <option value="">Unassigned</option>
            {ZONE_OPTIONS.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Location */}
      <div>
        <label className={labelClass}>Physical Location</label>
        <input
          type="text"
          className={inputClass}
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
          placeholder="e.g. Warm side wall, 4-6 inches above substrate"
        />
      </div>

      <Separator className="opacity-30" />

      {/* Target Ranges */}
      <h3 className="text-sm font-medium">Target Ranges</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Day Min – Max ({form.unit})</label>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputClass}
              value={form.dayTarget[0]}
              onChange={(e) =>
                update("dayTarget", [Number(e.target.value), form.dayTarget[1]])
              }
            />
            <input
              type="number"
              className={inputClass}
              value={form.dayTarget[1]}
              onChange={(e) =>
                update("dayTarget", [form.dayTarget[0], Number(e.target.value)])
              }
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Night Min – Max ({form.unit})</label>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputClass}
              value={form.nightTarget[0]}
              onChange={(e) =>
                update("nightTarget", [Number(e.target.value), form.nightTarget[1]])
              }
            />
            <input
              type="number"
              className={inputClass}
              value={form.nightTarget[1]}
              onChange={(e) =>
                update("nightTarget", [form.nightTarget[0], Number(e.target.value)])
              }
            />
          </div>
        </div>
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Warning Thresholds</label>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputClass}
              value={form.warningThresholds[0]}
              onChange={(e) =>
                update("warningThresholds", [
                  Number(e.target.value),
                  form.warningThresholds[1],
                ])
              }
            />
            <input
              type="number"
              className={inputClass}
              value={form.warningThresholds[1]}
              onChange={(e) =>
                update("warningThresholds", [
                  form.warningThresholds[0],
                  Number(e.target.value),
                ])
              }
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Critical Thresholds</label>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputClass}
              value={form.criticalThresholds[0]}
              onChange={(e) =>
                update("criticalThresholds", [
                  Number(e.target.value),
                  form.criticalThresholds[1],
                ])
              }
            />
            <input
              type="number"
              className={inputClass}
              value={form.criticalThresholds[1]}
              onChange={(e) =>
                update("criticalThresholds", [
                  form.criticalThresholds[0],
                  Number(e.target.value),
                ])
              }
            />
          </div>
        </div>
      </div>

      <Separator className="opacity-30" />

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 h-14 touch-target text-sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 h-14 touch-target text-sm"
          disabled={!form.label.trim()}
        >
          {sensor ? "Update Sensor" : "Add Sensor"}
        </Button>
      </div>
    </form>
  );
}
