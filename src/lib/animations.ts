/**
 * Shared Framer Motion animation variants for consistent page transitions.
 *
 * Uses `as const` to ensure TypeScript infers literal types for
 * the `type: "spring"` transition property — required by framer-motion's
 * strict `Variants` type.
 */
import type { Variants } from "framer-motion";

/** Staggered container — apply to wrapper, children get `item` variants */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

/** Individual item — spring-physics entrance */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

/** Tap spring config — for buttons/cards */
export const tapSpring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 17,
};
