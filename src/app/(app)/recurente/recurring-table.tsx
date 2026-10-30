"use client";

import { Mail, MoreHorizontal, Pencil, Plus, Repeat, Send, Trash2, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { daysBetween, frequencyLabel, type Frequency } from "@/components/documents/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatMoney, formatRelative, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteRecurringAction, generateRecurringNowAction, toggleRecurringAction } from "./actions";

export type RecurringRow = {
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  frequency: Frequency;
  intervalCount: number;
  nextRunDate: string;
  endDate: string | null;
  total: number;
  currency: string;
  active: boolean;
  generatedCount: number;
  lastRunAt: Date | null;
  autoIssue: boolean;
  autoSendEfactura: boolean;
  autoSendEmail: boolean;
};

/** „Generează acum” cu toast-uri pentru rezultatul SPV / email. */
export function useGenerateNow() {
  const router = useRouter();
  const { run, pending } = useAction();
  const generate = (id: string) =>
    run(() => generateRecurringNowAction(id), {
      success: "",
      onSuccess: (r) => {
        toast.success(`Factura ${r.fullNumber} a fost ${r.issued ? "emisă" : "creată ca ciornă"}`, {
          description: `Următoarea generare: ${formatDate(r.nextRunDate)}`,
          action: { label: "Deschide", onClick: () => router.push(`/facturi/${r.documentId}`) },
        });
        if (r.efactura && !r.efactura.ok) toast.warning(`Transmiterea în SPV a eșuat: ${r.efactura.message ?? ""}`);
        if (r.emailError) toast.warning(`Emailul nu a fost trimis: ${r.emailError}`);
      },
    });
  return { generate, pending };
}

function NextRun({ date, active }: { date: string; active: boolean }) {
  const d = daysBetween(todayIso(), date);
  return (
    <div>
      <p className="tabular">{formatDate(date)}</p>
      <p className={cn("text-xs", !active ? "text-muted-foreground" : d < 0 ? "text-danger" : d <= 3 ? "text-warning" : "text-muted-foreground")}>
        {!active ? "Pe pauză" : d < 0 ? `Întârziată ${-d} ${-d === 1 ? "zi" : "zile"}` : d === 0 ? "Azi" : d === 1 ? "Mâine" : `Peste ${d} zile`}
      </p>
    </div>
  );
}

export function RecurringTable({ rows }: { rows: RecurringRow[] }) {
  const { run } = useAction();
  const { generate, pending } = useGenerateNow();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<RecurringRow | null>(null);
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});

  const isActive = (r: RecurringRow) => optimistic[r.id] ?? r.active;

  const columns: Column<RecurringRow>[] = [
    {
      key: "name",
      header: "Șablon",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="max-w-[280px] min-w-0">
          <p className={cn("truncate font-medium", !isActive(r) && "text-muted-foreground")}>{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.partnerName}</p>
        </div>
      ),
    },
    {
      key: "frequency",
      header: "Frecvență",
      sortValue: (r) => `${r.frequency}${r.intervalCount}`,
      csv: (r) => frequencyLabel(r.frequency, r.intervalCount),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tone="brand">
            <Repeat className="size-3" /> {frequencyLabel(r.frequency, r.intervalCount)}
          </Badge>
          {r.autoSendEfactura && (
            <Tooltip content="Se transmite automat în SPV">
              <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
                <Send className="size-3" />
              </span>
            </Tooltip>
          )}
          {r.autoSendEmail && (
            <Tooltip content="Se trimite automat pe email">
              <span className="grid size-5 place-items-center rounded-full bg-info-soft text-info">
                <Mail className="size-3" />
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
    { key: "next", header: "Următoarea", sortValue: (r) => r.nextRunDate, csv: (r) => formatDate(r.nextRunDate), cell: (r) => <NextRun date={r.nextRunDate} active={isActive(r)} /> },
    {
      key: "total",
      header: "Valoare / factură",
      align: "right",
      sortValue: (r) => r.total,
      cell: (r) => <span className="font-medium">{formatMoney(r.total, r.currency)}</span>,
    },
    {
      key: "generated",
      header: "Generate",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.generatedCount,
      cell: (r) => (
        <div>
          <p className="font-medium tabular">{r.generatedCount}</p>
          {r.lastRunAt && <p className="text-xs text-muted-foreground">{formatRelative(r.lastRunAt)}</p>}
        </div>
      ),
    },
    {
      key: "active",
      header: "Activ",
      align: "center",
      sortValue: (r) => (isActive(r) ? 1 : 0),
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Switch
            checked={isActive(r)}
            onCheckedChange={(v) => {
              setOptimistic((o) => ({ ...o, [r.id]: v }));
              run(() => toggleRecurringAction(r.id, v), { onError: () => setOptimistic((o) => ({ ...o, [r.id]: !v })) });
            }}
            aria-label="Activ"
          />
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Generează factura acum">
            <Button
              size="xs"
              variant="soft"
              loading={pending && busyId === r.id}
              onClick={() => {
                setBusyId(r.id);
                generate(r.id);
              }}
            >
              {!(pending && busyId === r.id) && <Zap />} <span className="hidden lg:inline">Generează</span>
            </Button>
          </Tooltip>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Acțiuni">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link href={`/recurente/${r.id}`}>
                  <Pencil /> Editează
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/clienti/${r.partnerId}`}>
                  <UserRound /> Vezi clientul
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setToDelete(r)}>
                <Trash2 /> Șterge șablonul
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        rowHref={(r) => `/recurente/${r.id}`}
        search={(r) => `${r.name} ${r.partnerName}`}
        searchPlaceholder="Caută șablon sau client…"
        defaultSort={{ key: "next", dir: "asc" }}
        filters={[
          {
            key: "state",
            label: "Stare",
            options: [
              { value: "active", label: "Active" },
              { value: "paused", label: "Pe pauză" },
              { value: "due", label: "Scadente" },
            ],
            predicate: (r, v) => (v === "active" ? isActive(r) : v === "paused" ? !isActive(r) : isActive(r) && r.nextRunDate <= todayIso()),
          },
        ]}
        csvFilename={`facturi-recurente-${todayIso()}`}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Repeat />}
              title="Niciun șablon recurent"
              description="Automatizează abonamentele, retainerele și mentenanța lunară: factura se generează, se emite și se trimite singură."
              action={
                <Button asChild>
                  <Link href="/recurente/nou">
                    <Plus /> Șablon nou
                  </Link>
                </Button>
              }
            />
          ) : undefined
        }
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Ștergi șablonul recurent?"
        description={toDelete ? `„${toDelete.name}” nu va mai genera facturi. Facturile deja emise rămân neschimbate.` : undefined}
        confirmLabel="Șterge"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) => {
            if (!toDelete) return resolve();
            run(() => deleteRecurringAction(toDelete.id), { onSuccess: () => resolve(), onError: () => resolve() });
          })
        }
      />
    </>
  );
}

