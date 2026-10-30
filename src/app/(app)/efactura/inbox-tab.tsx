"use client";

import { Archive, CheckCheck, Eye, ExternalLink, FileDown, Import, Inbox, Mail, MailOpen, MoreHorizontal, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { downloadFile } from "@/components/anaf/download";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { importAllSpvAction, markAllSpvReadAction, setSpvReadAction, syncSpvAction } from "./actions";
import { ImportDialog, SpvMessageDialog, usePdfDownload } from "./spv-dialogs";
import type { SpvRow } from "./types";

const DAY_OPTIONS = [1, 3, 7, 15, 30, 60];

function uploadIndex(details: string | null) {
  return details?.match(/id_incarcare=(\d+)/)?.[1] ?? null;
}

/** Sincronizare SPV (listaMesajeFactura) cu selectorul de zile. */
export function useSpvSync() {
  const { run, pending } = useAction();
  const sync = React.useCallback(
    (days: number) =>
      run(() => syncSpvAction(days), {
        onSuccess: (r) => {
          if (r.new) toast.success(`${r.new} ${r.new === 1 ? "mesaj nou" : "mesaje noi"} în SPV`, { description: `${r.total} mesaje în ultimele ${days} zile` });
          else toast.info(`Niciun mesaj nou în SPV`, { description: `${r.total} mesaje în ultimele ${days} zile, toate deja descărcate` });
        },
      }),
    [run],
  );
  return { sync, pending };
}

function RowActions({ row, onView, onImport }: { row: SpvRow; onView: () => void; onImport: () => void }) {
  const { run } = useAction();
  const pdf = usePdfDownload();
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {row.purchaseInvoiceId ? (
        <Button size="xs" variant="ghost" asChild>
          <Link href={`/cheltuieli/${row.purchaseInvoiceId}`}>
            <ExternalLink /> <span className="hidden sm:inline">Cheltuiala</span>
          </Link>
        </Button>
      ) : (
        <Button size="xs" variant="soft" onClick={onImport}>
          <Import /> <span className="hidden sm:inline">Importă</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Mai multe acțiuni" loading={pdf.busy}>
            {!pdf.busy && <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onSelect={onView}>
            <Eye /> Vezi XML și rezumat
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void downloadFile(`/api/spv/${row.id}/zip`, `${row.anafId}.zip`)}>
            <Archive /> Descarcă ZIP
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pdf.download(row.id, `${row.anafId}.pdf`)}>
            <FileDown /> PDF ANAF
          </DropdownMenuItem>
          {!row.purchaseInvoiceId && (
            <DropdownMenuItem onSelect={onImport}>
              <Import /> Importă ca cheltuială
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(() => setSpvReadAction(row.id, !row.read))}>
            {row.read ? <Mail /> : <MailOpen />} Marchează ca {row.read ? "necitit" : "citit"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft">
      <span className={cn("size-2.5 shrink-0 rounded-full", tone)} />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg leading-tight font-semibold tabular">
          <AnimatedNumber value={value} />
        </p>
      </div>
    </div>
  );
}

export function InboxTab({ rows, lastSyncAt, autoSync }: { rows: SpvRow[]; lastSyncAt: string | null; autoSync: boolean }) {
  const [days, setDays] = React.useState(60);
  const { sync, pending: syncing } = useSpvSync();
  const bulkImport = useAction();
  const markAll = useAction();
  const [view, setView] = React.useState<{ id: string; mode: "view" | "import" } | null>(null);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (!autoSync || ran.current) return;
    ran.current = true;
    sync(60);
    const url = new URL(window.location.href);
    url.searchParams.delete("sync");
    url.searchParams.set("tab", "primite");
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams}`);
  }, [autoSync, sync]);

  const current = view ? (rows.find((r) => r.id === view.id) ?? null) : null;
  const unread = rows.filter((r) => !r.read).length;
  const toImport = rows.filter((r) => !r.purchaseInvoiceId).length;

  const columns: Column<SpvRow>[] = [
    {
      key: "date",
      header: "Primită",
      sortValue: (r) => r.createdAt ?? "",
      csv: (r) => formatDateTime(r.createdAt),
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", r.read ? "bg-transparent" : "bg-primary shadow-[0_0_0_3px_var(--primary-soft)]")} />
          <div>
            <p className="whitespace-nowrap">{formatDate(r.createdAt)}</p>
            <p className="text-[11px] text-muted-foreground">{r.createdAt ? formatDateTime(r.createdAt).slice(11) : ""}</p>
          </div>
        </div>
      ),
    },
    {
      key: "issuer",
      header: "Furnizor",
      sortValue: (r) => r.issuerName ?? r.issuerCui ?? "",
      csv: (r) => r.issuerName ?? r.issuerCui ?? "",
      cell: (r) => (
        <div className="max-w-64 min-w-0">
          <p className={cn("truncate", !r.read && "font-semibold")}>{r.issuerName ?? <span className="text-muted-foreground">Furnizor necunoscut</span>}</p>
          <p className="font-mono text-[11px] text-muted-foreground">CUI {r.issuerCui ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "invoice",
      header: "Detalii",
      sortValue: (r) => r.summary?.number ?? r.anafId,
      csv: (r) => r.summary?.number ?? r.details ?? "",
      cell: (r) =>
        r.summary ? (
          <div>
            <p className="font-medium">{r.summary.number}</p>
            <p className="text-[11px] text-muted-foreground">emisă {formatDate(r.summary.issueDate)}</p>
          </div>
        ) : (
          <div className="max-w-60">
            <p className="text-xs text-muted-foreground">Factură nedescărcată</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">index {uploadIndex(r.details) ?? r.requestId ?? r.anafId}</p>
          </div>
        ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.summary?.total ?? -1,
      cell: (r) => (r.summary ? <span className="font-medium whitespace-nowrap">{formatMoney(r.summary.total, r.summary.currency)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "state",
      header: "Stare",
      hideOnMobile: true,
      csv: (r) => (r.purchaseInvoiceId ? "Importată" : r.downloaded ? "Descărcată" : "Nouă"),
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {!r.read && (
            <Badge tone="brand" dot pulse>
              Nouă
            </Badge>
          )}
          {r.purchaseInvoiceId ? <Badge tone="success">Importată</Badge> : r.downloaded ? <Badge tone="info">Descărcată</Badge> : r.read ? <Badge>Citită</Badge> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => <RowActions row={r} onView={() => setView({ id: r.id, mode: "view" })} onImport={() => setView({ id: r.id, mode: "import" })} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Inbox className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Facturi primite în SPV</p>
            <p className="text-[13px] text-muted-foreground" suppressHydrationWarning>
              Ultima sincronizare: {lastSyncAt ? `${formatRelative(lastSyncAt)} (${formatDateTime(lastSyncAt)})` : "niciodată"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap text-muted-foreground">Perioadă</span>
            <NativeSelect value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-40" aria-label="Număr de zile">
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? "ultima zi" : `ultimele ${d} zile`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button variant="gradient" loading={syncing} onClick={() => sync(days)}>
            {!syncing && <RefreshCw />} Sincronizează SPV
          </Button>
        </div>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <MiniStat label="Facturi primite" value={rows.length} tone="bg-primary" />
        </StaggerItem>
        <StaggerItem>
          <MiniStat label="Necitite" value={unread} tone="bg-info" />
        </StaggerItem>
        <StaggerItem>
          <MiniStat label="De importat" value={toImport} tone="bg-warning" />
        </StaggerItem>
        <StaggerItem>
          <MiniStat label="Importate în cheltuieli" value={rows.length - toImport} tone="bg-success" />
        </StaggerItem>
      </Stagger>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={(r) => setView({ id: r.id, mode: "view" })}
        rowClassName={(r) => (!r.read ? "bg-primary-soft/30 hover:bg-primary-soft/50" : undefined)}
        search={(r) => `${r.issuerName ?? ""} ${r.issuerCui ?? ""} ${r.summary?.number ?? ""} ${r.anafId} ${r.details ?? ""}`}
        searchPlaceholder="Caută furnizor, CUI, număr factură…"
        filters={[
          {
            key: "state",
            label: "Stare",
            options: [
              { value: "unread", label: "Necitite" },
              { value: "pending", label: "De importat" },
              { value: "imported", label: "Importate" },
            ],
            predicate: (r, v) => (v === "unread" ? !r.read : v === "pending" ? !r.purchaseInvoiceId : !!r.purchaseInvoiceId),
          },
        ]}
        csvFilename="spv-facturi-primite"
        defaultSort={{ key: "date", dir: "desc" }}
        toolbar={
          <>
            {unread > 0 && (
              <Button size="sm" variant="ghost" loading={markAll.pending} onClick={() => markAll.run(() => markAllSpvReadAction())}>
                {!markAll.pending && <CheckCheck />} <span className="hidden sm:inline">Marchează citite</span>
              </Button>
            )}
            {toImport > 0 && (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="outline" loading={bulkImport.pending}>
                    {!bulkImport.pending && <Import />} <span className="hidden sm:inline">Importă toate</span> ({toImport})
                  </Button>
                }
                title={`Importi ${toImport} ${toImport === 1 ? "factură" : "facturi"} ca cheltuieli?`}
                description="Fiecare factură primită va fi descărcată din SPV și înregistrată ca factură de achiziție, cu categoria sugerată automat. Furnizorii noi se adaugă în nomenclator."
                confirmLabel="Importă tot"
                onConfirm={() =>
                  new Promise<void>((resolve) =>
                    bulkImport.run(() => importAllSpvAction(), {
                      onSuccess: (r) => {
                        if (r.failed) toast.warning(`${r.imported} importate, ${r.failed} nu au putut fi importate.`);
                        else toast.success(`${r.imported} ${r.imported === 1 ? "factură importată" : "facturi importate"} în cheltuieli`);
                        resolve();
                      },
                      onError: () => resolve(),
                    }),
                  )
                }
              />
            )}
          </>
        }
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="Nicio factură primită încă"
              description="Sincronizează SPV-ul pentru a descărca facturile emise de furnizori către firma ta."
              action={
                <Button loading={syncing} onClick={() => sync(days)}>
                  {!syncing && <RefreshCw />} Sincronizează acum
                </Button>
              }
            />
          ) : undefined
        }
      />

      <SpvMessageDialog
        row={current}
        open={view?.mode === "view" && !!current}
        onOpenChange={(o) => !o && setView(null)}
        onImport={(r) => setView({ id: r.id, mode: "import" })}
      />
      <ImportDialog row={current} open={view?.mode === "import" && !!current} onOpenChange={(o) => !o && setView(null)} />
    </div>
  );
}
