"use client";

import { ClipboardPaste, CircleCheck, CircleX, FileCheck2, FileUp, Loader2, ReceiptText, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { UblSummary } from "@/components/anaf/ubl-summary";
import { XmlDropzone, type PickedXml } from "@/components/anaf/xml-dropzone";
import { XmlViewer } from "@/components/anaf/xml-viewer";
import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseUbl, type ParsedUbl } from "@/lib/anaf/ubl-parse";
import { validateXmlAction } from "./actions";

type AnafResult = { ok: boolean; messages: string[]; traceId: string | null; standard: string };

/** Rezultatul validării ANAF: banner de succes sau lista de erori. */
export function ValidationResult({ result }: { result: AnafResult }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
      {result.ok ? (
        <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-soft/60 p-4">
          <motion.span
            initial={{ scale: 0.4, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white"
          >
            <CircleCheck className="size-5" />
          </motion.span>
          <div className="min-w-0">
            <p className="font-semibold text-success-soft-foreground">XML valid conform ANAF ({result.standard})</p>
            <p className="mt-0.5 text-[13px] text-success-soft-foreground/90">Fișierul respectă schema UBL 2.1 și regulile CIUS-RO. Poate fi transmis în e-Factura.</p>
            {result.traceId && <p className="mt-1 font-mono text-[11px] text-success-soft-foreground/70">trace_id {result.traceId}</p>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-danger/25 bg-danger-soft/50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger text-white">
              <CircleX className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-danger-soft-foreground">
                {result.messages.length} {result.messages.length === 1 ? "eroare de validare" : "erori de validare"} ({result.standard})
              </p>
              <p className="text-[13px] text-danger-soft-foreground/90">Corectează erorile de mai jos înainte de transmiterea în SPV.</p>
            </div>
          </div>
          <Stagger className="mt-3 space-y-1.5" stagger={0.03}>
            {(result.messages.length ? result.messages : ["ANAF a raportat XML-ul ca invalid, fără detalii."]).map((m, i) => (
              <StaggerItem key={i}>
                <div className="flex gap-2 rounded-lg bg-card/80 px-3 py-2 text-[13px]">
                  <span className="mt-0.5 font-mono text-[11px] text-danger">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 break-words">{m}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}
    </motion.div>
  );
}

export function ValidateTool() {
  const [source, setSource] = React.useState<"paste" | "file">("file");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<PickedXml | null>(null);
  const [result, setResult] = React.useState<AnafResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [checking, startChecking] = React.useTransition();

  const xml = (source === "file" ? file?.text : text)?.trim() ?? "";
  const deferred = React.useDeferredValue(xml);
  const local = React.useMemo<{ parsed: ParsedUbl | null; error: string | null }>(() => {
    if (!deferred) return { parsed: null, error: null };
    try {
      return { parsed: parseUbl(deferred), error: null };
    } catch (err) {
      return { parsed: null, error: err instanceof Error ? err.message : "XML invalid" };
    }
  }, [deferred]);

  React.useEffect(() => {
    setResult(null);
    setError(null);
  }, [xml]);

  const validate = () =>
    startChecking(async () => {
      setError(null);
      const r = await validateXmlAction(xml);
      if (r.ok) setResult(r.data);
      else {
        setResult(null);
        setError(r.error);
      }
    });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="h-fit">
        <CardHeaderRow
          icon={<FileCheck2 />}
          title="Validare XML e-Factura"
          description="Verificare oficială prin serviciul public ANAF (FACT1 / FCN)."
          actions={
            <Segmented
              size="sm"
              value={source}
              onChange={setSource}
              options={[
                { value: "file", label: "Fișier", icon: <FileUp /> },
                { value: "paste", label: "Lipește", icon: <ClipboardPaste /> },
              ]}
            />
          }
        />
        <CardContent className="space-y-4">
          <AnimatePresence mode="wait" initial={false}>
            {source === "file" ? (
              <motion.div key="file" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
                <XmlDropzone value={file} onChange={setFile} />
              </motion.div>
            ) : (
              <motion.div key="paste" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" …>'}
                  className="min-h-72 font-mono text-[12px]"
                  spellCheck={false}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {xml ? (
                local.parsed ? (
                  <>
                    <Badge tone="brand">{local.parsed.kind === "credit_note" ? "Notă de credit · FCN" : "Factură · FACT1"}</Badge>
                    <span>
                      {local.parsed.number} · {local.parsed.lines.length} linii
                    </span>
                  </>
                ) : (
                  <Badge tone="warning">
                    <TriangleAlert className="size-3" /> Nu pare o factură UBL
                  </Badge>
                )
              ) : (
                <span>Încarcă sau lipește un XML pentru a începe.</span>
              )}
            </div>
            <Button variant="gradient" onClick={validate} disabled={!xml || checking}>
              {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Validează la ANAF
            </Button>
          </div>

          <AnimatePresence mode="wait">
            {checking ? (
              <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" /> ANAF validează fișierul…
              </motion.div>
            ) : result ? (
              <ValidationResult key="result" result={result} />
            ) : error ? (
              <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2 rounded-xl bg-warning-soft p-4 text-[13px] text-warning-soft-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeaderRow icon={<ReceiptText />} title="Previzualizare locală" description="Interpretarea XML-ului direct în browser — fără a-l trimite nicăieri." />
        <CardContent>
          {local.parsed ? (
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Rezumat</TabsTrigger>
                <TabsTrigger value="xml">XML formatat</TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                <UblSummary data={local.parsed} />
              </TabsContent>
              <TabsContent value="xml">
                <XmlViewer xml={deferred} filename={file?.name ?? "factura.xml"} maxHeight="max-h-[60vh]" />
              </TabsContent>
            </Tabs>
          ) : local.error ? (
            <EmptyState compact icon={<TriangleAlert />} title="XML-ul nu a putut fi interpretat" description={local.error} />
          ) : (
            <EmptyState compact icon={<ReceiptText />} title="Nimic de afișat încă" description="Rezumatul facturii (furnizor, client, linii, totaluri) apare aici imediat ce adaugi un XML." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
