"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps, type Variants } from "motion/react";
import * as React from "react";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Element care apare cu fade + slide la montare. */
export function FadeIn({
  delay = 0,
  y = 10,
  duration = 0.5,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number; duration?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration, delay, ease: EASE_OUT }}
      {...props}
    />
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: (stagger: number = 0.05) => ({ transition: { staggerChildren: stagger, delayChildren: 0.04 } }),
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** Container care animă copiii <StaggerItem> unul după altul. */
export function Stagger({ stagger = 0.05, ...props }: HTMLMotionProps<"div"> & { stagger?: number }) {
  return <motion.div variants={staggerParent} initial="hidden" animate="show" custom={stagger} {...props} />;
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={staggerChild} {...props} />;
}

/** Număr animat (count-up) cu formatare personalizată. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("ro-RO"),
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [inView, value, duration, mv, reduce]);

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}

/** Bară de progres animată. */
export function AnimatedBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={className ?? "h-1.5 w-full overflow-hidden rounded-full bg-muted"}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color ?? "var(--primary)" }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
      />
    </div>
  );
}

export { AnimatePresence, motion } from "motion/react";
