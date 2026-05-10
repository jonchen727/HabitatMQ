"use client";

/**
 * History Page — Full-page sensor trend viewer.
 *
 * Multi-sensor overlay chart with range picker, sensor toggles,
 * and control state overlay bands (à la iPhone battery chart).
 * Profile-aware via ProfileSwitcher.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SensorHistory } from "@/components/blocks/sensor-history";
import { ProfileSwitcher } from "@/components/blocks/profile-switcher";
import { useProfileStore } from "@/store/use-profile-store";
import { staggerContainer as container, staggerItem as item } from "@/lib/animations";
import type { SensorDef, ControlDef } from "@/lib/schema";

export default function HistoryPage() {
  const [sensors, setSensors] = useState<SensorDef[]>([]);
  const [controls, setControls] = useState<ControlDef[]>([]);
  const { activeProfileId } = useProfileStore();

  useEffect(() => {
    fetch(`/api/sensors?profileId=${activeProfileId}`)
      .then((r) => r.json())
      .then((d) => setSensors(d))
      .catch(() => {});
    fetch(`/api/controls?profileId=${activeProfileId}`)
      .then((r) => r.json())
      .then((d) => setControls(d))
      .catch(() => {});
  }, [activeProfileId]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 py-2">
      <motion.div variants={item} className="flex items-center gap-3">
        <h1 className="text-[18px] font-bold text-white/80 tracking-tight">
          Sensor History
        </h1>
        <ProfileSwitcher />
      </motion.div>

      {sensors.length > 0 ? (
        <SensorHistory sensors={sensors} controls={controls} defaultExpanded />
      ) : (
        <motion.div variants={item} className="glass rounded-[20px] p-8 text-center">
          <p className="text-[11px] text-white/20 font-medium">
            No sensors configured yet. Add sensors in Config to see history.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
