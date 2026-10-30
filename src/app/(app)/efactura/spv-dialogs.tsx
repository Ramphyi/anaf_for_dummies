"use client";

import { Archive, Building2, ExternalLink, FileDown, Import, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { downloadFile, fetchFile, saveBlob } from "@/components/anaf/download";
import { UblSummary } from "@/components/anaf/ubl-summary";
import { SPV_TYPE } from "@/components/anaf/utils";
import { XmlViewer } from "@/components/anaf/xml-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { importSpvAction, openSpvMessageAction, type OpenedSpvMessage } from "./actions";
import type { SpvRow } from "./types";

/** Cache local al mesajelor deschise (evită re-descărcarea la redeschidere). */
const opened = new Map<string, OpenedSpvMessage>();

function useOpenedMessage(id: string | null, open: boolean) {
  const [data, setData] = React.useState<OpenedSpvMessage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!open || !id) return;
    let alive = true;
    const cached = opened.get(id);
    if (cached) {
      setData(cached);
      setError(null);
      return;
    }
    setData(null);
    setError(null);
    setLoading(true);
    openSpvMessageAction(id)
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          opened.set(id, r.data);
          setData(r.data);
        } else setError(r.error);
      })
      .catch(() => alive && setError("Eroare de rețea. Încearcă din nou."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, open, attempt]);

  return { data, error, loading, retry: () => setAttempt((a) => a + 1) };
}

function LoadingBody() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-40" />
      <p className="text-center text-xs text-muted-foreground">Se descarcă mesajul din SPV…</p>
    </div>
  );
}

/** Descărcare PDF prin serviciul ANAF (cu stare de încărcare). */
export function usePdfDownload() {
  const [busy, setBusy] = React.useState(false);
  const download = async (id: string, fallback: string) => {
    setBusy(true);
    const r = await fetchFile(`/api/spv/${id}/pdf`);
    setBusy(false);
    if (r) {
      saveBlob(r.blob, r.name ?? fallback);
      toast.success("PDF generat de ANAF");
    }
  };
  return { busy, download };
}

