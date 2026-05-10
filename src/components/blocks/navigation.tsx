"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Settings2,
  Bell,
  CalendarDays,
  Fish,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/store/use-profile-store";

interface NavItem {
  text: string;
  href: string;
  icon: typeof LayoutDashboard;
  aquariumOnly?: boolean;
}

const navItems: NavItem[] = [
  { text: "Home", href: "/", icon: LayoutDashboard },
  { text: "History", href: "/history", icon: Activity },
  { text: "Controls", href: "/controls", icon: SlidersHorizontal },
  { text: "Care", href: "/care", icon: CalendarDays },
  { text: "Tank", href: "/inhabitants", icon: Fish, aquariumOnly: true },
  { text: "Config", href: "/config", icon: Settings2 },
  { text: "Alerts", href: "/alerts", icon: Bell },
];

export function BottomNav() {
  const pathname = usePathname();
  const { activeProfile } = useProfileStore();
  const profile = activeProfile();
  const isAquarium = profile?.type === "aquarium";

  const visibleItems = navItems.filter((item) => {
    if (item.aquariumOnly && !isAquarium) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe pointer-events-none">
      <div
        className="pointer-events-auto mx-3 md:mx-auto mb-2.5 rounded-[20px] overflow-hidden max-w-lg md:max-w-2xl"
        style={{
          background: "rgba(255,255,255, 0.03)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255, 0.05)",
          boxShadow: "0 -4px 24px rgba(0,0,0, 0.3), 0 0 0 0.5px rgba(255,255,255,0.02) inset",
        }}
      >
        <div className="flex items-stretch justify-around h-[56px] max-w-2xl mx-auto">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 flex-1 touch-target transition-all duration-200",
                  isActive ? "text-emerald-400" : "text-white/15"
                )}
              >
                <item.icon
                  className="w-[18px] h-[18px]"
                  strokeWidth={isActive ? 2 : 1.4}
                />
                <span className={cn(
                  "text-[8px] font-semibold tracking-[0.1em]",
                  isActive ? "text-emerald-400/90" : "text-white/15"
                )}>
                  {item.text}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-1 w-4 h-[2px] rounded-full bg-emerald-400/60"
                    style={{ boxShadow: "0 0 8px rgba(52,211,153,0.4)" }}
                    transition={{ type: "spring" as const, stiffness: 400, damping: 28 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
