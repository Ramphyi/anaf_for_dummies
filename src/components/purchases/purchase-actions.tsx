"use client";

import { Ban, FileCode2, HandCoins, MoreHorizontal, PackageCheck, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { deletePurchaseAction, deletePurchasePaymentAction, setPurchaseCancelledAction } from "@/app/(app)/cheltuieli/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAction } from "@/hooks/use-action";
import { PurchasePaymentDialog } from "./payment-dialog";
import { ReceiveStockDialog, type ReceiveLine, type TrackedProduct, type WarehouseOption } from "./receive-stock-dialog";
import { XmlDialog } from "./xml-dialog";

export type PurchaseSummary = {
  id: string;
  number: string;
  supplierName: string;
  issueDate: string;
  currency: string;
  exchangeRate: number;
  total: number;
  paidAmount: number;
  status: string;
  source: "manual" | "spv";
  stockReceived: boolean;
};

export type ReceiveContext = { lines: ReceiveLine[]; products: TrackedProduct[]; warehouses: WarehouseOption[] };

/** Acțiunile din antetul unei facturi primite. */
export function PurchaseActions({ purchase, xml, receive }: { purchase: PurchaseSummary; xml: string | null; receive: ReceiveContext | null }) {
  const router = useRouter();
  const [xmlOpen, setXmlOpen] = React.useState(false);
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "cancel" | "delete">(null);
  const { run } = useAction();
  const open = purchase.status === "unpaid" || purchase.status === "partially_paid";
  const cancelled = purchase.status === "cancelled";

  return (
    <>
      {open && (
        <PurchasePaymentDialog
          purchase={purchase}
          trigger={
            <Button>
              <HandCoins /> Înregistrează plată
            </Button>
          }
        />
      )}
      {xml && (
        <Button variant="outline" onClick={() => setXmlOpen(true)}>
          <FileCode2 /> Vezi XML
        </Button>
      )}
      {!cancelled && (
        <Button variant="outline" asChild>
          <Link href={`/cheltuieli/${purchase.id}/editare`}>
            <Pencil /> Editează
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Mai multe acțiuni">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56">
          {receive && (
            <DropdownMenuItem onSelect={() => setReceiveOpen(true)}>
              <PackageCheck /> Recepționează în stoc (NIR)
            </DropdownMenuItem>
          )}
          {receive && <DropdownMenuSeparator />}
          {cancelled ? (
            <DropdownMenuItem onSelect={() => run(() => setPurchaseCancelledAction(purchase.id, false), { refresh: true })}>
              <RotateCcw /> Reactivează
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("cancel")} disabled={purchase.paidAmount > 0}>
              <Ban /> Anulează
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={() => setConfirm("delete")}>
            <Trash2 /> Șterge definitiv
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {xml && <XmlDialog xml={xml} filename={`factura-${purchase.number.replace(/[^\w.-]+/g, "_")}.xml`} open={xmlOpen} onOpenChange={setXmlOpen} />}
      {receive && <ReceiveStockDialog purchase={purchase} {...receive} open={receiveOpen} onOpenChange={setReceiveOpen} />}
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Anulezi factura ${purchase.number}?`}
        description="Factura rămâne în evidență, dar nu mai apare la sold și în totalurile de cheltuieli. O poți reactiva oricând."
        confirmLabel="Anulează factura"
        destructive
        onConfirm={async () => {
          const r = await setPurchaseCancelledAction(purchase.id, true);
          if (r.ok) {
            toast.success(r.message ?? "Cheltuiala a fost anulată");
            router.refresh();
          } else toast.error(r.error);
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Ștergi definitiv factura ${purchase.number}?`}
        description={
          purchase.source === "spv"
            ? "Se șterg și plățile asociate. Mesajul din SPV rămâne disponibil pentru un nou import."
            : "Se șterg și plățile asociate. Acțiunea nu poate fi anulată."
        }
        confirmLabel="Șterge"
        destructive
        onConfirm={async () => {
          const r = await deletePurchaseAction(purchase.id);
          if (r.ok) {
            toast.success(r.message ?? "Cheltuiala a fost ștearsă");
            router.push("/cheltuieli");
          } else toast.error(r.error);
        }}
      />
    </>
  );
}

/** Buton care deschide dialogul de recepție NIR (folosit în cardul de pe pagina facturii). */
export function ReceiveStockButton({ purchase, receive, ...props }: { purchase: PurchaseSummary; receive: ReceiveContext } & ButtonProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)} />
      <ReceiveStockDialog purchase={purchase} {...receive} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Buton de ștergere a unei plăți, cu confirmare. */
export function DeletePaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-xs" aria-label="Șterge plata">
          <Trash2 />
        </Button>
      }
      title="Ștergi plata?"
      description={`Plata de ${label} va fi eliminată, iar soldul facturii se recalculează.`}
      confirmLabel="Șterge plata"
      destructive
      onConfirm={async () => {
        const r = await deletePurchasePaymentAction(paymentId);
        if (r.ok) {
          toast.success(r.message ?? "Plata a fost ștearsă");
          router.refresh();
        } else toast.error(r.error);
      }}
    />
  );
}
