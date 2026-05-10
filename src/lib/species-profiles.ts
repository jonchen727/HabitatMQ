/**
 * Species Profile Registry
 *
 * Static, code-level reference data for reptile species.
 * Each profile provides:
 * - Life stages (classified by weight ranges)
 * - Growth benchmarks (expected weight ranges by age for body condition assessment)
 * - Prey progression (weight-based prey sizing with size-up/down signals)
 * - Feeding guidance (interval + % of body weight per life stage)
 * - Husbandry parameters (temperature, humidity)
 * - Health reference (body condition, common issues)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LifeStage {
  id: "hatchling" | "juvenile" | "subadult" | "adult";
  label: string;
  emoji: string;
  color: string;                                // tailwind color class
  minWeightG: number;
  maxWeightG: number | null;                    // null = open-ended
  feedIntervalDays: [min: number, max: number];
  preyWeightPct: [min: number, max: number];    // % of body weight
  description: string;
}

export interface GrowthBenchmark {
  ageMonths: number;
  femaleWeightG: [low: number, mid: number, high: number];  // 25th, 50th, 75th percentile
  maleWeightG: [low: number, mid: number, high: number];
  femaleLengthCm: [low: number, high: number];
  maleLengthCm: [low: number, high: number];
}

export interface PreyStep {
  snakeMinG: number;
  snakeMaxG: number | null;
  preyType: string;
  preyLabel: string;                  // human-friendly label
  preyWeightG: [min: number, max: number];
  sizeUpSignal: string;
  sizeDownSignal: string;
}

export interface HusbandryParams {
  temperature: {
    baskingSurfaceF: [min: number, max: number];
    warmSideF: [min: number, max: number];
    coolSideF: [min: number, max: number];
    nightDropF: [min: number, max: number];
  };
  humidity: {
    normalPct: [min: number, max: number];
    sheddingPct: [min: number, max: number];
  };
}

export interface BodyCondition {
  status: "underweight" | "healthy" | "overweight";
  signs: string[];
}

export interface HealthAlert {
  condition: string;
  signs: string[];
  severity: "info" | "warning" | "critical";
  action: string;
}

export interface ThermalPreset {
  id: string;
  label: string;
  description: string;
  /** Absolute time-of-day schedule entries */
  schedule: { time: string; setpoint: number; ramp: boolean; label?: string }[];
  /** Solar-relative equivalent (computed from sunrise/sunset each day) */
  solarSchedule: { anchor: "sunrise" | "sunset" | "solar_noon"; offsetMinutes: number;
                   setpoint: number; ramp: boolean; label?: string }[];
}

export interface SeasonalSolarOffsets {
  season: string;
  sunriseOffsetMinutes: number;
  sunsetOffsetMinutes: number;
  description: string;
}

export interface BrumationGuidance {
  recommended: boolean;
  durationMonths: [min: number, max: number];
  targetTempF: [min: number, max: number];
  typicalStartMonth: number;
  typicalEndMonth: number;
  prepNotes: string[];
}

export interface SubstrateRecommendation {
  preferred: string[];           // substrate type IDs (match SubstrateTypeSchema)
  minDepthInches: number;
  fullChangeIntervalDays: number;
  spotCleanFrequency: string;
}

export interface UVBRequirements {
  fergusonZone: number;
  uviRange: [min: number, max: number];
  bulbReplacementMonths: number;
  notes: string[];
}

export interface SpeciesProfile {
  id: string;
  scientificName: string;
  commonName: string;
  sexDimorphism: boolean;
  lifespanYears: [min: number, max: number];
  adultWeight: {
    femaleG: [min: number, max: number];
    maleG: [min: number, max: number];
  };
  adultLength: {
    femaleCm: [min: number, max: number];
    maleCm: [min: number, max: number];
  };
  lifeStages: LifeStage[];
  growthBenchmarks: GrowthBenchmark[];
  preyProgression: PreyStep[];
  husbandry: HusbandryParams;
  bodyCondition: BodyCondition[];
  healthAlerts: HealthAlert[];
  feedingTips: string[];
  generalNotes: string[];
  // ── Environmental Intelligence (optional, populated per species) ──
  thermalPresets?: ThermalPreset[];
  seasonalSolarOffsets?: SeasonalSolarOffsets[];
  brumationGuidance?: BrumationGuidance;
  substrate?: SubstrateRecommendation;
  uvb?: UVBRequirements;
  heatingNotes?: string[];
}

