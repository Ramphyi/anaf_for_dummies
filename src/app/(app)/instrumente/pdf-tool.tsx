"use client";

import { Download, ExternalLink, FileDown, FileText, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { fetchFile, saveBlob } from "@/components/anaf/download";
import { XmlDropzone, type PickedXml } from "@/components/anaf/xml-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";

export function PdfTool() {
  const [file, setFile] = React.useState<PickedXml | null>(null);
  const [validate, setValidate] = React.useState(false);
  const [pdf, setPdf] = React.useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => () => {
    if (pdf) URL.revokeObjectURL(pdf.url);
  }, [pdf]);

  React.useEffect(() => setPdf(null), [file]);

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.append("file", file.file);
    const r = await fetchFile(`/api/tools/xml-to-pdf${validate ? "?validate=1" : ""}`, { method: "POST", body });
    setBusy(false);
    if (!r) return;
    const name = r.name ?? file.name.replace(/\.xml$/i, ".pdf");
    setPdf({ url: URL.createObjectURL(r.blob), name, blob: r.blob });
    toast.success("PDF generat de ANAF");
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeaderRow icon={<FileDown />} title="Conversie XML → PDF" description="Formatul oficial de vizualizare ANAF, generat de serviciul public de transformare." />
        <CardContent className="space-y-4">
          <XmlDropzone value={file} onChange={setFile} />
          <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
            <Checkbox checked={validate} onCheckedChange={(v) => setValidate(v === true)} className="mt-0.5" />
            <span>
              <span className="block font-medium">Validează înainte de conversie</span>
              <span className="block text-xs text-muted-foreground">ANAF refuză conversia dacă XML-ul are erori de validare.</span>
            </span>
          </label>
          <Button variant="gradient" className="w-full" onClick={convert} disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <FileText />} Generează PDF
          </Button>
          <p className="text-xs text-muted-foreground">Fișierul este trimis doar către serviciul public ANAF (webservicesp.anaf.ro) și nu este salvat în AND.</p>
        </CardContent>
      </Card>

      <Card className="min-h-[420px] overflow-hidden">
        <AnimatePresence mode="wait">
          {pdf ? (
            <motion.div key="pdf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <p className="truncate text-sm font-medium">{pdf.name}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={pdf.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> Tab nou
                    </a>
                  </Button>
                  <Button size="sm" onClick={() => saveBlob(pdf.blob, pdf.name)}>
                    <Download /> Descarcă PDF
                  </Button>
                </div>
              </div>
              <iframe src={pdf.url} title="Previzualizare PDF" className="h-[70vh] w-full bg-muted" />
            </motion.div>
          ) : busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid h-full min-h-[420px] place-items-center">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                ANAF generează PDF-ul…
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState
                icon={<FileText />}
                title="Previzualizarea PDF apare aici"
                description="Încarcă XML-ul unei facturi (de ex. descărcat din SPV) și generează reprezentarea vizuală oficială, gata de tipărit sau arhivat."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
