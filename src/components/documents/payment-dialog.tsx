"use client";

import { Banknote, FileText, Printer, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, InputGroup, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { CASH_LIMITS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/lib/db/schema";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { recordPaymentAction } from "./actions";
import { parseNum } from "./shared";

export type InvoiceOption = {
  id: string;
  fullNumber: string;
  clientName: string;
  remaining: number;
  total: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
};

const amountStr = (n: number) => n.toFixed(2).replace(".", ",");

/** Dialog „Încasare nouă”: alege factura (sau e fixată), suma se precompletează cu restul de plată. */
export function PaymentDialog({
  invoices,
  invoiceId,
  open: openProp,
  onOpenChange,
  trigger,
  onSaved,
}: {
  invoices: InvoiceOption[];
  invoiceId?: string | null;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: React.ReactNode;
  onSaved?: () => void;
}) {
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const { run, pending } = useAction();

  const [documentId, setDocumentId] = React.useState(invoiceId ?? "");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState<PaymentMethod>("bank");
  const [reference, setReference] = React.useState("");
  const [issueReceipt, setIssueReceipt] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const invoice = invoices.find((i) => i.id === documentId);

  React.useEffect(() => {
    if (!open) return;
    const id = invoiceId ?? "";
    setDocumentId(id);
    const inv = invoices.find((i) => i.id === id);
    setAmount(inv ? amountStr(inv.remaining) : "");
    setDate(todayIso());
    setMethod("bank");
    setReference("");
    setIssueReceipt(true);
    setErrors({});
  }, [open, invoiceId, invoices]);

  const pickInvoice = (id: string) => {
    setDocumentId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(amountStr(inv.remaining));
    setErrors({});
  };

  const value = parseNum(amount);
  const over = invoice ? value > invoice.remaining + 0.009 : false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId) {
      setErrors({ documentId: "Alege factura" });
      return;
    }
    run(() => recordPaymentAction({ documentId, date, amount: value, method, reference, issueReceipt: method === "cash" && issueReceipt }), {
      success: "",
      onSuccess: (p) => {
        setOpen(false);
        onSaved?.();
        if (p.receiptNumber) {
          toast.success(`Încasare înregistrată · chitanța ${p.receiptSeries} nr. ${p.receiptNumber}`, {
            action: { label: "Tipărește", onClick: () => window.open(`/print/chitanta/${p.id}`, "_blank") },
          });
        } else toast.success("Încasare înregistrată");
      },
      onError: (_e, fe) => setErrors(fe ?? {}),
    });
  };

  const options = invoices.map((i) => ({
    value: i.id,
    label: `${i.fullNumber} · ${i.clientName}`,
    description: `Rest ${formatMoney(i.remaining, i.currency)} din ${formatMoney(i.total, i.currency)}${i.dueDate ? ` · scadentă ${formatDate(i.dueDate)}` : ""}`,
    keywords: [i.clientName, i.fullNumber],
    icon: <FileText className="size-4 text-muted-foreground" />,
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
                <Wallet className="size-4" />
              </span>
              Încasare nouă
            </DialogTitle>
            <DialogDescription>Înregistrează o plată primită pentru o factură emisă.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!invoiceId ? (
              <Field label="Factură" required error={errors.documentId || null}>
                <Combobox
                  options={options}
                  value={documentId}
                  onChange={pickInvoice}
                  placeholder="Alege o factură neîncasată…"
                  searchPlaceholder="Caută după număr sau client…"
                  emptyText="Nicio factură cu rest de plată"
                  invalid={!!errors.documentId}
                />
              </Field>
            ) : (
              invoice && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-subtle px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{invoice.fullNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">{invoice.clientName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Rest de plată</p>
                    <p className="font-semibold tabular">{formatMoney(invoice.remaining, invoice.currency)}</p>
                  </div>
                </div>
              )
            )}

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Sumă" required error={errors.amount || (over ? "Suma depășește restul de plată" : null)}>
                <InputGroup
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  suffix={invoice?.currency ?? "RON"}
                  className="tabular"
                  aria-invalid={over || undefined}
                />
              </Field>
              <Field label="Data încasării" required error={errors.date || null}>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            {invoice && invoice.remaining > 0 && (
              <div className="-mt-2 flex flex-wrap gap-1.5">
                {[1, 0.5].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAmount(amountStr(Math.round(invoice.remaining * f * 100) / 100))}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
                  >
                    {f === 1 ? "Integral" : "50%"} · {formatMoney(invoice.remaining * f, invoice.currency)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Metodă">
                <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Referință" hint="Nr. OP, extras de cont…">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opțional" />
              </Field>
            </div>

            <AnimatePresence initial={false}>
              {method === "cash" && (
                <motion.label
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 overflow-hidden rounded-xl border p-3.5 transition-colors",
                    issueReceipt ? "border-primary/40 bg-primary-soft/50" : "border-border",
                  )}
                >
                  <Checkbox checked={issueReceipt} onCheckedChange={(v) => setIssueReceipt(v === true)} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Printer className="size-3.5" /> Emite chitanță
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Se alocă automat următorul număr din seria de chitanțe.</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Plafon numerar (Legea 70/2015): {formatMoney(CASH_LIMITS.company, "RON")}/zi de la o firmă, {formatMoney(CASH_LIMITS.individual, "RON")}/zi de la o persoană fizică.
                    </span>
                  </span>
                </motion.label>
              )}
            </AnimatePresence>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" variant="success" loading={pending} disabled={over || !value}>
              {!pending && <Banknote />} Înregistrează încasarea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
