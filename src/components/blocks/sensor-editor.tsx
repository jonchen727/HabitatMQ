"use client";

/**
 * Sensor Editor — Sheet drawer for adding/editing a sensor definition.
 *
 * Covers: label, kind (analog/digital), MQTT topic, payload parsing,
 * unit, min/max thresholds, warning/critical bounds, and metadata.
 * Includes 1-Wire probe discovery for DS18B20 temperature sensors.
 */

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SensorDef, SensorKind, SensorDirection, PayloadType } from "@/lib/schema";
import { Thermometer, Radio, WifiOff, Check, RefreshCw } from "lucide-react";

interface DiscoveredProbe {
  id: string;
  file: string;
  family: string;
  temp: number;
  lastSeen: number;
  configured: boolean;
  online: boolean;
}

interface SensorEditorProps {
  open: boolean;
  onClose: () => void;
  sensor?: SensorDef | null;
  onSave: (sensor: SensorDef) => void;
}

function generateId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sensor";
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

export function SensorEditor({ open, onClose, sensor, onSave }: SensorEditorProps) {
  const isEdit = !!sensor;

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SensorKind>("analog");
  const [direction, setDirection] = useState<SensorDirection>("input");
  const [topic, setTopic] = useState("");
  const [payloadType, setPayloadType] = useState<PayloadType>("raw");
  const [jsonPath, setJsonPath] = useState("");
  const [trueValue, setTrueValue] = useState("true");
  const [falseValue, setFalseValue] = useState("false");
  const [unit, setUnit] = useState("");
  const [displayUnit, setDisplayUnit] = useState<"C" | "F">("F");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [warningLow, setWarningLow] = useState("");
  const [warningHigh, setWarningHigh] = useState("");
  const [criticalLow, setCriticalLow] = useState("");
  const [criticalHigh, setCriticalHigh] = useState("");
  const [hardware, setHardware] = useState("");
  const [location, setLocation] = useState("");

  // json_array fields
  const [arrayMatchField, setArrayMatchField] = useState("id");
  const [arrayMatchValue, setArrayMatchValue] = useState("");
  const [arrayValueField, setArrayValueField] = useState("temp");

  // Probe discovery
  const [probes, setProbes] = useState<DiscoveredProbe[]>([]);
  const [probesLoading, setProbesLoading] = useState(false);
  const [showProbes, setShowProbes] = useState(false);

  useEffect(() => {
    if (sensor) {
      setLabel(sensor.label);
      setKind(sensor.kind);
      setDirection(sensor.direction ?? "input");
      setTopic(sensor.mqtt.topic);
      setPayloadType(sensor.mqtt.payloadType);
      setJsonPath(sensor.mqtt.jsonPath ?? "");
      setTrueValue(sensor.mqtt.trueValue ?? "true");
      setFalseValue(sensor.mqtt.falseValue ?? "false");
      setUnit(sensor.unit);
      setDisplayUnit(sensor.displayUnit ?? "F");
      setMin(sensor.min?.toString() ?? "");
      setMax(sensor.max?.toString() ?? "");
      setWarningLow(sensor.warningLow?.toString() ?? "");
      setWarningHigh(sensor.warningHigh?.toString() ?? "");
      setCriticalLow(sensor.criticalLow?.toString() ?? "");
      setCriticalHigh(sensor.criticalHigh?.toString() ?? "");
      setHardware(sensor.hardware ?? "");
      setLocation(sensor.location ?? "");
      setArrayMatchField(sensor.mqtt.arrayMatchField ?? "id");
      setArrayMatchValue(sensor.mqtt.arrayMatchValue ?? "");
      setArrayValueField(sensor.mqtt.arrayValueField ?? "temp");
      setShowProbes(false);
    } else {
      // Reset for new sensor
      setLabel(""); setKind("analog"); setDirection("input"); setTopic("");
      setPayloadType("raw"); setJsonPath(""); setTrueValue("true");
      setFalseValue("false"); setUnit(""); setDisplayUnit("F"); setMin(""); setMax("");
      setWarningLow(""); setWarningHigh(""); setCriticalLow("");
      setCriticalHigh(""); setHardware(""); setLocation("");
      setArrayMatchField("id"); setArrayMatchValue(""); setArrayValueField("temp");
      setShowProbes(false);
    }
  }, [sensor, open]);

  const fetchProbes = useCallback(async () => {
    setProbesLoading(true);
    try {
      const res = await fetch("/api/sensors/discover");
      const data = await res.json();
      setProbes(data.probes ?? []);
    } catch {
      setProbes([]);
    }
    setProbesLoading(false);
  }, []);

  const handleSelectProbe = (probe: DiscoveredProbe) => {
    // Auto-fill all MQTT fields for this probe
    setTopic("DS18B20");
    setPayloadType("json_array");
    setArrayMatchField("id");
    setArrayMatchValue(probe.id);
    setArrayValueField("temp");
    setKind("analog");
    setDirection("input");
    setUnit("°C");
    setDisplayUnit("F");
    setHardware("DS18B20");
    if (!label) setLabel(`Temp Probe ${probe.id.slice(-4)}`);
    setShowProbes(false);
  };

  const handleSave = () => {
    const id = isEdit ? sensor!.id : generateId(label);
    const def: SensorDef = {
      id,
      label,
      kind,
      direction,
      mqtt: {
        topic,
        payloadType,
        ...(payloadType === "json" && jsonPath ? { jsonPath } : {}),
        trueValue,
        falseValue,
        ...(payloadType === "json_array" ? {
          arrayMatchField,
          arrayMatchValue,
          arrayValueField,
        } : {}),
      },
      unit,
      ...(displayUnit ? { displayUnit } : {}),
      ...(min ? { min: parseFloat(min) } : {}),
      ...(max ? { max: parseFloat(max) } : {}),
      ...(warningLow ? { warningLow: parseFloat(warningLow) } : {}),
      ...(warningHigh ? { warningHigh: parseFloat(warningHigh) } : {}),
      ...(criticalLow ? { criticalLow: parseFloat(criticalLow) } : {}),
      ...(criticalHigh ? { criticalHigh: parseFloat(criticalHigh) } : {}),
      ...(hardware ? { hardware } : {}),
      ...(location ? { location } : {}),
    };
    onSave(def);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-3xl glass-heavy border-t border-white/[0.06] px-6 pb-8">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-[16px] font-bold text-white/80">
            {isEdit ? "Edit Sensor" : "Add Sensor"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* ── 1-Wire Probe Discovery ──────────────────────────────── */}
          {!isEdit && (
            <div className="space-y-2">
              <button
                onClick={() => { setShowProbes(!showProbes); if (!showProbes) fetchProbes(); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all text-left",
                  "bg-gradient-to-r from-amber-500/[0.08] to-orange-500/[0.05] border border-amber-500/[0.12]",
                  "hover:from-amber-500/[0.12] hover:to-orange-500/[0.08]"
                )}
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/[0.12] flex items-center justify-center shrink-0">
                  <Thermometer className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-amber-300/80">Discover 1-Wire Probes</p>
                  <p className="text-[8px] text-white/20 mt-0.5">Auto-detect DS18B20 temperature sensors from MQTT</p>
                </div>
                <RefreshCw className={cn("w-3.5 h-3.5 text-amber-400/40", probesLoading && "animate-spin")} />
              </button>

              {showProbes && (
                <div className="space-y-1.5 pl-1">
                  {probesLoading ? (
                    <p className="text-[9px] text-white/20 py-3 text-center">Scanning…</p>
                  ) : probes.length === 0 ? (
                    <p className="text-[9px] text-white/20 py-3 text-center">No probes detected. Check MQTT DS18B20 topic.</p>
                  ) : (
                    probes.map((probe) => {
                      const tempF = celsiusToFahrenheit(probe.temp);
                      return (
                        <button
                          key={probe.id}
                          onClick={() => !probe.configured && handleSelectProbe(probe)}
                          disabled={probe.configured}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                            probe.configured
                              ? "bg-white/[0.02] opacity-40 cursor-not-allowed"
                              : "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] hover:border-amber-500/20"
                          )}
                        >
                          {probe.online ? (
                            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5 text-red-400/50 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono text-white/50 truncate">{probe.id}</p>
                            <p className="text-[8px] text-white/15 font-mono mt-0.5">{probe.file}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {probe.online ? (
                              <p className="text-[12px] font-semibold text-white/60 tabular-nums">
                                {probe.temp}°C <span className="text-white/25">/ {tempF}°F</span>
                              </p>
                            ) : (
                              <p className="text-[10px] text-red-400/40 font-medium">Offline</p>
                            )}
                          </div>
                          {probe.configured && (
                            <Check className="w-3.5 h-3.5 text-emerald-400/40 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Label */}
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Basking Surface" className="field-input" />
          </Field>

          {/* Kind */}
          <Field label="Sensor Kind">
            <SegmentedPicker value={kind} options={["analog", "digital"]}
              onChange={(v) => setKind(v as SensorKind)} />
          </Field>

          {/* Direction */}
          <Field label="Direction">
            <SegmentedPicker value={direction} options={["input", "output"]}
              onChange={(v) => setDirection(v as SensorDirection)} />
            <p className="text-[8px] text-white/15 mt-1">
              {direction === "input" ? "Reads from environment (temp, humidity)" : "Reflects controlled device state (relay, light)"}
            </p>
          </Field>

          {/* MQTT Topic */}
          <Field label="MQTT Topic">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., BaskingLight" className="field-input" />
          </Field>

          {/* Payload Type */}
          <Field label="Payload Format">
            <SegmentedPicker value={payloadType}
              options={["raw", "json", "json_array", "boolean"]}
              labels={["Raw", "JSON", "Array", "Boolean"]}
              onChange={(v) => setPayloadType(v as PayloadType)} />
          </Field>

          {/* Conditional: JSON Path */}
          {payloadType === "json" && (
            <Field label="JSON Path">
              <input value={jsonPath} onChange={(e) => setJsonPath(e.target.value)}
                placeholder="e.g., $.value or $.temperature" className="field-input" />
            </Field>
          )}

          {/* Conditional: JSON Array matching */}
          {payloadType === "json_array" && (
            <div className="space-y-3 p-3 rounded-xl bg-amber-500/[0.03] border border-amber-500/[0.06]">
              <p className="text-[8px] font-semibold text-amber-400/60 uppercase tracking-wider">
                Array Element Matching
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Match Field">
                  <input value={arrayMatchField} onChange={(e) => setArrayMatchField(e.target.value)}
                    placeholder="id" className="field-input text-[10px]" />
                </Field>
                <Field label="Match Value">
                  <input value={arrayMatchValue} onChange={(e) => setArrayMatchValue(e.target.value)}
                    placeholder="FF270..." className="field-input text-[10px]" />
                </Field>
                <Field label="Value Field">
                  <input value={arrayValueField} onChange={(e) => setArrayValueField(e.target.value)}
                    placeholder="temp" className="field-input text-[10px]" />
                </Field>
              </div>
            </div>
          )}

          {/* Conditional: Boolean values */}
          {payloadType === "boolean" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="True Value">
                <input value={trueValue} onChange={(e) => setTrueValue(e.target.value)}
                  className="field-input" />
              </Field>
              <Field label="False Value">
                <input value={falseValue} onChange={(e) => setFalseValue(e.target.value)}
                  className="field-input" />
              </Field>
            </div>
          )}

          {/* Unit + Display Unit */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit">
              <input value={unit} onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., °F, %RH, lux, hrs" className="field-input" />
            </Field>
            {kind === "analog" && direction === "input" && (
              <Field label="Display As">
                <SegmentedPicker value={displayUnit} options={["C", "F"]}
                  labels={["°C", "°F"]}
                  onChange={(v) => setDisplayUnit(v as "C" | "F")} />
              </Field>
            )}
          </div>

          {/* Min / Max (analog inputs only — outputs don't need thresholds) */}
          {kind === "analog" && direction === "input" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Value">
                  <input type="number" value={min} onChange={(e) => setMin(e.target.value)}
                    className="field-input" />
                </Field>
                <Field label="Max Value">
                  <input type="number" value={max} onChange={(e) => setMax(e.target.value)}
                    className="field-input" />
                </Field>
              </div>

              {/* Warning Thresholds */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Warning Low">
                  <input type="number" value={warningLow} onChange={(e) => setWarningLow(e.target.value)}
                    className="field-input" />
                </Field>
                <Field label="Warning High">
                  <input type="number" value={warningHigh} onChange={(e) => setWarningHigh(e.target.value)}
                    className="field-input" />
                </Field>
              </div>

              {/* Critical Thresholds */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Critical Low">
                  <input type="number" value={criticalLow} onChange={(e) => setCriticalLow(e.target.value)}
                    className="field-input" />
                </Field>
                <Field label="Critical High">
                  <input type="number" value={criticalHigh} onChange={(e) => setCriticalHigh(e.target.value)}
                    className="field-input" />
                </Field>
              </div>
            </>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hardware (optional)">
              <input value={hardware} onChange={(e) => setHardware(e.target.value)}
                placeholder="DS18B20" className="field-input" />
            </Field>
            <Field label="Location (optional)">
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Warm side" className="field-input" />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} className="flex-1 text-white/30">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!label || !topic}
              className="flex-1 bg-white/[0.08] text-white/80 hover:bg-white/[0.12]">
              {isEdit ? "Update" : "Add Sensor"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedPicker({ value, options, labels, onChange }: {
  value: string; options: string[]; labels?: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
      {options.map((opt, i) => (
        <button key={opt} onClick={() => onChange(opt)} className={cn(
          "flex-1 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all",
          value === opt
            ? "bg-white/[0.08] text-white/70 shadow-sm"
            : "text-white/20 hover:text-white/35"
        )}>
          {labels ? labels[i] : opt}
        </button>
      ))}
    </div>
  );
}
