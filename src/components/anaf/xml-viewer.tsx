"use client";

import { Download, FileCode2, WrapText } from "lucide-react";
import * as React from "react";
import { CopyButton } from "@/components/anaf/copy-button";
import { saveText } from "@/components/anaf/download";
import { prettyXml } from "@/components/anaf/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_LINES = 4000;

/** Colorează un tag XML: <ns:Nume attr="valoare"> */
function Tag({ text }: { text: string }) {
  const m = text.match(/^(<\/?|<\?)([\w:.-]+)([\s\S]*?)(\/?>|\?>)$/);
  if (!m) return <span className="text-muted-foreground">{text}</span>;
  const [, open, name, attrs, close] = m;
  const colon = name.indexOf(":");
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g;
  let a: RegExpExecArray | null;
  let i = 0;
  while ((a = re.exec(attrs))) {
    if (a.index > last) parts.push(attrs.slice(last, a.index));
    parts.push(
      <React.Fragment key={i++}>
        <span className="text-info">{a[1]}</span>
        <span className="text-muted-foreground">{a[2]}</span>
        <span className="text-success-soft-foreground">{a[3]}</span>
      </React.Fragment>,
    );
    last = a.index + a[0].length;
  }
  if (last < attrs.length) parts.push(attrs.slice(last));
  return (
    <>
      <span className="text-muted-foreground">{open}</span>
      {colon > 0 && <span className="text-muted-foreground/80">{name.slice(0, colon + 1)}</span>}
      <span className="font-medium text-primary">{colon > 0 ? name.slice(colon + 1) : name}</span>
      {parts}
      <span className="text-muted-foreground">{close}</span>
    </>
  );
}

function Line({ text }: { text: string }) {
  const segments = text.split(/(<[^>]+>)/g).filter(Boolean);
  return (
    <>
      {segments.map((s, i) => (s.startsWith("<") ? <Tag key={i} text={s} /> : <span key={i}>{s}</span>))}
    </>
  );
}

/** Vizualizator XML cu formatare, evidențiere sintaxă, numere de linie, copiere și descărcare. */
export function XmlViewer({
  xml,
  filename = "document.xml",
  className,
  maxHeight = "max-h-[60vh]",
  title,
  toolbar,
}: {
  xml: string;
  filename?: string;
  className?: string;
  maxHeight?: string;
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const [wrap, setWrap] = React.useState(false);
  const pretty = React.useMemo(() => {
    try {
      return prettyXml(xml);
    } catch {
      return xml;
    }
  }, [xml]);
  const allLines = React.useMemo(() => pretty.split("\n"), [pretty]);
  const lines = allLines.slice(0, MAX_LINES);
  const kb = (new Blob([xml]).size / 1024).toFixed(1);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-subtle", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium text-foreground">{title ?? filename}</span>
          <span className="hidden shrink-0 sm:inline">
            · {allLines.length.toLocaleString("ro-RO")} linii · {kb.replace(".", ",")} KB
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {toolbar}
          <Tooltip content={wrap ? "Fără încadrare" : "Încadrează liniile"}>
            <Button variant={wrap ? "soft" : "ghost"} size="icon-xs" onClick={() => setWrap((w) => !w)} aria-label="Încadrare linii">
              <WrapText />
            </Button>
          </Tooltip>
          <CopyButton value={pretty} tooltip="Copiază XML" toastMessage="XML copiat" />
          <Tooltip content="Descarcă XML">
            <Button variant="ghost" size="icon-xs" onClick={() => saveText(xml, filename)} aria-label="Descarcă XML">
              <Download />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className={cn("scrollbar-thin overflow-auto", maxHeight)}>
        <pre className="py-2 font-mono text-[12px] leading-[1.6]">
          {lines.map((l, i) => (
            <div key={i} className="flex hover:bg-muted/50">
              <span className="sticky left-0 w-11 shrink-0 bg-subtle pr-3 text-right text-muted-foreground/50 select-none tabular">{i + 1}</span>
              <code className={cn("pr-4", wrap ? "break-all whitespace-pre-wrap" : "whitespace-pre")}>
                <Line text={l} />
              </code>
            </div>
          ))}
          {allLines.length > MAX_LINES && (
            <div className="px-14 py-2 text-muted-foreground">… încă {(allLines.length - MAX_LINES).toLocaleString("ro-RO")} linii (descarcă fișierul pentru conținutul complet)</div>
          )}
        </pre>
      </div>
    </div>
  );
}
