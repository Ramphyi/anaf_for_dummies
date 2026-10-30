"use client";

import * as React from "react";
import { recordPurchasePaymentAction } from "@/app/(app)/cheltuieli/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, InputGroup, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatMoney, todayIso } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";

/** Dialog „Înregistrează plată” către furnizor (payments.direction = "out"). */
export function PurchasePaymentDialog({
  purchase,
  trigger,
}: {
  purchase: { id: string; number: string; supplierName: string; currency: string; total: number; paidAmount: number };
  trigger: React.ReactNode;
}) {
  const rest = round2(Math.max(0, purchase.total - purchase.paidAmount));
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(todayIso());
  const [amount, setAmount] = React.useState(String(rest));
  const [method, setMethod] = React.useState("op");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setDate(todayIso());
      setAmount(String(rest));
      setReference("");
      setNotes("");
    }
  }, [open, rest]);

  const value = Number(amount.replace(",", "."));
  const over = value > rest + 0.009;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => recordPurchasePaymentAction({ purchaseInvoiceId: purchase.id, date, amount: value, method: method as never, reference, notes }), {
      onSuccess: () => setOpen(false),
      refresh: true,
    });
  };

  const chips = [
    { label: "Integral", v: rest },
    { label: "50%", v: round2(rest / 2) },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Înregistrează plată</DialogTitle>
            <DialogDescription>
              Factura {purchase.number} · {purchase.supplierName} — rest de plată <span className="font-medium text-foreground">{formatMoney(rest, purchase.currency)}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Sumă" error={over ? "Suma depășește restul de plată" : null}>
              <InputGroup type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} suffix={purchase.currency} autoFocus aria-invalid={over || undefined} />
            </Field>
            <div className="-mt-2 flex gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setAmount(String(c.v))}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
                    Math.abs(value - c.v) < 0.005 ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label} · {formatMoney(c.v, purchase.currency)}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data plății">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" required />
              </Field>
              <Field label="Metodă">
                <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Referință" hint="ex. număr OP, extras de cont">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="OP 1234" />
            </Field>
            <Field label="Observații">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={pending} disabled={!(value > 0) || over}>
              Înregistrează {value > 0 ? formatMoney(value, purchase.currency) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
