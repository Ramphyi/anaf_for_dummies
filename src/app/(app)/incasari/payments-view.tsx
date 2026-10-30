"use client";

import { format, subMonths } from "date-fns";
import { Plus, Printer, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PaymentDialog, type InvoiceOption } from "@/components/documents/payment-dialog";
import { deletePaymentAction } from "@/components/documents/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { PAYMENT_METHOD_LABELS, type Tone } from "@/lib/constants";
import { formatDate, formatMoney, todayIso } from "@/lib/format";

export type PaymentListRow = {
  id: string;
  date: string;
  partnerId: string | null;
  partnerName: string;
  documentId: string | null;
  documentNumber: string | null;
  method: string;
  amount: number;
  currency: string;
  amountRon: number;
  reference: string | null;
  receipt: string | null;
};

const METHOD_TONE: Record<string, Tone> = { cash: "success", bank: "info", op: "info", card: "brand", compensation: "warning", other: "neutral" };

export function PaymentsView({ rows, invoices, openNew, invoiceId }: { rows: PaymentListRow[]; invoices: InvoiceOption[]; openNew: boolean; invoiceId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(openNew);
  const [toDelete, setToDelete] = React.useState<PaymentListRow | null>(null);
  const { run } = useAction();
  const month = todayIso().slice(0, 7);
  const prev = format(subMonths(new Date(), 1), "yyyy-MM");
  const year = todayIso().slice(0, 4);

  const setDialog = (o: boolean) => {
    setOpen(o);
    // Curățăm ?nou=1 ca dialogul să nu se redeschidă la refresh.
    if (!o && openNew) router.replace("/incasari", { scroll: false });
  };

  const columns: Column<PaymentListRow>[] = [
    { key: "date", header: "Dată", sortValue: (r) => r.date, csv: (r) => formatDate(r.date), cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "client",
      header: "Client",
      sortValue: (r) => r.partnerName,
      cell: (r) =>
        r.partnerId ? (
          <Link href={`/clienti/${r.partnerId}`} className="block max-w-[240px] truncate hover:text-primary hover:underline">
            {r.partnerName}
          </Link>
        ) : (
          <span className="block max-w-[240px] truncate">{r.partnerName}</span>
        ),
    },
    {
      key: "invoice",
      header: "Factură",
      sortValue: (r) => r.documentNumber ?? "",
      hideOnMobile: true,
      cell: (r) =>
        r.documentId ? (
          <Link href={`/facturi/${r.documentId}`} className="font-medium text-primary hover:underline">
            {r.documentNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "method",
      header: "Metodă",
      sortValue: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method,
      hideOnMobile: true,
      cell: (r) => <Badge tone={METHOD_TONE[r.method] ?? "neutral"}>{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</Badge>,
    },
    {
      key: "reference",
      header: "Referință",
      sortValue: (r) => r.reference ?? "",
      hideOnMobile: true,
      cell: (r) => <span className="text-muted-foreground">{r.reference ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Sumă",
      align: "right",
      sortValue: (r) => r.amountRon,
      csv: (r) => r.amount,
      cell: (r) => (
        <div>
          <p className="font-semibold text-success">{formatMoney(r.amount, r.currency)}</p>
          {r.currency !== "RON" && <p className="text-xs text-muted-foreground">{formatMoney(r.amountRon, "RON")}</p>}
        </div>
      ),
    },
    {
      key: "receipt",
      header: "Chitanță",
      sortValue: (r) => r.receipt ?? "",
      cell: (r) =>
        r.receipt ? (
          <Tooltip content="Tipărește chitanța">
            <a
              href={`/print/chitanta/${r.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
            >
              <Printer className="size-3.5" /> {r.receipt}
            </a>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="ghost" size="icon-xs" onClick={() => setToDelete(r)} aria-label="Șterge încasarea" className="hover:bg-danger-soft hover:text-danger">
          <Trash2 />
        </Button>
      ),
    },
  ];

  const newButton = (
    <Button size="sm" onClick={() => setDialog(true)}>
      <Plus /> Încasare nouă
    </Button>
  );

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        search={(r) => `${r.partnerName} ${r.documentNumber ?? ""} ${r.reference ?? ""} ${r.receipt ?? ""} ${r.amount}`}
        searchPlaceholder="Caută client, factură, referință…"
        defaultSort={{ key: "date", dir: "desc" }}
        filters={[
          {
            key: "period",
            label: "Perioadă",
            options: [
              { value: "month", label: "Luna asta" },
              { value: "prev", label: "Luna trecută" },
              { value: "year", label: year },
            ],
            predicate: (r, v) => (v === "month" ? r.date.startsWith(month) : v === "prev" ? r.date.startsWith(prev) : r.date.startsWith(year)),
          },
          {
            key: "method",
            label: "Metodă",
            options: [
              { value: "cash", label: "Numerar" },
              { value: "bank", label: "Bancă" },
              { value: "card", label: "Card" },
            ],
            predicate: (r, v) => (v === "bank" ? r.method === "bank" || r.method === "op" : r.method === v),
          },
        ]}
        csvFilename={`incasari-${todayIso()}`}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="Nicio încasare înregistrată"
              description="Înregistrează plățile primite de la clienți; statusul facturilor se actualizează automat."
              action={newButton}
            />
          ) : undefined
        }
        footer={(list) => (
          <tr>
            <td className="px-3 py-3 pl-5 text-sm text-muted-foreground" colSpan={2}>
              {list.length} încasări
            </td>
            <td className="hidden md:table-cell" colSpan={3} />
            <td className="px-3 py-3 text-right text-sm font-semibold tabular">{formatMoney(list.reduce((a, r) => a + r.amountRon, 0), "RON")}</td>
            <td colSpan={2} />
          </tr>
        )}
      />
      <PaymentDialog invoices={invoices} invoiceId={invoiceId && invoices.some((i) => i.id === invoiceId) ? invoiceId : null} open={open} onOpenChange={setDialog} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Ștergi încasarea?"
        description={
          toDelete
            ? `Plata de ${formatMoney(toDelete.amount, toDelete.currency)} de la ${toDelete.partnerName} va fi ștearsă${toDelete.documentNumber ? `, iar factura ${toDelete.documentNumber} își recalculează restul de plată` : ""}.${toDelete.receipt ? " Numărul chitanței nu se refolosește." : ""}`
            : undefined
        }
        confirmLabel="Șterge încasarea"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) => {
            if (!toDelete) return resolve();
            run(() => deletePaymentAction(toDelete.id), { onSuccess: () => resolve(), onError: () => resolve() });
          })
        }
      />
    </>
  );
}
