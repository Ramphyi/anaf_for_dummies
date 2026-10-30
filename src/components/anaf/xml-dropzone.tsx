"use client";

import { FileCode2, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;

export type PickedXml = { name: string; size: number; text: string; file: File };

/** Zonă de încărcare pentru fișiere XML (click sau drag & drop). */
export function XmlDropzone({
  value,
  onChange,
  className,
  hint = "Factură UBL 2.1 / CIUS-RO, maximum 5 MB",
}: {
  value: PickedXml | null;
  onChange: (v: PickedXml | null) => void;
  className?: string;
  hint?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && !file.type.includes("xml")) {
      toast.error("Selectează un fișier .xml");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Fișierul depășește 5 MB.");
      return;
    }
    const text = await file.text();
    onChange({ name: file.name, size: file.size, text, file });
  };

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        {value ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <FileCode2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{value.name}</p>
              <p className="text-xs text-muted-foreground">{(value.size / 1024).toFixed(1).replace(".", ",")} KB</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
              Schimbă
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label="Elimină fișierul">
              <X />
            </Button>
          </motion.div>
        ) : (
          <motion.button
            key="drop"
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-subtle/60 px-6 py-10 text-center transition-all hover:border-primary/50 hover:bg-primary-soft/30",
              over && "scale-[1.01] border-primary bg-primary-soft/40",
            )}
          >
            <div className="grid size-12 place-items-center rounded-2xl bg-card text-primary shadow-soft transition-transform group-hover:-translate-y-0.5">
              <UploadCloud className="size-6" />
            </div>
            <p className="text-sm font-medium">
              Trage fișierul XML aici sau <span className="text-primary">alege de pe calculator</span>
            </p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
