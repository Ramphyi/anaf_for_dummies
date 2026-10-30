"use client";

import { ArrowRight, ExternalLink, Trash2 } from "lucide-react";
import { Dialog as D } from "radix-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { deleteStockDocAction, getStockDocAction } from "@/app/(app)/stocuri/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { DetailRow } from "@/components/ui/page";
import { DOC_KIND_LABELS, STOCK_DOC_LABELS, UNITS } from "@/lib/constants";
import type { StockDocDetail } from "@/lib/products/stock-server";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import { StockDocTypeBadge } from "./stock-documents";

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** Panou lateral cu detaliile unui document de stoc și mișcările lui. */
export function StockDocSheet({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [doc, setDoc] = React.useState<StockDocDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  React.useEffect(() => {
    if (!docId) return;
    let alive = true;
    setLoading(true);
    getStockDocAction(docId).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.ok) setDoc(r.data);
      else {
        toast.error(r.error);
        onClose();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const manual = doc && doc.type !== "sale" && doc.type !== "sale_return";
  const isTransfer = doc?.type === "transfer";
  // la transfer afișăm doar ieșirile (o linie per produs)
  const rows = (doc ? (isTransfer ? doc.movements.filter((m) => m.quantity < 0) : doc.movements) : []).map((m) => {
    const qty = isTransfer ? -m.quantity : m.quantity;
    const value = round2(doc?.type === "inventory" ? qty * m.unitCost : Math.abs(qty) * m.unitCost);
    return { ...m, qty, value };
  });
  const total = round2(rows.reduce((s, m) => s + m.value, 0));
  const partnerBase = doc?.partner
    ? doc.type === "nir"
      ? doc.partner.kind === "client"
        ? "/clienti"
        : "/furnizori"
      : doc.partner.kind === "supplier"
        ? "/furnizori"
        : "/clienti"
    : "";

  return (
    <Sheet open={!!docId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl">
        <D.Title className="sr-only">Document de stoc</D.Title>
        <D.Description className="sr-only">Detaliile documentului și mișcările de stoc</D.Description>
        {loading || !doc ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="mt-6 h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-6 pt-6 pb-4 pr-12">
              <div className="flex items-center gap-2">
                <StockDocTypeBadge type={doc.type} />
                <h2 className="text-lg font-semibold tracking-tight tabular">{doc.number}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {STOCK_DOC_LABELS[doc.type]?.label} · {formatDate(doc.date)}
              </p>
            </div>
            <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="divide-y divide-border/70 rounded-xl border border-border px-4">
                <DetailRow label="Gestiune">
                  {isTransfer ? (
                    <span className="inline-flex items-center gap-1.5">
                      {doc.warehouseName} <ArrowRight className="size-3.5 text-muted-foreground" /> {doc.targetWarehouseName}
                    </span>
                  ) : (
                    doc.warehouseName
                  )}
                </DetailRow>
                {doc.partner && (
                  <DetailRow label={doc.type === "nir" ? "Furnizor" : "Client"}>
                    <Link href={`${partnerBase}/${doc.partner.id}`} className="text-primary hover:underline">
                      {doc.partner.name}
                    </Link>
                  </DetailRow>
                )}
                {doc.purchase && (
                  <DetailRow label="Factură de achiziție">
                    <Link href={`/cheltuieli/${doc.purchase.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {doc.purchase.number} <ExternalLink className="size-3" />
                    </Link>
                  </DetailRow>
                )}
                {doc.sale && (
                  <DetailRow label="Document de vânzare">
                    <Link href={`${DOC_KIND_LABELS[doc.sale.kind as keyof typeof DOC_KIND_LABELS]?.path ?? "/facturi"}/${doc.sale.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {doc.sale.fullNumber} <ExternalLink className="size-3" />
                    </Link>
                  </DetailRow>
                )}
                {doc.notes && <DetailRow label="Note">{doc.notes}</DetailRow>}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Produse ({rows.length})</h3>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-subtle/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <th className="px-3 py-2 text-left">Produs</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">Valoare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m, i) => {
                        const qty = m.qty;
                        return (
                          <tr key={m.id} className="anim-fade-up border-b border-border/60 last:border-0" style={{ animationDelay: `${i * 25}ms` }}>
                            <td className="px-3 py-2.5">
                              <div className="font-medium">{m.productName}</div>
                              {m.productCode && <div className="font-mono text-[11px] text-muted-foreground">{m.productCode}</div>}
                            </td>
                            <td className={cn("px-3 py-2.5 text-right whitespace-nowrap tabular", !isTransfer && (qty > 0 ? "text-success" : "text-danger"))}>
                              {!isTransfer && qty > 0 ? "+" : ""}
                              {formatNumber(qty)} <span className="text-xs text-muted-foreground">{unitLabel(m.unit)}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular">{formatMoney(m.unitCost)}</td>
                            <td className="px-3 py-2.5 text-right font-medium tabular">{formatMoney(m.value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-subtle/60">
                        <td colSpan={3} className="px-3 py-2.5 text-xs text-muted-foreground">
                          Total
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular">{formatMoney(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-subtle/60 px-6 py-4">
              {manual ? (
                <Button variant="destructive-soft" size="sm" onClick={() => setConfirm(true)}>
                  <Trash2 /> Șterge documentul
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Generat automat din factură</span>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                Închide
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
      {doc && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          destructive
          title={`Ștergi ${doc.number}?`}
          description={
            doc.purchase
              ? `Mișcările de stoc se anulează, iar factura ${doc.purchase.number} va putea fi recepționată din nou.`
              : "Mișcările de stoc generate de acest document se anulează. Acțiunea nu poate fi revenită."
          }
          confirmLabel="Șterge"
          onConfirm={async () => {
            const r = await deleteStockDocAction(doc.id);
            if (r.ok) {
              toast.success(r.message ?? "Document șters");
              onClose();
              router.refresh();
            } else toast.error(r.error);
          }}
        />
      )}
    </Sheet>
  );
}
