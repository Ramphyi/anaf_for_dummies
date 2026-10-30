"use client";

import { motion } from "motion/react";

/** Tranziție la fiecare navigare între pagini. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
      // `transitionEnd` scoate filter/transform după animație: altfel elementele `position: fixed` din pagini se raportează la acest wrapper.
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
