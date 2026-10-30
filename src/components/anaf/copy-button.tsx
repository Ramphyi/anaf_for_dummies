"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/popover";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback pentru contexte non-securizate (http pe IP din rețea)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Buton de copiere cu feedback animat (bifă). */
export function CopyButton({
  value,
  label,
  toastMessage = "Copiat în clipboard",
  size = "icon-xs",
  variant = "ghost",
  className,
  tooltip = "Copiază",
}: {
  value: string;
  label?: React.ReactNode;
  toastMessage?: string | null;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  tooltip?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(value);
    if (!ok) {
      toast.error("Nu am putut copia textul.");
      return;
    }
    setCopied(true);
    if (toastMessage) toast.success(toastMessage);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const icon = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={copied ? "ok" : "copy"}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="inline-flex"
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </motion.span>
    </AnimatePresence>
  );
  const button = (
    <Button type="button" variant={variant} size={size} onClick={onClick} className={className} aria-label={tooltip}>
      {icon}
      {label}
    </Button>
  );
  return label ? button : <Tooltip content={copied ? "Copiat!" : tooltip}>{button}</Tooltip>;
}
