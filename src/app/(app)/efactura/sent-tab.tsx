"use client";

import {
  Archive,
  CircleCheck,
  ExternalLink,
  FileCode2,
  FileText,
  Hourglass,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { downloadFile } from "@/components/anaf/download";
import { EfacturaProgress, EfacturaTimeline } from "@/components/anaf/efactura-timeline";
import { efacturaDeadline } from "@/components/anaf/utils";
import { Stagger, StaggerItem } from "@/components/motion";
import { EfacturaBadge } from "@/components/anaf/efactura-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailRow, EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { useAction } from "@/hooks/use-action";
import { EFACTURA_STATUS, EFACTURA_STATUS_SIMULATED } from "@/lib/constants";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog as D } from "radix-ui";
import { refreshAllStatusesAction, refreshInvoiceStatusAction, sendAllUnsentAction, sendInvoiceAction } from "./actions";
import type { SentRow } from "./types";

const STATUS_ORDER: Record<string, number> = { error: 0, nok: 1, none: 2, pending: 3, processing: 4, ok: 5 };
const canSend = (r: SentRow) => r.status !== "cancelled" && ["none", "error", "nok"].includes(r.efacturaStatus);
const canCheck = (r: SentRow) => !!r.efacturaUploadId && r.efacturaStatus !== "ok";

/** Acțiunile ANAF pentru o factură (trimitere / verificare) + verificare automată după trimitere. */
function useInvoiceActions() {
  const { run, pending } = useAction();
  const check = React.useCallback(
    (row: Pick<SentRow, "id" | "fullNumber">, silent = false) =>
      run(() => refreshInvoiceStatusAction(row.id), {
        onSuccess: (r) => {
          if (r.state === "ok") toast.success(`Factura ${row.fullNumber} a fost validată de ANAF`);
          else if (r.state === "processing") {
            if (!silent) toast.info(`Factura ${row.fullNumber} este încă în prelucrare la ANAF`);
          } else toast.error(`Factura ${row.fullNumber} a fost respinsă: ${r.message ?? "vezi detaliile"}`);
        },
      }),
    [run],
  );
  const send = React.useCallback(
    (row: Pick<SentRow, "id" | "fullNumber">) =>
      run(() => sendInvoiceAction(row.id), {
        onSuccess: (r) => {
          toast.success(`Factura ${row.fullNumber} a fost transmisă în SPV`, { description: r.uploadId ? `Index încărcare: ${r.uploadId}` : undefined });
          // ANAF prelucrează de regulă în câteva secunde–minute: verificăm o dată automat
          window.setTimeout(() => check(row, true), 7000);
        },
      }),
    [run, check],
  );
  return { send, check, pending };
}

function ExpandableMessage({ text, tone = "danger" }: { text: string; tone?: "danger" | "muted" }) {
  const [open, setOpen] = React.useState(false);
  const multi = text.length > 70 || text.includes("\n");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (multi) setOpen((o) => !o);
      }}
      className={cn(
        "block max-w-72 text-left text-xs leading-relaxed",
        tone === "danger" ? "text-danger-soft-foreground" : "text-muted-foreground",
        open ? "whitespace-pre-line" : "line-clamp-2",
        multi && "cursor-pointer hover:underline",
      )}
      title={multi && !open ? "Click pentru mesajul complet" : undefined}
    >
      {text}
    </button>
  );
}

function DeadlineHint({ row, today }: { row: SentRow; today: string }) {
  if (row.efacturaStatus !== "none") return null;
  if (row.status === "cancelled") return <span className="text-[11px] text-muted-foreground">Anulată — nu se transmite</span>;
  const d = efacturaDeadline(row.issueDate, today);
  if (d.overdue) return <Badge tone="danger">Termen depășit cu {-d.left} {-d.left === 1 ? "zi" : "zile"}</Badge>;
  if (d.left <= 2) return <Badge tone="warning">Termen: {d.left === 0 ? "azi" : d.left === 1 ? "mâine" : `${d.left} zile`}</Badge>;
  return <span className="text-[11px] text-muted-foreground">Termen {formatDate(d.deadline)}</span>;
}