/** Dialog „Vezi XML”: rezumat parsat + XML formatat; deschiderea marchează mesajul ca citit. */
export function SpvMessageDialog({
  row,
  open,
  onOpenChange,
  onImport,
}: {
  row: SpvRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport?: (row: SpvRow) => void;
}) {
  const { data, error, loading, retry } = useOpenedMessage(row?.id ?? null, open);
  const pdf = usePdfDownload();
  const type = row ? (SPV_TYPE[row.type] ?? { label: row.type, tone: "neutral" as const }) : null;
  const purchaseId = data?.purchaseInvoiceId ?? row?.purchaseInvoiceId ?? null;
  const isInvoice = row?.type === "FACTURA PRIMITA";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {row && type && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={type.tone} dot>
                  {type.label}
                </Badge>
                {purchaseId && <Badge tone="success">Importată în cheltuieli</Badge>}
              </div>
              <DialogTitle className="mt-1">{data?.parsed?.supplier.name ?? row.issuerName ?? (row.issuerCui ? `CUI ${row.issuerCui}` : "Mesaj SPV")}</DialogTitle>
              <DialogDescription>
                {formatDateTime(row.createdAt)} · id mesaj <span className="font-mono">{row.anafId}</span>
                {data?.hasSignature && " · semnat electronic de MF"}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {loading ? (
                <LoadingBody />
              ) : error ? (
                <EmptyState
                  compact
                  icon={<TriangleAlert />}
                  title="Mesajul nu a putut fi deschis"
                  description={error}
                  action={
                    <Button variant="outline" onClick={retry}>
                      <RotateCcw /> Reîncearcă
                    </Button>
                  }
                />
              ) : data ? (
                data.parsed ? (
                  <Tabs defaultValue="summary">
                    <TabsList>
                      <TabsTrigger value="summary">
                        <ReceiptText /> Rezumat
                      </TabsTrigger>
                      <TabsTrigger value="xml">XML</TabsTrigger>
                    </TabsList>
                    <TabsContent value="summary">
                      <UblSummary data={data.parsed} />
                    </TabsContent>
                    <TabsContent value="xml">{data.xml && <XmlViewer xml={data.xml} filename={`${row.anafId}.xml`} maxHeight="max-h-[52vh]" />}</TabsContent>
                  </Tabs>
                ) : data.xml ? (
                  <div className="space-y-3">
                    {data.parseError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-soft-foreground">{data.parseError}</p>}
                    <XmlViewer xml={data.xml} filename={`${row.anafId}.xml`} maxHeight="max-h-[52vh]" />
                  </div>
                ) : (
                  <EmptyState compact icon={<Archive />} title="Mesajul nu conține un XML de factură" description={row.details ?? undefined} />
                )
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => void downloadFile(`/api/spv/${row.id}/zip`, `${row.anafId}.zip`)}>
                <Archive /> Descarcă ZIP
              </Button>
              {isInvoice && (
                <Button variant="outline" loading={pdf.busy} disabled={!data?.xml} onClick={() => void pdf.download(row.id, `${row.anafId}.pdf`)}>
                  {!pdf.busy && <FileDown />} PDF ANAF
                </Button>
              )}
              {isInvoice &&
                (purchaseId ? (
                  <Button asChild>
                    <Link href={`/cheltuieli/${purchaseId}`}>
                      <ExternalLink /> Vezi cheltuiala
                    </Link>
                  </Button>
                ) : (
                  onImport && (
                    <Button disabled={!data?.parsed} onClick={() => onImport(row)}>
                      <Import /> Importă ca cheltuială
                    </Button>
                  )
                ))}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Confirmarea importului unei facturi primite ca cheltuială (cu previzualizare și categorie sugerată). */
export function ImportDialog({ row, open, onOpenChange }: { row: SpvRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { data, error, loading, retry } = useOpenedMessage(row?.id ?? null, open);
  const [category, setCategory] = React.useState("altele");
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (data) setCategory(data.suggestedCategory);
  }, [data]);

  const p = data?.parsed;
  const submit = () => {
    if (!row) return;
    run(() => importSpvAction(row.id, category), {
      onSuccess: ({ purchaseId }) => {
        const cached = opened.get(row.id);
        if (cached) opened.set(row.id, { ...cached, purchaseInvoiceId: purchaseId });
        onOpenChange(false);
        toast.success(`Factura ${p?.number ?? ""} a fost importată ca cheltuială`, {
          description: p ? `${p.supplier.name} · ${formatMoney(p.payable || p.total, p.currency)}` : undefined,
          action: { label: "Deschide", onClick: () => router.push(`/cheltuieli/${purchaseId}`) },
          duration: 8000,
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="size-5 text-primary" /> Importă ca cheltuială
          </DialogTitle>
          <DialogDescription>Factura primită prin SPV devine o factură de achiziție, cu toate liniile și totalurile din XML.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="l" exit={{ opacity: 0 }} className="space-y-2">
                <Skeleton className="h-20" />
                <Skeleton className="h-9" />
              </motion.div>
            ) : error ? (
              <EmptyState
                compact
                icon={<TriangleAlert />}
                title="Factura nu a putut fi descărcată"
                description={error}
                action={
                  <Button variant="outline" onClick={retry}>
                    <RotateCcw /> Reîncearcă
                  </Button>
                }
              />
            ) : p ? (
              <motion.div key="p" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle p-4">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      CUI {p.supplier.cui ?? "—"} · factura <span className="font-medium text-foreground">{p.number}</span> · {p.lines.length}{" "}
                      {p.lines.length === 1 ? "linie" : "linii"}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-lg font-semibold tabular">{formatMoney(p.payable || p.total, p.currency)}</p>
                </div>
                <Field label="Categorie cheltuială" hint={category === data?.suggestedCategory ? "Sugerată automat după conținutul facturii" : undefined}>
                  <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <p className="text-xs text-muted-foreground">Dacă furnizorul nu există în nomenclator, va fi adăugat automat (marcat ca înregistrat în RO e-Factura).</p>
              </motion.div>
            ) : data ? (
              <p className="text-sm text-muted-foreground">Mesajul nu conține o factură care poate fi importată.</p>
            ) : null}
          </AnimatePresence>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Renunță
          </Button>
          <Button onClick={submit} loading={pending} disabled={!p}>
            {!pending && <Import />} Importă
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