// ─── Western Hognose Profile ─────────────────────────────────────────────────

const westernHognose: SpeciesProfile = {
  id: "western-hognose",
  scientificName: "Heterodon nasicus",
  commonName: "Western Hognose",
  sexDimorphism: true,
  lifespanYears: [10, 20],
  adultWeight: {
    femaleG: [150, 800],
    maleG: [60, 150],
  },
  adultLength: {
    femaleCm: [60, 90],
    maleCm: [35, 60],
  },

  // ── Life Stages (classified by weight) ──
  lifeStages: [
    {
      id: "hatchling",
      label: "Hatchling",
      emoji: "🥚",
      color: "text-lime-400",
      minWeightG: 0,
      maxWeightG: 14,
      feedIntervalDays: [4, 5],
      preyWeightPct: [12, 15],
      description: "Newly hatched, establishing feeding response. Offer small pinky parts or scented items if reluctant.",
    },
    {
      id: "juvenile",
      label: "Juvenile",
      emoji: "🌱",
      color: "text-emerald-400",
      minWeightG: 15,
      maxWeightG: 40,
      feedIntervalDays: [5, 6],
      preyWeightPct: [10, 15],
      description: "Rapid growth phase. Consistent feeding is key — prioritize steady gains over speed.",
    },
    {
      id: "subadult",
      label: "Sub-Adult",
      emoji: "🐍",
      color: "text-blue-400",
      minWeightG: 40,
      maxWeightG: 150,
      feedIntervalDays: [6, 8],
      preyWeightPct: [10, 12],
      description: "Transitioning to adult proportions. Growth rate slows. Begin spacing feedings.",
    },
    {
      id: "adult",
      label: "Adult",
      emoji: "👑",
      color: "text-amber-400",
      minWeightG: 150,
      maxWeightG: null,
      feedIntervalDays: [7, 14],
      preyWeightPct: [8, 10],
      description: "Mature body weight reached. Focus on maintenance, not growth. Watch for obesity.",
    },
  ],

  // ── Growth Benchmarks (age → expected weight ranges) ──
  // Used for body condition assessment ("is she underweight for her age?")
  // Data synthesized from breeder community reports, MorphMarket records,
  // and ectothermempire.com feeding guides.
  // Note: Wide ranges reflect natural variation from genetics and feeding response.
  growthBenchmarks: [
    {
      ageMonths: 0,
      femaleWeightG: [5, 7, 9],
      maleWeightG: [4, 6, 8],
      femaleLengthCm: [13, 20],
      maleLengthCm: [13, 18],
    },
    {
      ageMonths: 3,
      femaleWeightG: [10, 18, 25],
      maleWeightG: [8, 14, 20],
      femaleLengthCm: [20, 30],
      maleLengthCm: [18, 25],
    },
    {
      ageMonths: 6,
      femaleWeightG: [15, 30, 50],
      maleWeightG: [12, 22, 35],
      femaleLengthCm: [25, 40],
      maleLengthCm: [22, 33],
    },
    {
      ageMonths: 9,
      femaleWeightG: [25, 50, 75],
      maleWeightG: [20, 35, 55],
      femaleLengthCm: [33, 48],
      maleLengthCm: [28, 40],
    },
    {
      ageMonths: 12,
      femaleWeightG: [40, 70, 100],
      maleWeightG: [30, 50, 70],
      femaleLengthCm: [38, 55],
      maleLengthCm: [30, 45],
    },
    {
      ageMonths: 18,
      femaleWeightG: [80, 130, 180],
      maleWeightG: [45, 65, 90],
      femaleLengthCm: [45, 65],
      maleLengthCm: [33, 50],
    },
    {
      ageMonths: 24,
      femaleWeightG: [150, 220, 300],
      maleWeightG: [55, 80, 120],
      femaleLengthCm: [55, 75],
      maleLengthCm: [35, 55],
    },
    {
      ageMonths: 36,
      femaleWeightG: [200, 300, 450],
      maleWeightG: [60, 90, 140],
      femaleLengthCm: [60, 85],
      maleLengthCm: [38, 58],
    },
  ],

  // ── Prey Progression ──
  preyProgression: [
    {
      snakeMinG: 5,
      snakeMaxG: 8,
      preyType: "pinky",
      preyLabel: "Pinky parts / mouse tail",
      preyWeightG: [0.5, 1.5],
      sizeUpSignal: "Eagerly strikes and shows no visible lump within 6 hours",
      sizeDownSignal: "N/A — smallest prey size",
    },
    {
      snakeMinG: 8,
      snakeMaxG: 14,
      preyType: "pinky",
      preyLabel: "Day-old pinky",
      preyWeightG: [1.5, 3],
      sizeUpSignal: "No visible lump within 12 hours post-feed",
      sizeDownSignal: "Lump still visible after 24 hours",
    },
    {
      snakeMinG: 15,
      snakeMaxG: 25,
      preyType: "pinky",
      preyLabel: "Standard pinky mouse",
      preyWeightG: [2.5, 4],
      sizeUpSignal: "No visible lump within 12 hours post-feed",
      sizeDownSignal: "Lump visible after 30 hours",
    },
    {
      snakeMinG: 26,
      snakeMaxG: 40,
      preyType: "fuzzy",
      preyLabel: "Peach fuzzy mouse",
      preyWeightG: [3.5, 6],
      sizeUpSignal: "No visible lump within 12 hours post-feed",
      sizeDownSignal: "Lump visible after 36 hours",
    },
    {
      snakeMinG: 40,
      snakeMaxG: 75,
      preyType: "fuzzy",
      preyLabel: "Fuzzy mouse",
      preyWeightG: [5, 9],
      sizeUpSignal: "No visible lump within 12 hours post-feed",
      sizeDownSignal: "Lump visible after 36 hours, or regurgitation",
    },
    {
      snakeMinG: 75,
      snakeMaxG: 150,
      preyType: "hopper",
      preyLabel: "Hopper mouse",
      preyWeightG: [8, 15],
      sizeUpSignal: "No visible lump within 12 hours post-feed",
      sizeDownSignal: "Struggles to swallow or lump visible after 36 hours",
    },
    {
      snakeMinG: 150,
      snakeMaxG: 250,
      preyType: "weanling",
      preyLabel: "Weanling mouse",
      preyWeightG: [12, 22],
      sizeUpSignal: "Snake easily takes prey with no visible lump after 12 hours",
      sizeDownSignal: "Struggles to swallow, regurgitation",
    },
    {
      snakeMinG: 250,
      snakeMaxG: null,
      preyType: "adult",
      preyLabel: "Adult mouse",
      preyWeightG: [18, 30],
      sizeUpSignal: "Maximum prey size for most hognose — do not size up further",
      sizeDownSignal: "Struggles to swallow, visible discomfort during feeding",
    },
  ],

  // ── Husbandry Parameters ──
  husbandry: {
    temperature: {
      baskingSurfaceF: [90, 95],
      warmSideF: [80, 90],
      coolSideF: [70, 75],
      nightDropF: [65, 75],
    },
    humidity: {
      normalPct: [30, 50],
      sheddingPct: [50, 65],
    },
  },

  // ── Body Condition Reference ──
  bodyCondition: [
    {
      status: "underweight",
      signs: [
        "Prominent, visible spine (V-shaped cross-section)",
        "Sunken areas or 'waist' indentation at the neck",
        "Skin feels loose or can be easily pinched/pulled away",
        "Visible ribs or bony protrusions",
      ],
    },
    {
      status: "healthy",
      signs: [
        "Evenly rounded or slightly triangular cross-section",
        "No prominent spine visible",
        "Smooth definition between head and neck",
        "Skin is taut but not stretched between scales at rest",
      ],
    },
    {
      status: "overweight",
      signs: [
        "'Hips' visible in the lower third of the body",
        "Fat rolls visible when the snake bends",
        "No definition between head and neck",
        "Scale spread — skin visible between scales at rest (not just when moving)",
      ],
    },
  ],

  // ── Health Alerts ──
  healthAlerts: [
    {
      condition: "Respiratory Infection",
      signs: ["Wheezing or gurgling sounds", "Open-mouth breathing", "Nasal discharge or bubbles", "Decreased appetite"],
      severity: "critical",
      action: "Consult exotic vet immediately. Check enclosure temps — often caused by low temps or high humidity.",
    },
    {
      condition: "Regurgitation",
      signs: ["Vomiting prey item partially digested"],
      severity: "warning",
      action: "Wait 14 days before offering food again. Offer smaller prey. Check basking temp is 90–95°F. Avoid handling for 48h post-feed.",
    },
    {
      condition: "Scale Rot",
      signs: ["Red or discolored belly scales", "Blisters on ventral surface", "Raised or damaged scales"],
      severity: "warning",
      action: "Check substrate moisture — switch to dry substrate. Clean enclosure. Consult vet if spreading.",
    },
    {
      condition: "Mites",
      signs: ["Tiny black/red specks around eyes, mouth, chin", "Excessive soaking in water bowl", "Specks floating in water dish"],
      severity: "warning",
      action: "Treat with reptile-safe mite treatment. Deep clean enclosure. Replace all substrate.",
    },
    {
      condition: "Stuck Shed",
      signs: ["Retained skin on eyes (eye caps), tail tip, or body", "Dull, patchy appearance after shed"],
      severity: "info",
      action: "Provide humid hide with damp sphagnum moss. Soak in lukewarm water 15-20 min. Gently assist removal.",
    },
    {
      condition: "Weight Stagnation",
      signs: ["No weight gain over 2+ months in growing snake", "Weight loss of 10%+ from peak"],
      severity: "warning",
      action: "Review feeding schedule and prey size. Check temperatures. If persists >3 months, consult exotic vet.",
    },
  ],

  // ── Feeding Tips ──
  feedingTips: [
    "Always feed frozen/thawed (F/T) — never live prey. Hognose are not constrictors and can be injured by live mice.",
    "The prey item should be roughly the same width as the snake's head or slightly wider than the thickest part of the body.",
    "After feeding, a noticeable but not extreme lump should be visible. It should disappear within 24–36 hours.",
    "Avoid handling for at least 48 hours after feeding to prevent regurgitation.",
    "If the snake refuses a meal, try scenting with tuna juice or a shed piece from another reptile (frog/toad scent can trigger feeding response).",
    "Hognose are naturally prone to fasting — occasional meal refusals (especially in winter) are normal if body condition is good.",
    "Do not power-feed for rapid growth — slower, steady growth produces healthier adults with longer lifespans.",
  ],

  // ── General Notes ──
  generalNotes: [
    "Western Hognose are diurnal — most active during daylight hours.",
    "They are fossorial (burrowing) — provide 3–4 inches of loose substrate for natural behavior.",
    "Females are significantly larger than males — always account for sex when evaluating body condition.",
    "Breeding readiness: females should be 2+ years old and 200–250g+ minimum.",
    "Hognose have a mild rear-fang venom that can cause localized swelling in sensitive individuals — not medically significant.",
  ],

  // ── Thermal Presets (research-backed day/night cycles) ──
  thermalPresets: [
    {
      id: "western-hognose-default",
      label: "Day/Night Cycle (Solar-Linked)",
      description: "Warm-side setpoints track sunrise/sunset. Ramps follow natural light transitions.",
      schedule: [
        { time: "06:00", setpoint: 80, ramp: true, label: "morning warm-up" },
        { time: "09:00", setpoint: 90, ramp: true, label: "day peak" },
        { time: "18:00", setpoint: 85, ramp: true, label: "evening cool" },
        { time: "21:00", setpoint: 75, ramp: true, label: "night" },
      ],
      solarSchedule: [
        { anchor: "sunrise", offsetMinutes: -30,  setpoint: 80, ramp: true, label: "pre-dawn warm" },
        { anchor: "sunrise", offsetMinutes: 120,  setpoint: 90, ramp: true, label: "day peak" },
        { anchor: "sunset",  offsetMinutes: -60,  setpoint: 85, ramp: true, label: "late afternoon" },
        { anchor: "sunset",  offsetMinutes: 60,   setpoint: 75, ramp: true, label: "night" },
      ],
    },
  ],

  // ── Seasonal Solar Offsets (lighting schedule adjustments by season) ──
  seasonalSolarOffsets: [
    { season: "spring", sunriseOffsetMinutes: -30, sunsetOffsetMinutes: 30,
      description: "~14h photoperiod — lights 30min before sunrise, 30min after sunset" },
    { season: "summer", sunriseOffsetMinutes: -60, sunsetOffsetMinutes: 60,
      description: "~16h photoperiod — extended basking window" },
    { season: "autumn", sunriseOffsetMinutes: 60,  sunsetOffsetMinutes: -60,
      description: "~10h photoperiod — shortened daylight, prep for brumation" },
    { season: "winter", sunriseOffsetMinutes: 90,  sunsetOffsetMinutes: -90,
      description: "~8h photoperiod — minimal daylight during brumation" },
  ],

  // ── Brumation Guidance ──
  brumationGuidance: {
    recommended: true,
    durationMonths: [2, 3],
    targetTempF: [55, 65],
    typicalStartMonth: 11,
    typicalEndMonth: 2,
    prepNotes: [
      "Fast for 2 weeks before cooling to ensure empty gut.",
      "Gradually reduce temps over 7–10 days.",
      "Maintain fresh water throughout — check weekly.",
      "Reduce photoperiod to 8h before and during brumation.",
      "Monitor weight weekly — 10% loss is maximum acceptable.",
      "Gradually warm back up over 7–10 days before resuming feeding.",
    ],
  },

  // ── Substrate Recommendations ──
  substrate: {
    preferred: ["aspen", "coconut_fiber", "bioactive_mix", "topsoil_sand_mix"],
    minDepthInches: 4,
    fullChangeIntervalDays: 105,  // ~3.5 months (3-4mo range)
    spotCleanFrequency: "daily",
  },

  // ── UVB Requirements ──
  uvb: {
    fergusonZone: 2,
    uviRange: [2.0, 3.0],
    bulbReplacementMonths: 12,
    notes: [
      "T5 HO 5.0 or Arcadia 6% recommended.",
      "Bulb should span 1/2 to 2/3 of enclosure length.",
      "Replace every 12 months even if still producing visible light — UVB output degrades.",
    ],
  },

  // ── Heating Method Notes ──
  heatingNotes: [
    "Use halogen or incandescent overhead heat (IR-A/IR-B) — most natural heat profile.",
    "Place a flat stone or wood slab under the basking spot for efficient belly warming.",
    "Avoid under-tank heaters (UTH) — unnatural for a fossorial species.",
    "Avoid ceramic heat emitters (CHE) — IR-C only, less biologically effective.",
    "No heat rocks — serious burn risk.",
    "No night bulbs — hognose are diurnal and need full darkness for sleep.",
    "50W halogen is a good starting point for mesh-top 40gal enclosures.",
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const PROFILES: Record<string, SpeciesProfile> = {
  "western-hognose": westernHognose,
};

export function getSpeciesProfile(id: string): SpeciesProfile | null {
  return PROFILES[id] ?? null;
}

export function getAllSpeciesProfiles(): SpeciesProfile[] {
  return Object.values(PROFILES);
}

/**
 * Determine life stage from current weight.
 * Returns the matching stage, or the last stage if weight exceeds all bounds.
 */
export function getLifeStage(profile: SpeciesProfile, weightG: number): LifeStage {
  for (let i = profile.lifeStages.length - 1; i >= 0; i--) {
    if (weightG >= profile.lifeStages[i].minWeightG) {
      return profile.lifeStages[i];
    }
  }
  return profile.lifeStages[0];
}

/**
 * Get recommended prey for current snake weight.
 */
export function getPreyRecommendation(profile: SpeciesProfile, weightG: number): PreyStep {
  for (let i = profile.preyProgression.length - 1; i >= 0; i--) {
    if (weightG >= profile.preyProgression[i].snakeMinG) {
      return profile.preyProgression[i];
    }
  }
  return profile.preyProgression[0];
}

/**
 * Assess body condition based on age and weight against growth benchmarks.
 * Returns "underweight", "on-track", or "above-average" with context message.
 */
export function assessGrowth(
  profile: SpeciesProfile,
  sex: "male" | "female",
  ageMonths: number,
  weightG: number,
): { status: "underweight" | "on-track" | "above-average"; message: string; percentile: string } {
  // Find the two bracketing benchmarks
  const benchmarks = profile.growthBenchmarks;
  let lower = benchmarks[0];
  let upper = benchmarks[benchmarks.length - 1];

  for (let i = 0; i < benchmarks.length - 1; i++) {
    if (ageMonths >= benchmarks[i].ageMonths && ageMonths <= benchmarks[i + 1].ageMonths) {
      lower = benchmarks[i];
      upper = benchmarks[i + 1];
      break;
    }
  }

  // Interpolate expected range
  const t = upper.ageMonths === lower.ageMonths
    ? 0
    : (ageMonths - lower.ageMonths) / (upper.ageMonths - lower.ageMonths);

  const weights = sex === "female" ? "femaleWeightG" : "maleWeightG";
  const lerp = (a: number, b: number) => a + (b - a) * t;

  const low = lerp(lower[weights][0], upper[weights][0]);
  const mid = lerp(lower[weights][1], upper[weights][1]);
  const high = lerp(lower[weights][2], upper[weights][2]);

  if (weightG < low * 0.8) {
    return {
      status: "underweight",
      message: `At ${ageMonths} months, expected range is ${Math.round(low)}–${Math.round(high)}g. Current ${weightG}g is significantly below the 25th percentile (${Math.round(low)}g). Review feeding schedule and consult vet if trend continues.`,
      percentile: "<25th",
    };
  } else if (weightG < low) {
    return {
      status: "underweight",
      message: `At ${ageMonths} months, ${weightG}g is below the 25th percentile (${Math.round(low)}g). Expected range: ${Math.round(low)}–${Math.round(high)}g. Monitor closely.`,
      percentile: "~25th",
    };
  } else if (weightG <= high) {
    return {
      status: "on-track",
      message: `At ${ageMonths} months, ${weightG}g is within the expected range (${Math.round(low)}–${Math.round(high)}g). Healthy growth trajectory.`,
      percentile: weightG <= mid ? "25th–50th" : "50th–75th",
    };
  } else {
    return {
      status: "above-average",
      message: `At ${ageMonths} months, ${weightG}g is above the 75th percentile (${Math.round(high)}g). Check for overfeeding — monitor body condition for scale spread.`,
      percentile: ">75th",
    };
  }
}

/**
 * Calculate recommended prey weight range for a given snake weight and life stage.
 */
export function calcPreyWeight(
  lifeStage: LifeStage,
  snakeWeightG: number,
): [min: number, max: number] {
  const minG = Math.round((snakeWeightG * lifeStage.preyWeightPct[0]) / 100 * 10) / 10;
  const maxG = Math.round((snakeWeightG * lifeStage.preyWeightPct[1]) / 100 * 10) / 10;
  return [minG, maxG];
}
