"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

/**
 * Premium iOS-style toggle switch.
 * Three sizes: sm (24×14), default (44×26), lg (52×30).
 * On-state: vivid green gradient with glow.
 * Off-state: translucent track.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default" | "lg"
}) {
  const sizeClasses = {
    sm: "h-[14px] w-[24px]",
    default: "h-[26px] w-[44px]",
    lg: "h-[30px] w-[52px]",
  }
  const thumbSizes = {
    sm: "size-[10px] data-checked:translate-x-[10px] translate-x-[2px]",
    default: "size-[22px] data-checked:translate-x-[18px] translate-x-[2px]",
    lg: "size-[26px] data-checked:translate-x-[22px] translate-x-[2px]",
  }

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex shrink-0 items-center rounded-full cursor-pointer",
        "transition-all duration-300 ease-out outline-none",
        "data-unchecked:bg-white/[0.08]",
        "data-checked:bg-gradient-to-r data-checked:from-emerald-500 data-checked:to-emerald-400",
        "data-checked:shadow-[0_0_12px_oklch(0.65_0.18_155/0.35)]",
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        "focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full transition-transform duration-300 ease-out",
          "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.2)]",
          thumbSizes[size],
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
