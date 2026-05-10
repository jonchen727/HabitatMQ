"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEnclosureStore } from "@/store/use-enclosure-store";
import { cn } from "@/lib/utils";
import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";

import { staggerContainer as container, staggerItem as item } from "@/lib/animations";

export default function AlertsPage() {
  const { state, init, tick } = useEnclosureStore();

  useEffect(() => {
    init();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [init, tick]);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-white/15 animate-pulse text-sm font-light">Loading…</div>
      </div>
    );
  }

  const { alerts } = state;
  const hasIssues = alerts.some((a) => a.severity === "critical" || a.severity === "warning");

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4 pt-5"
    >
      <motion.h1 variants={item} className="text-[26px] font-extrabold tracking-tight leading-none px-0.5">
        Alerts
      </motion.h1>

      <AnimatePresence mode="wait">
        {!hasIssues && (
          <motion.div
            key="all-clear"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring" as const, stiffness: 300, damping: 24 }}
            className="glass-green rounded-[20px] p-8 flex flex-col items-center gap-3 text-center"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-400/70" />
            <div>
              <p className="text-sm font-semibold text-emerald-300/80">All Clear</p>
              <p className="text-[11px] text-white/20 mt-1 font-medium">
                All systems operating within normal parameters
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={container} className="space-y-3">
        <AnimatePresence>
          {alerts
            .filter((a) => a.severity !== "info")
            .map((alert) => {
              const isCritical = alert.severity === "critical";
              return (
                <motion.div
                  key={alert.id}
                  variants={item}
                  layout
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                  className={cn(
                    "glass rounded-[20px] p-4 flex items-start gap-3.5 transition-all",
                    isCritical && "!border-red-400/12 !bg-red-500/[0.04]"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                    isCritical ? "bg-red-500/10" : "bg-amber-500/10"
                  )}>
                    {isCritical ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white/70 font-medium leading-snug">{alert.message}</p>
                    <p className="text-[9px] text-white/15 mt-1 font-medium tracking-wide">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
