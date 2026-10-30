"use client";

import { CircleCheck, ExternalLink, FileCode2, FileDown, Loader2, ReceiptText, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { fetchFile, saveBlob, saveText } from "@/components/anaf/download";
import { UblSummary } from "@/components/anaf/ubl-summary";
import { XmlViewer } from "@/components/anaf/xml-viewer";
import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseUbl } from "@/lib/anaf/ubl-parse";
import { EFACTURA_STATUS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { previewUblAction, validateXmlAction } from "./actions";
import { ValidationResult } from "./validate-tool";

export type InvoiceOption = { id: string; fullNumber: string; clientName: string; issueDate: string; total: number; currency: string; efacturaStatus: string };
type Preview = { xml: string; errors: string[]; number: string; status: string; id: string };

export function UblTool({ invoices, initialDocument }: { invoices: InvoiceOption[]; initialDocument: string | null }) {
  const [docId, setDocId] = React.useState<string | null>(initialDocument);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();
  const [anaf, setAnaf] = React.useState<{ ok: boolean; messages: string[]; traceId: string | null; standard: string } | null>(null);
  const [validating, startValidating] = React.useTransition();
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const load = React.useCallback((id: string) => {
    setDocId(id);
    setAnaf(null);
    setError(null);
    startLoading(async () => {
      const r = await previewUblAction(id);
      if (r.ok) setPreview(r.data);
      else {
        setPreview(null);
        setError(r.error);
      }
    });
  }, []);

  const ran = React.useRef(false);
  React.useEffect(() => {
    if (initialDocument && !ran.current) {
      ran.current = true;
      load(initialDocument);
    }
  }, [initialDocument, load]);

  const parsed = React.useMemo(() => {
    if (!preview) return null;
    try {
      return parseUbl(preview.xml);
    } catch {
      return null;
    }
  }, [preview]);

  const validate = () =>
    preview &&
    startValidating(async () => {
      const r = await validateXmlAction(preview.xml);
      if (r.ok) setAnaf(r.data);
      else toast.error(r.error);
    });

  const pdf = async () => {
    if (!preview) return;
    setPdfBusy(true);
    const r = await fetchFile("/api/tools/xml-to-pdf", { method: "POST", headers: { "Content-Type": "text/xml" }, body: preview.xml });
    setPdfBusy(false);
    if (r) saveBlob(r.blob, r.name ?? `${preview.number}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeaderRow icon={<FileCode2 />} title="Previzualizare UBL CIUS-RO" description="Vezi exact XML-ul pe care AND îl transmite în e-Factura pentru o factură emisă, cu prevalidarea regulilor BR-RO." />
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Combobox
              options={invoices.map((i) => ({
                value: i.id,
                label: `${i.fullNumber} — ${i.clientName}`,
                description: `${formatDate(i.issueDate)} · ${formatMoney(i.total, i.currency)}`,
              }))}
              value={docId}
              onChange={(id) => id && load(id)}
              placeholder={invoices.length ? "Alege o factură emisă…" : "Nu există facturi emise"}
              searchPlaceholder="Caută după număr sau client…"
              disabled={!invoices.length}
            />
          </div>
          {preview && (
            <div className="flex flex-wrap gap-2">
              <Button variant="gradient" onClick={validate} disabled={validating}>
                {validating ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Validează la ANAF
              </Button>
              <Button variant="outline" onClick={pdf} loading={pdfBusy}>
                {!pdfBusy && <FileDown />} PDF ANAF
              </Button>
              <Button variant="ghost" asChild>
                <Link href={`/facturi/${preview.id}`}>
                  <ExternalLink /> Factura
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </motion.div>
        ) : error ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <EmptyState compact icon={<TriangleAlert />} title="XML-ul nu a putut fi generat" description={error} />
            </Card>
          </motion.div>
        ) : preview ? (
          <motion.div
            key={preview.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]"
          >
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Factura {preview.number}</p>
                    <StatusBadge status={preview.status} map={EFACTURA_STATUS} />
                  </div>
                  {preview.errors.length ? (
                    <div className="rounded-xl border border-danger/25 bg-danger-soft/50 p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-danger-soft-foreground">
                        <TriangleAlert className="size-4" /> {preview.errors.length} {preview.errors.length === 1 ? "problemă" : "probleme"} la prevalidare
                      </p>
                      <Stagger className="mt-2 space-y-1.5" stagger={0.03}>
                        {preview.errors.map((e, i) => (
                          <StaggerItem key={i}>
                            <p className="rounded-lg bg-card/80 px-2.5 py-1.5 text-[13px] break-words">{e}</p>
                          </StaggerItem>
                        ))}
                      </Stagger>
                      <p className="mt-2 text-xs text-danger-soft-foreground/80">Factura va fi respinsă local la trimitere până la corectarea acestor date.</p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-soft/60 p-3">
                      <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
                      <div>
                        <p className="text-sm font-semibold text-success-soft-foreground">Prevalidare CIUS-RO fără erori</p>
                        <p className="text-xs text-success-soft-foreground/85">Regulile locale (BR-RO, BR-S, coduri) sunt respectate. Confirmă cu validarea oficială ANAF.</p>
                      </div>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => saveText(preview.xml, `${preview.number}.xml`)}>
                    <FileCode2 /> Descarcă XML
                  </Button>
                </CardContent>
              </Card>
              <AnimatePresence>{anaf && <ValidationResult result={anaf} />}</AnimatePresence>
            </div>

            <Card className="min-w-0">
              <CardContent className="p-4 sm:p-5">
                <Tabs defaultValue="xml">
                  <TabsList>
                    <TabsTrigger value="xml">
                      <FileCode2 /> XML
                    </TabsTrigger>
                    <TabsTrigger value="summary" disabled={!parsed}>
                      <ReceiptText /> Rezumat
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="xml">
                    <XmlViewer xml={preview.xml} filename={`${preview.number}.xml`} maxHeight="max-h-[70vh]" />
                  </TabsContent>
                  <TabsContent value="summary">{parsed && <UblSummary data={parsed} />}</TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <EmptyState
                icon={<FileCode2 />}
                title="Alege o factură pentru a vedea XML-ul UBL"
                description="AND generează XML-ul conform UBL 2.1 / CIUS-RO 1.0.1 și verifică local regulile de business înainte de transmitere."
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