function RowActions({ row, onOpen }: { row: SentRow; onOpen: () => void }) {
  const { send, check, pending } = useInvoiceActions();
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {canSend(row) ? (
        <Button size="xs" variant={row.efacturaStatus === "none" ? "soft" : "outline"} loading={pending} onClick={() => send(row)}>
          {!pending && (row.efacturaStatus === "none" ? <Send /> : <RotateCw />)}
          <span className="hidden sm:inline">{row.efacturaStatus === "none" ? "Trimite" : "Retrimite"}</span>
        </Button>
      ) : canCheck(row) ? (
        <Button size="xs" variant="outline" loading={pending} onClick={() => check(row)}>
          {!pending && <RefreshCw />}
          <span className="hidden sm:inline">Verifică</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Mai multe acțiuni">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onSelect={onOpen}>
            <Hourglass /> Cronologie e-Factura
          </DropdownMenuItem>
          {row.efacturaUploadId && (
            <DropdownMenuItem onSelect={() => check(row)}>
              <RefreshCw /> Verifică statusul
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void downloadFile(`/api/documents/${row.id}/xml`, `${row.fullNumber}.xml`)}>
            <FileCode2 /> Descarcă XML UBL
          </DropdownMenuItem>
          {row.spvMessageId && (
            <DropdownMenuItem onSelect={() => void downloadFile(`/api/spv/${row.spvMessageId}/zip`, `${row.fullNumber}.zip`)}>
              <Archive /> Arhivă SPV semnată (ZIP)
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/facturi/${row.id}`}>
              <ExternalLink /> Deschide factura
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function InvoiceSheet({ row, open, onOpenChange }: { row: SentRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { send, check, pending } = useInvoiceActions();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {row && (
          <div className="flex h-full flex-col">
            <div className="border-b border-border px-6 pt-6 pb-4 pr-12">
              <D.Title className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                {row.fullNumber}
                {row.isCreditNote && <Badge tone="danger">Storno</Badge>}
              </D.Title>
              <D.Description className="mt-0.5 text-sm text-muted-foreground">
                {row.clientName} · {formatMoney(row.total, row.currency)}
              </D.Description>
              <div className="mt-3">
                <EfacturaBadge status={row.efacturaStatus} simulated={row.efacturaSimulated} />
              </div>
            </div>
            <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <EfacturaTimeline data={row} />
              {row.efacturaMessage && row.efacturaStatus !== "ok" && (
                <div className="rounded-xl border border-danger/25 bg-danger-soft/60 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-danger-soft-foreground">
                    <TriangleAlert className="size-4" /> Mesaj ANAF
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[13px] text-danger-soft-foreground">
                    {row.efacturaMessage.split("\n").filter(Boolean).map((m, i) => (
                      <li key={i} className="break-words">
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="divide-y divide-border rounded-xl border border-border px-4">
                <DetailRow label="Client">
                  {row.clientName}
                  {row.clientCui && <span className="block font-mono text-xs text-muted-foreground">{row.clientCui}</span>}
                </DetailRow>
                <DetailRow label="Tip">{row.clientEntityType === "pf" ? "B2C (persoană fizică)" : "B2B"}</DetailRow>
                <DetailRow label="Data emiterii">{formatDate(row.issueDate)}</DetailRow>
                <DetailRow label="Index încărcare">{row.efacturaUploadId ? <span className="font-mono">{row.efacturaUploadId}</span> : "—"}</DetailRow>
                <DetailRow label="Id descărcare">{row.efacturaDownloadId ? <span className="font-mono">{row.efacturaDownloadId}</span> : "—"}</DetailRow>
                <DetailRow label="Transmisă la">{row.efacturaSentAt ? formatDateTime(row.efacturaSentAt) : "—"}</DetailRow>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border bg-subtle/60 px-6 py-4">
              {canSend(row) && (
                <Button loading={pending} onClick={() => send(row)}>
                  {!pending && (row.efacturaStatus === "none" ? <Send /> : <RotateCw />)}
                  {row.efacturaStatus === "none" ? "Trimite în SPV" : "Retrimite"}
                </Button>
              )}
              {canCheck(row) && (
                <Button variant="outline" loading={pending} onClick={() => check(row)}>
                  {!pending && <RefreshCw />} Verifică status
                </Button>
              )}
              <Button variant="outline" onClick={() => void downloadFile(`/api/documents/${row.id}/xml`, `${row.fullNumber}.xml`)}>
                <FileCode2 /> XML
              </Button>
              {row.spvMessageId && (
                <Button variant="outline" onClick={() => void downloadFile(`/api/spv/${row.spvMessageId}/zip`, `${row.fullNumber}.zip`)}>
                  <Archive /> ZIP SPV
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link href={`/facturi/${row.id}`}>
                  <ExternalLink /> Factura
                </Link>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function SentTab({ rows, today }: { rows: SentRow[]; today: string }) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const bulk = useAction();
  const sendAll = useAction();
  const openRow = rows.find((r) => r.id === openId) ?? null;

  const stats = React.useMemo(() => {
    const by = (s: string[]) => rows.filter((r) => s.includes(r.efacturaStatus));
    const unsent = rows.filter((r) => r.efacturaStatus === "none" && r.status !== "cancelled");
    return {
      ok: by(["ok"]).length,
      processing: by(["processing", "pending"]).length,
      rejected: by(["nok", "error"]).length,
      unsent: unsent.length,
      overdue: unsent.filter((r) => efacturaDeadline(r.issueDate, today).overdue).length,
    };
  }, [rows, today]);

  const open = (r: SentRow) => {
    setOpenId(r.id);
    setSheetOpen(true);
  };

  const columns: Column<SentRow>[] = [
    {
      key: "number",
      header: "Factură",
      sortValue: (r) => `${r.issueDate}-${r.fullNumber}`,
      csv: (r) => r.fullNumber,
      cell: (r) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            {r.fullNumber}
            {r.isCreditNote && <Badge tone="danger">Storno</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(r.issueDate)}</p>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      sortValue: (r) => r.clientName,
      cell: (r) => (
        <div className="max-w-56 min-w-0">
          <p className="truncate">{r.clientName}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{r.clientEntityType === "pf" ? "Persoană fizică" : (r.clientCui ?? "—")}</p>
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.total,
      cell: (r) => <span className="font-medium whitespace-nowrap">{formatMoney(r.total, r.currency)}</span>,
    },
    {
      key: "status",
      header: "e-Factura",
      sortValue: (r) => STATUS_ORDER[r.efacturaStatus] ?? 9,
      csv: (r) => (r.efacturaSimulated ? EFACTURA_STATUS_SIMULATED : EFACTURA_STATUS)[r.efacturaStatus]?.label ?? r.efacturaStatus,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2">
            <EfacturaBadge status={r.efacturaStatus} simulated={r.efacturaSimulated} />
            <EfacturaProgress data={r} className="hidden sm:flex" />
          </div>
          <DeadlineHint row={r} today={today} />
        </div>
      ),
    },
    {
      key: "upload",
      header: "Index ANAF",
      hideOnMobile: true,
      sortValue: (r) => r.efacturaSentAt ?? "",
      csv: (r) => r.efacturaUploadId ?? "",
      cell: (r) =>
        r.efacturaUploadId ? (
          <div>
            <p className="font-mono text-xs">{r.efacturaUploadId}</p>
            <p className="text-[11px] whitespace-nowrap text-muted-foreground">{formatDateTime(r.efacturaSentAt)}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "message",
      header: "Mesaj ANAF",
      hideOnMobile: true,
      csv: (r) => r.efacturaMessage ?? "",
      cell: (r) =>
        r.efacturaMessage && r.efacturaStatus !== "ok" ? (
          <ExpandableMessage text={r.efacturaMessage} />
        ) : r.efacturaStatus === "ok" ? (
          <span className="inline-flex items-center gap-1 text-xs text-success-soft-foreground">
            <CircleCheck className="size-3.5" /> Fără erori
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "actions", header: "", align: "right", cell: (r) => <RowActions row={r} onOpen={() => open(r)} /> },
  ];

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Validate ANAF" value={stats.ok} format="number" tone="success" icon={<CircleCheck />} hint={`din ${rows.length} facturi emise`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="În prelucrare" value={stats.processing} format="number" tone="warning" icon={<Hourglass />} hint={stats.processing ? "verifică statusul în câteva minute" : "nimic în așteptare"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Respinse / erori" value={stats.rejected} format="number" tone="danger" icon={<TriangleAlert />} hint={stats.rejected ? "necesită corectare și retrimitere" : "nicio eroare"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Netrimise"
            value={stats.unsent}
            format="number"
            tone="brand"
            icon={<Send />}
            hint={stats.overdue ? `${stats.overdue} cu termenul de 5 zile depășit` : "termen legal: 5 zile lucrătoare"}
          />
        </StaggerItem>
      </Stagger>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold">Facturi emise</p>
          <p className="text-[13px] text-muted-foreground">Click pe un rând pentru cronologia completă a facturii în e-Factura.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.unsent > 0 && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="soft" loading={sendAll.pending}>
                  {!sendAll.pending && <Send />} Trimite netrimise ({stats.unsent})
                </Button>
              }
              title={`Trimiți ${stats.unsent} ${stats.unsent === 1 ? "factură" : "facturi"} în SPV?`}
              description="Fiecare factură emisă și netransmisă va fi generată în format UBL CIUS-RO, prevalidată și încărcată în e-Factura."
              confirmLabel="Trimite acum"
              onConfirm={() =>
                new Promise<void>((resolve) =>
                  sendAll.run(() => sendAllUnsentAction(), {
                    onSuccess: (r) => {
                      if (r.failed) toast.warning(`${r.sent} transmise, ${r.failed} cu erori — vezi coloana „Mesaj ANAF”.`);
                      else toast.success(`${r.sent} ${r.sent === 1 ? "factură transmisă" : "facturi transmise"} în SPV`);
                      resolve();
                    },
                    onError: () => resolve(),
                  }),
                )
              }
            />
          )}
          <Button
            size="sm"
            variant="outline"
            loading={bulk.pending}
            onClick={() =>
              bulk.run(() => refreshAllStatusesAction(), {
                success: (r) =>
                  r.checked ? `${r.checked} ${r.checked === 1 ? "factură verificată" : "facturi verificate"}, ${r.updated} cu status nou` : "Nu există facturi în prelucrare",
              })
            }
          >
            {!bulk.pending && <RefreshCw />} Verifică toate statusurile
          </Button>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={open}
        search={(r) => `${r.fullNumber} ${r.clientName} ${r.clientCui ?? ""} ${r.efacturaUploadId ?? ""}`}
        searchPlaceholder="Caută după număr, client, CUI, index…"
        filters={[
          {
            key: "ef",
            label: "Status",
            options: [
              { value: "none", label: "Netrimise" },
              { value: "processing", label: "În prelucrare" },
              { value: "ok", label: "Validate" },
              { value: "err", label: "Respinse / erori" },
            ],
            predicate: (r, v) =>
              v === "err" ? ["nok", "error"].includes(r.efacturaStatus) : v === "processing" ? ["processing", "pending"].includes(r.efacturaStatus) : r.efacturaStatus === v,
          },
        ]}
        csvFilename="efactura-facturi-trimise"
        defaultSort={{ key: "number", dir: "desc" }}
        rowClassName={(r) => (["nok", "error"].includes(r.efacturaStatus) ? "bg-danger-soft/25" : undefined)}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="Nicio factură emisă încă"
              description="Facturile emise apar aici împreună cu statusul lor în e-Factura."
              action={
                <Button onClick={() => router.push("/facturi/nou")}>
                  <FileText /> Emite o factură
                </Button>
              }
            />
          ) : undefined
        }
      />

      <InvoiceSheet row={openRow} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
