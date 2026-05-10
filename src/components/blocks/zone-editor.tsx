"use client";

/**
 * Zone Editor — Draw rectangle zones on a camera snapshot.
 *
 * Full-screen overlay that shows the camera feed (snapshot) and lets you
 * draw, name, and color detection zones. Touch-friendly (drag to create rects).
 * Zones use normalized 0-1 coordinates for resolution independence.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Plus, Trash2, Palette, Camera } from "lucide-react";
import type { ZoneDef } from "@/lib/schema";

interface ZoneEditorProps {
  open: boolean;
  onClose: () => void;
  zones: ZoneDef[];
  onSave: (zones: ZoneDef[]) => void;
  cameraUrl: string;
  paneId?: string; // for proxy URL
}

const ZONE_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
];

const DEFAULT_LABELS = [
  "Warm Hide", "Cool Hide", "Water Bowl", "Basking Spot",
  "Substrate", "Climbing Area",
];

interface DrawState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function ZoneEditor({ open, onClose, zones: initialZones, onSave, cameraUrl, paneId }: ZoneEditorProps) {
  const [zones, setZones] = useState<ZoneDef[]>([]);
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState(ZONE_COLORS[0]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load zones when opening
  useEffect(() => {
    if (open) {
      setZones([...initialZones]);
      setDrawing(null);
      setEditingZone(null);
      setImgLoaded(false);
      setImgError(false);
    }
  }, [open, initialZones]);

  // Convert mouse/touch position to normalized 0-1 coords relative to image
  const toNormalized = useCallback((clientX: number, clientY: number): [number, number] => {
    if (!imgRef.current) return [0, 0];
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return [x, y];
  }, []);

  // Drawing handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (editingZone) return; // Don't draw while editing a zone label
    const [x, y] = toNormalized(e.clientX, e.clientY);
    setDrawing({ startX: x, startY: y, endX: x, endY: y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [toNormalized, editingZone]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing) return;
    const [x, y] = toNormalized(e.clientX, e.clientY);
    setDrawing((d) => d ? { ...d, endX: x, endY: y } : null);
  }, [drawing, toNormalized]);

  const handlePointerUp = useCallback(() => {
    if (!drawing) return;
    const x1 = Math.min(drawing.startX, drawing.endX);
    const y1 = Math.min(drawing.startY, drawing.endY);
    const x2 = Math.max(drawing.startX, drawing.endX);
    const y2 = Math.max(drawing.startY, drawing.endY);

    // Ignore tiny accidental drags
    if (Math.abs(x2 - x1) < 0.03 || Math.abs(y2 - y1) < 0.03) {
      setDrawing(null);
      return;
    }

    const colorIdx = zones.length % ZONE_COLORS.length;
    const labelIdx = zones.length % DEFAULT_LABELS.length;
    const newZone: ZoneDef = {
      id: `zone-${Date.now()}`,
      label: DEFAULT_LABELS[labelIdx],
      color: ZONE_COLORS[colorIdx],
      rect: [x1, y1, x2, y2],
    };
    setZones((z) => [...z, newZone]);
    setDrawing(null);
    // Auto-open edit for the new zone
    setEditingZone(newZone.id);
    setEditLabel(newZone.label);
    setEditColor(newZone.color);
  }, [drawing, zones.length]);

  const handleDeleteZone = useCallback((id: string) => {
    setZones((z) => z.filter((zz) => zz.id !== id));
    if (editingZone === id) setEditingZone(null);
  }, [editingZone]);

  const handleSaveLabel = useCallback(() => {
    if (!editingZone) return;
    setZones((z) => z.map((zz) =>
      zz.id === editingZone ? { ...zz, label: editLabel.trim() || zz.label, color: editColor } : zz
    ));
    setEditingZone(null);
  }, [editingZone, editLabel, editColor]);

  const handleSaveAll = useCallback(() => {
    onSave(zones);
    onClose();
  }, [zones, onSave, onClose]);

  // Build snapshot URL — use camera snapshot API for a single clean frame
  const snapshotUrl = paneId
    ? `/api/cameras/${encodeURIComponent(paneId)}/snapshot?t=${Date.now()}`
    : cameraUrl;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
        >
          {/* ── Top Bar ── */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[14px] font-bold text-white/80">Draw Zones</h2>
              <span className="text-[9px] text-white/20 font-medium">{zones.length}/6 zones</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAll}
                className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Save Zones
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>

          {/* ── Instructions ── */}
          <div className="px-4 pb-2">
            <p className="text-[9px] text-white/20 font-medium">
              Drag on the image to create zone rectangles. Tap a zone to rename it.
            </p>
          </div>

          {/* ── Camera View + Zones ── */}
          <div
            ref={containerRef}
            className="flex-1 flex items-center justify-center px-4 pb-4 select-none overflow-hidden"
          >
            <div
              className="relative inline-block max-w-full max-h-full"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ touchAction: "none" }}
            >
              {/* Camera snapshot or placeholder grid */}
              {imgError ? (
                <div className="w-[640px] max-w-full aspect-video rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 pointer-events-none">
                  <Camera className="w-8 h-8 text-white/10" />
                  <p className="text-[10px] text-white/15 font-medium">Camera offline — draw zones on placeholder</p>
                  <p className="text-[8px] text-white/10">Zones will map when camera connects</p>
                  {/* Grid lines for visual reference */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[0.25, 0.5, 0.75].map((p) => (
                      <div key={`v${p}`} className="absolute top-0 bottom-0 border-l border-white/[0.04]" style={{ left: `${p * 100}%` }} />
                    ))}
                    {[0.25, 0.5, 0.75].map((p) => (
                      <div key={`h${p}`} className="absolute left-0 right-0 border-t border-white/[0.04]" style={{ top: `${p * 100}%` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {!imgLoaded && (
                    <div className="w-[640px] max-w-full aspect-video rounded-xl bg-white/[0.03] flex items-center justify-center pointer-events-none">
                      <div className="w-5 h-5 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={snapshotUrl}
                    alt="Camera snapshot"
                    className={cn(
                      "max-w-full max-h-[60vh] rounded-xl object-contain pointer-events-none",
                      !imgLoaded && "hidden"
                    )}
                    draggable={false}
                    onLoad={() => setImgLoaded(true)}
                    onError={() => { setImgError(true); setImgLoaded(false); }}
                  />
                </>
              )}

              {/* Existing zones */}
              {zones.map((z) => (
                <div
                  key={z.id}
                  className={cn(
                    "absolute border-2 rounded-lg cursor-pointer transition-all",
                    editingZone === z.id && "ring-2 ring-white/30"
                  )}
                  style={{
                    left: `${z.rect[0] * 100}%`,
                    top: `${z.rect[1] * 100}%`,
                    width: `${(z.rect[2] - z.rect[0]) * 100}%`,
                    height: `${(z.rect[3] - z.rect[1]) * 100}%`,
                    borderColor: z.color,
                    backgroundColor: `${z.color}15`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingZone(z.id);
                    setEditLabel(z.label);
                    setEditColor(z.color);
                  }}
                >
                  {/* Zone label badge */}
                  <div
                    className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[8px] font-bold text-white whitespace-nowrap"
                    style={{ backgroundColor: z.color }}
                  >
                    {z.label}
                  </div>
                </div>
              ))}

              {/* Active drawing rect */}
              {drawing && (
                <div
                  className="absolute border-2 border-dashed border-white/50 rounded-lg"
                  style={{
                    left: `${Math.min(drawing.startX, drawing.endX) * 100}%`,
                    top: `${Math.min(drawing.startY, drawing.endY) * 100}%`,
                    width: `${Math.abs(drawing.endX - drawing.startX) * 100}%`,
                    height: `${Math.abs(drawing.endY - drawing.startY) * 100}%`,
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                />
              )}
            </div>
          </div>

          {/* ── Zone Edit Panel (bottom sheet) ── */}
          <AnimatePresence>
            {editingZone && (
              <motion.div
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                className="absolute bottom-0 left-0 right-0 glass-heavy border-t border-white/[0.06] rounded-t-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Zone name"
                    className="field-input flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
                  />
                  <button
                    onClick={() => handleDeleteZone(editingZone)}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-400/50" />
                  </button>
                </div>

                {/* Color picker */}
                <div className="flex items-center gap-2">
                  <Palette className="w-3 h-3 text-white/15 shrink-0" />
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={cn(
                        "w-6 h-6 rounded-full transition-transform",
                        editColor === c && "scale-125 ring-2 ring-white/30"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingZone(null)}
                    className="flex-1 py-2 rounded-xl bg-white/[0.04] text-[10px] font-semibold text-white/25"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveLabel}
                    className="flex-1 py-2 rounded-xl bg-white/[0.08] text-[10px] font-semibold text-white/60"
                  >
                    Save Zone
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Zone List (side panel on larger screens) ── */}
          {!editingZone && zones.length > 0 && (
            <div className="absolute bottom-4 right-4 w-48 glass rounded-xl p-3 space-y-1.5">
              {zones.map((z) => (
                <div key={z.id} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                  <span className="text-[9px] text-white/40 font-medium flex-1 truncate">{z.label}</span>
                  <button
                    onClick={() => handleDeleteZone(z.id)}
                    className="text-[7px] text-red-400/30 hover:text-red-400/60"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Add hint when no zones ── */}
          {zones.length === 0 && !drawing && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.04]">
              <Plus className="w-3.5 h-3.5 text-white/20" />
              <span className="text-[10px] text-white/20 font-medium">
                Drag on the image to create your first zone
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
