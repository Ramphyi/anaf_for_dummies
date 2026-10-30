"use client";

import { Check, Copy, Download, FileCode2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Indentare simplă a unui XML pe o singură linie (pentru lizibilitate). */
function prettyXml(xml: string) {
  if (xml.includes("\n  <")) return xml;
  let depth = 0;
  return xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((line) => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++;
      return out;
    })
    .join("\n");
}

/** Vizualizare XML e-Factura (UBL) stocat la importul din SPV. */
export function XmlDialog({ xml, filename, open, onOpenChange }: { xml: string; filename: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [copied, setCopied] = React.useState(false);
  const pretty = React.useMemo(() => (open ? prettyXml(xml) : ""), [xml, open]);

  const copy = async () => {
    await navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="size-5 text-primary" /> XML e-Factura
          </DialogTitle>
          <DialogDescription>Fișierul UBL 2.1 (CIUS-RO) descărcat din SPV, exact cum a fost primit.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <pre className="scrollbar-thin max-h-[60vh] overflow-auto rounded-xl border border-border bg-subtle p-4 font-mono text-[11.5px] leading-relaxed text-foreground/90">{pretty}</pre>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copiat" : "Copiază"}
          </Button>
          <Button onClick={download}>
            <Download /> Descarcă XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
