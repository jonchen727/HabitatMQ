"use client";

/**
 * MQTT Settings — Broker configuration card with test button.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { MqttConfig } from "@/lib/schema";

interface MqttSettingsProps {
  config: MqttConfig | null;
  onSave: (config: MqttConfig) => void;
}

export function MqttSettings({ config, onSave }: MqttSettingsProps) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("1880");
  const [protocol, setProtocol] = useState<"ws" | "wss">("ws");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setHost(config.host);
      setPort(String(config.port));
      setProtocol(config.protocol);
      setUsername(config.username ?? "");
      setPassword(config.password ?? "");
    }
  }, [config]);

  const handleTest = async () => {
    setTestState("testing");
    try {
      const res = await fetch("/api/mqtt/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port), protocol, username, password }),
      });
      const data = await res.json();
      setTestState(data.success ? "success" : "error");
      setTestMessage(data.message + (data.latencyMs ? ` (${data.latencyMs}ms)` : ""));
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    }
  };

  const handleSave = () => {
    const cfg: MqttConfig = {
      host,
      port: parseInt(port) || 1880,
      protocol,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    };
    onSave(cfg);
    setDirty(false);
  };

  const onChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setDirty(true);
    setTestState("idle");
  };

  return (
    <div className="glass rounded-[20px] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wifi className="w-4 h-4 text-white/25" />
        <h3 className="text-[12px] font-bold text-white/50 uppercase tracking-[0.1em]">
          MQTT Broker
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Host</label>
          <input value={host} onChange={onChange(setHost)} className="field-input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Port</label>
          <input type="number" value={port} onChange={onChange(setPort)} className="field-input" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Protocol</label>
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
          {(["ws", "wss"] as const).map((p) => (
            <button key={p} onClick={() => { setProtocol(p); setDirty(true); }} className={cn(
              "flex-1 py-1.5 rounded-lg text-[10px] font-semibold uppercase transition-all",
              protocol === p ? "bg-white/[0.08] text-white/70" : "text-white/20"
            )}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Username</label>
          <input value={username} onChange={onChange(setUsername)} placeholder="Optional" className="field-input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.12em]">Password</label>
          <input type="password" value={password} onChange={onChange(setPassword)} placeholder="Optional" className="field-input" />
        </div>
      </div>

      {/* Test Result */}
      {testState !== "idle" && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-medium",
          testState === "success" && "bg-emerald-500/10 text-emerald-400/80",
          testState === "error" && "bg-red-500/10 text-red-400/80",
          testState === "testing" && "bg-white/[0.04] text-white/30",
        )}>
          {testState === "testing" && <Loader2 className="w-3 h-3 animate-spin" />}
          {testState === "success" && <CheckCircle2 className="w-3 h-3" />}
          {testState === "error" && <XCircle className="w-3 h-3" />}
          {testMessage || "Testing connection…"}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleTest} variant="ghost"
          className="flex-1 text-[10px] text-white/30 hover:text-white/50">
          <WifiOff className="w-3 h-3 mr-1" /> Test
        </Button>
        <Button onClick={handleSave} disabled={!dirty}
          className="flex-1 text-[10px] bg-white/[0.08] text-white/60 hover:bg-white/[0.12]">
          Save
        </Button>
      </div>
    </div>
  );
}
