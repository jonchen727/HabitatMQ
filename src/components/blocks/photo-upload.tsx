/**
 * PhotoUpload — Multi-photo upload widget for care event forms.
 *
 * - Accepts multiple files at once via native picker or drag-and-drop
 * - Shows existing photos as a grid of thumbnails with individual remove buttons
 * - Always renders an "Add more" slot so new photos can be appended even in edit mode
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PhotoUploadProps {
  value?: string[];        // current photo URLs (multi)
  onChange: (urls: string[]) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function PhotoUpload({
  value = [],
  onChange,
  size = "md",
  className,
  label = "Photos",
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const thumbSize = { sm: "w-16 h-16", md: "w-20 h-20", lg: "w-28 h-28" }[size];

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      return url as string;
    } catch (err) {
      console.error("Photo upload failed:", err);
      return null;
    }
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(images.map(uploadFile));
      const newUrls = results.filter((u): u is string => u !== null);
      if (newUrls.length) onChange([...value, ...newUrls]);
    } finally {
      setUploading(false);
    }
  }, [value, onChange, uploadFile]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleFiles(files);
    e.target.value = "";
  }, [handleFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleRemove = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((_, i) => i !== idx));
  }, [value, onChange]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">
          {label}
        </span>
      )}

      {/* Grid of existing photos + add-more slot */}
      <div className="flex flex-wrap gap-2">
        {/* Existing photo thumbnails */}
        {value.map((url, idx) => (
          <div
            key={url}
            className={cn("relative rounded-2xl overflow-hidden flex-shrink-0", thumbSize)}
          >
            <Image
              src={url}
              alt={`Photo ${idx + 1}`}
              fill
              className="object-cover"
              sizes="112px"
            />
            <button
              type="button"
              onClick={(e) => handleRemove(idx, e)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center
                         hover:bg-red-500/70 transition-colors z-10"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {/* Add-more / first-photo slot */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2 border-dashed flex-shrink-0",
            thumbSize,
            dragOver
              ? "border-emerald-400/50 bg-emerald-500/10"
              : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.05]",
          )}
        >
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white/50 animate-spin" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              {value.length === 0 ? (
                <>
                  <Camera className="w-4 h-4 text-white/20" />
                  <span className="text-[8px] text-white/15 font-medium">Add photo</span>
                </>
              ) : (
                <Plus className="w-5 h-5 text-white/25" />
              )}
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleInput}
        className="hidden"
      />
    </div>
  );
}

/* ─── Inline Photo Thumbnail (for lists) ─────────────────────────────────── */

export function PhotoThumb({
  src,
  size = 40,
  className,
  onClick,
}: {
  src: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.04]",
        onClick && "cursor-pointer active:scale-95 transition-transform",
        className,
      )}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <Image src={src} alt="" fill className="object-cover" sizes={`${size}px`} />
    </div>
  );
}

/* ─── Full-screen Photo Lightbox ─────────────────────────────────────────── */

export function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative w-full max-w-lg mx-4 aspect-square rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt=""
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 512px"
        />
      </div>
    </div>
  );
}
