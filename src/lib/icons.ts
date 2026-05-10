/**
 * Device & Sensor Icon Mapping
 *
 * Replaces emoji icons with Lucide React vector icons for
 * consistent rendering across platforms. The `icon` field in
 * DeviceState/SensorConfig still stores a string key — this
 * module maps those keys to React components.
 */

import {
  Flame,
  Thermometer,
  ThermometerSnowflake,
  Globe,
  Droplets,
  Sun,
  Lightbulb,
  Zap,
  CloudRain,
  Eye,
  Fan,
  Radio,
  type LucideIcon,
} from "lucide-react"

/** Map device IDs to Lucide icons */
export const DEVICE_ICONS: Record<string, LucideIcon> = {
  HEAT_BASK: Sun,
  HEAT_CHE: Flame,
  HEAT_PAD: Thermometer,
  LIGHT_UVB: Zap,
  LIGHT_VIS: Lightbulb,
  MIST: CloudRain,
  CAM_IR: Eye,
  BAY_FANS: Fan,
}

/** Map emoji strings to Lucide icons (for sensor configs) */
export const EMOJI_TO_ICON: Record<string, LucideIcon> = {
  "🔥": Flame,
  "🌡️": Thermometer,
  "❄️": ThermometerSnowflake,
  "🌍": Globe,
  "💧": Droplets,
  "☀️": Sun,
  "🔆": Sun,
  "♨️": Flame,
  "🔬": Zap,
  "💡": Lightbulb,
  "🌧️": CloudRain,
  "👁️": Eye,
  "🌀": Fan,
}

/** Get a Lucide icon for a device or sensor, with fallback */
export function getIcon(key: string): LucideIcon {
  return DEVICE_ICONS[key] ?? EMOJI_TO_ICON[key] ?? Radio
}
