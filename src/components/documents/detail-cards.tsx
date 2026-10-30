"use client";

import { Check, CircleDashed, Clock, FileCode2, FlaskConical, Info, Plus, Printer, RefreshCw, Send, ShieldCheck, Trash2, Undo2, Wallet, X } from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";
import { AnimatedBar } from "@/components/motion";
import { EfacturaBadge } from "@/components/anaf/efactura-badge";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { EFACTURA_STATUS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deletePaymentAction } from "./actions";
import { useSpvActions } from "./document-actions";
import { PaymentDialog, type InvoiceOption } from "./payment-dialog";

export type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  receiptSeries: string | null;
  receiptNumber: number | null;
};

export function PaymentsCard({
  total,
  paidAmount,
  currency,
  payments,
  invoiceOption,
  canAdd,
  canDelete = true,
}: {
  total: number;
  paidAmount: number;
  currency: string;
  payments: PaymentRow[];
  invoiceOption: InvoiceOption | null;
  canAdd: boolean;
  canDelete?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<PaymentRow | null>(null);
  const { run } = useAction();
  const pct = total > 0 ? (paidAmount / total) * 100 : 0;
  const rest = Math.max(0, Math.round((total - paidAmount) * 100) / 100);

  return (
    <Card>
      <CardHeaderRow
        title="Încasări"
        icon={<Wallet />}
        description={payments.length ? `${payments.length} ${payments.length === 1 ? "plată" : "plăți"}` : "Nicio plată înregistrată"}
        actions={
          canAdd && invoiceOption ? (
            <Button size="xs" variant="soft" onClick={() => setOpen(true)}>
              <Plus /> Adaugă
            </Button>
          ) : undefined
        }
      />
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-semibold tabular">{formatMoney(paidAmount, currency)}</span>
            <span className="text-xs text-muted-foreground tabular">din {formatMoney(total, currency)}</span>
          </div>
          <AnimatedBar value={pct} color={pct >= 99.9 ? "var(--success)" : "var(--primary)"} />
          <p className={cn("mt-1.5 text-xs", rest > 0 ? "text-muted-foreground" : "text-success")}>
            {rest > 0 ? `Rest de plată: ${formatMoney(rest, currency)}` : "Încasată integral"}
          </p>
        </div>
        {payments.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {payments.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group flex items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular">{formatMoney(p.amount, currency)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(p.date)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                {p.receiptNumber && (
                  <Tooltip content="Tipărește chitanța">
                    <a
                      href={`/print/chitanta/${p.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Printer className="size-3" /> {p.receiptSeries} {p.receiptNumber}
                    </a>
                  </Tooltip>
                )}
                {canDelete && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setToDelete(p)}
                    className="opacity-60 group-hover:opacity-100 hover:bg-danger-soft hover:text-danger"
                    aria-label="Șterge încasarea"
                  >
                    <Trash2 />
                  </Button>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </CardContent>
      {invoiceOption && <PaymentDialog invoices={[invoiceOption]} invoiceId={invoiceOption.id} open={open} onOpenChange={setOpen} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Ștergi încasarea?"
        description={
          toDelete
            ? `Plata de ${formatMoney(toDelete.amount, currency)} din ${formatDate(toDelete.date)} va fi ștearsă, iar statusul facturii se recalculează.`
            : undefined
        }
        confirmLabel="Șterge"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) => {
            if (!toDelete) return resolve();
            run(() => deletePaymentAction(toDelete.id), { onSuccess: () => resolve(), onError: () => resolve() });
          })
        }
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type Step = { key: string; label: string; detail?: string | null; state: "done" | "active" | "error" | "todo" };

export function EfacturaCard({
  docId,
  status,
  simulated,
  uploadId,
  downloadId,
  message,
  sentAt,
  issuedAt,
  validatedAt,
  isDraft,
  cancelled,
  canAnaf,
}: {
  docId: string;
  status: string;
  /** Transmisă în modul simulare: statusurile sunt generate local, nimic nu a ajuns la ANAF. */
  simulated: boolean;
  uploadId: string | null;
  downloadId: string | null;
  message: string | null;
  sentAt: Date | string | null;
  issuedAt: Date | string | null;
  validatedAt: Date | string | null;
  isDraft: boolean;
  cancelled: boolean;
  canAnaf: boolean;
}) {
  const spv = useSpvActions(docId);
  const failed = status === "nok" || status === "error";
  const steps: Step[] = [
    { key: "issued", label: "Factură emisă", detail: issuedAt ? formatDateTime(issuedAt) : null, state: isDraft ? "todo" : "done" },
    {
      key: "sent",
      label: simulated ? "Transmisă (simulare)" : "Transmisă în SPV",
      detail: status !== "none" ? [sentAt ? formatDateTime(sentAt) : null, uploadId ? `index ${uploadId}` : null].filter(Boolean).join(" · ") : null,
      state: status === "none" ? "todo" : status === "error" && !uploadId ? "error" : "done",
    },
    {
      key: "processing",
      label: "Prelucrare ANAF",
      detail: status === "processing" || status === "pending" ? "În curs — de obicei durează câteva minute" : null,
      state: status === "processing" || status === "pending" ? "active" : status === "ok" || status === "nok" ? "done" : "todo",
    },
    {
      key: "final",
      label: status === "nok" ? "Respinsă de ANAF" : status === "error" ? "Eroare de transmitere" : simulated ? "Validată (simulare)" : "Validată de ANAF",
      detail:
        status === "ok"
          ? [validatedAt ? formatDateTime(validatedAt) : null, downloadId ? `id descărcare ${downloadId}` : null].filter(Boolean).join(" · ")
          : null,
      state: status === "ok" ? "done" : failed ? "error" : "todo",
    },
  ];
  const errors = (message ?? "").split("\n").filter(Boolean);
  const canSend = canAnaf && !isDraft && !cancelled && ["none", "nok", "error"].includes(status);
  const canCheck = canAnaf && (status === "processing" || status === "pending");

  return (
    <Card>
      <CardHeaderRow
        title="e-Factura"
        icon={<ShieldCheck />}
        actions={<EfacturaBadge status={status} simulated={simulated} />}
      />
      <CardContent className="space-y-4">
        {simulated && status !== "none" && (
          <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning-soft-foreground">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Mod simulare — factura NU a fost trimisă la ANAF</p>
              <p>Statusurile de mai jos sunt generate local, pentru test. Transmiterea reală pornește după ce conectezi certificatul în e-Factura → Setări conexiune.</p>
              {canAnaf && !isDraft && (
                <Button size="xs" variant="outline" className="mt-1" onClick={spv.retract} loading={spv.pending}>
                  {!spv.pending && <Undo2 />} Retrage transmiterea simulată
                </Button>
              )}
            </div>
          </div>
        )}
        <ol className="relative space-y-0">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && (
                <span className={cn("absolute top-6 left-[11px] h-[calc(100%-1rem)] w-px", s.state === "done" ? "bg-success/50" : "bg-border")} />
              )}
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: "spring", bounce: 0.4, duration: 0.5 }}
                className={cn(
                  "relative z-10 grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-card",
                  s.state === "done" && "bg-success text-white",
                  s.state === "active" && "bg-warning-soft text-warning",
                  s.state === "error" && "bg-danger text-white",
                  s.state === "todo" && "bg-muted text-muted-foreground",
                )}
              >
                {s.state === "done" ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : s.state === "error" ? (
                  <X className="size-3.5" strokeWidth={3} />
                ) : s.state === "active" ? (
                  <Clock className="size-3.5 animate-pulse" />
                ) : (
                  <CircleDashed className="size-3.5" />
                )}
              </motion.span>
              <div className="min-w-0 pt-0.5">
                <p className={cn("text-sm font-medium", s.state === "todo" && "text-muted-foreground")}>{s.label}</p>
                {s.detail && <p className="text-xs break-all text-muted-foreground">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>

        {failed && errors.length > 0 && (
          <div className="rounded-xl border border-danger/25 bg-danger-soft p-3 text-xs text-danger-soft-foreground">
            <p className="mb-1 font-semibold">{status === "nok" ? "Erori de validare ANAF" : "Eroare"}</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {!simulated && status === "ok" && (
          <div className="flex gap-2.5 rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Factura este în SPV și nu mai poate fi retrasă sau ștearsă. Dacă e greșită, emite o <strong>factură storno</strong> (Mai multe → Stornează), care o
              referă și se transmite tot în SPV — art. 330 Cod fiscal.
            </p>
          </div>
        )}

        {!isDraft && (
          <div className="flex flex-wrap gap-2">
            {canSend && (
              <Button size="sm" variant="soft" onClick={spv.send} loading={spv.pending}>
                {!spv.pending && <Send />} {status === "none" ? "Trimite în SPV" : "Retrimite"}
              </Button>
            )}
            {canCheck && (
              <Button size="sm" variant="soft" onClick={spv.check} loading={spv.pending}>
                {!spv.pending && <RefreshCw />} Verifică status
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/documents/${docId}/xml`} download>
                <FileCode2 /> XML
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Cardurile laterale interactive din pagina de detaliu. */
export function DetailCards({
  showPayments,
  showEfactura,
  payments,
  efactura,
}: {
  showPayments: boolean;
  showEfactura: boolean;
  payments: { total: number; paidAmount: number; currency: string; invoiceOption: InvoiceOption | null; canAdd: boolean; rows: PaymentRow[] };
  efactura: React.ComponentProps<typeof EfacturaCard>;
}) {
  return (
    <>
      {showPayments && (
        <PaymentsCard
          total={payments.total}
          paidAmount={payments.paidAmount}
          currency={payments.currency}
          payments={payments.rows}
          invoiceOption={payments.invoiceOption}
          canAdd={payments.canAdd}
        />
      )}
      {showEfactura && <EfacturaCard {...efactura} />}
    </>
  );
}
