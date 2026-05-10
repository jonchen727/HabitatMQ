"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PhotoUploadProps {
  value?: string;          // current photo URL
  onChange: (url: string | undefined) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function PhotoUpload({
  value,
  onChange,
  size = "md",
  className,
  label = "Photo",
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onChange(url);
    } catch (err) {
      console.error("Photo upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }, [upload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) upload(file);
  }, [upload]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  }, [onChange]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">
          {label}
        </span>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2 border-dashed",
          sizeClasses[size],
          value
            ? "border-transparent"
            : dragOver
              ? "border-emerald-400/40 bg-emerald-500/5"
              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]",
        )}
      >
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
          </div>
        ) : value ? (
          <>
            <Image
              src={value}
              alt="Uploaded photo"
              fill
              className="object-cover"
              sizes="128px"
            />
            {/* Remove button */}
            <button
              onClick={handleRemove}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center
                         hover:bg-red-500/60 transition-colors z-10"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <Camera className="w-4 h-4 text-white/20" />
            <span className="text-[8px] text-white/15 font-medium">Add photo</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFile}
          className="hidden"
        />
      </div>
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
  const el = (
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
  return el;
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
