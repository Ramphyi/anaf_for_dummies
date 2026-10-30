"use client";

import { Check, FileText, Timer } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { TIME_ENTRY_STATUS } from "@/lib/constants";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import type { ProjectEntry } from "./project-detail";

export function ProjectEntries({ entries, showMoney, currency }: { entries: ProjectEntry[]; showMoney: boolean; currency: string }) {
  const members = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.memberId, e.memberName);
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ro"));
  }, [entries]);

  const columns: Column<ProjectEntry>[] = [
    {
      key: "date",
      header: "Data",
      cell: (e) => <span className="tabular">{formatDate(e.date)}</span>,
      sortValue: (e) => e.date,
      className: "whitespace-nowrap",
    },
    {
      key: "member",
      header: "Membru",
      cell: (e) => (
        <span className="flex items-center gap-2">
          <Avatar name={e.memberName} color={e.memberColor} size="xs" className="ring-0" />
          <span className="truncate">{e.memberName}</span>
        </span>
      ),
      sortValue: (e) => e.memberName,
    },
    {
      key: "task",
      header: "Task / descriere",
      cell: (e) => (
        <div className="max-w-sm min-w-0">
          <div className="truncate font-medium">{e.taskTitle ?? <span className="text-muted-foreground">Fără task</span>}</div>
          {e.description && <div className="truncate text-xs text-muted-foreground">{e.description}</div>}
        </div>
      ),
      sortValue: (e) => e.taskTitle ?? "",
      csv: (e) => [e.taskTitle, e.description].filter(Boolean).join(" — "),
    },
    {
      key: "hours",
      header: "Ore",
      align: "right",
      cell: (e) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          {e.running && (
            <Tooltip content="Cronometru pornit">
              <Timer className="size-3.5 animate-pulse text-primary" />
            </Tooltip>
          )}
          {formatHours(e.hours)}
        </span>
      ),
      sortValue: (e) => e.hours,
    },
    {
      key: "billable",
      header: "Facturabil",
      align: "center",
      hideOnMobile: true,
      cell: (e) => (e.billable ? <Check className="mx-auto size-4 text-success" /> : <span className="text-muted-foreground">—</span>),
      sortValue: (e) => (e.billable ? 1 : 0),
    },
    ...(showMoney
      ? [
          {
            key: "value",
            header: "Valoare",
            align: "right" as const,
            hideOnMobile: true,
            cell: (e: ProjectEntry) => (e.billable && e.rate ? <span className="text-muted-foreground">{formatMoney(e.hours * e.rate, currency)}</span> : "—"),
            sortValue: (e: ProjectEntry) => (e.billable ? e.hours * e.rate : 0),
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      cell: (e) =>
        e.status === "rejected" && e.rejectionReason ? (
          <Tooltip content={`Motiv: ${e.rejectionReason}`}>
            <span>
              <StatusBadge status={e.status} map={TIME_ENTRY_STATUS} />
            </span>
          </Tooltip>
        ) : (
          <StatusBadge status={e.status} map={TIME_ENTRY_STATUS} />
        ),
      sortValue: (e) => e.status,
      csv: (e) => TIME_ENTRY_STATUS[e.status]?.label ?? e.status,
    },
    {
      key: "invoiced",
      header: "Facturat",
      hideOnMobile: true,
      cell: (e) =>
        e.invoicedDocumentId ? (
          showMoney ? (
            <Link href={`/facturi/${e.invoicedDocumentId}`} onClick={(ev) => ev.stopPropagation()}>
              <Badge tone="brand" className="hover:opacity-80">
                <FileText className="size-3" /> {e.invoiceNumber}
              </Badge>
            </Link>
          ) : (
            <Badge tone="brand">Facturat</Badge>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortValue: (e) => e.invoiceNumber ?? "",
    },
  ];

  if (!entries.length)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50">
        <EmptyState icon={<Timer />} title="Nicio oră pontată" description="Membrii echipei pontează din pagina Pontaj; orele apar aici automat." />
      </div>
    );

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowId={(e) => e.id}
      search={(e) => `${e.memberName} ${e.taskTitle ?? ""} ${e.description ?? ""}`}
      searchPlaceholder="Caută membru, task, descriere…"
      filters={[
        {
          key: "status",
          label: "Status",
          options: Object.entries(TIME_ENTRY_STATUS).map(([value, v]) => ({ value, label: v.label })),
          predicate: (e, v) => e.status === v,
        },
        { key: "member", label: "Membru", options: members, predicate: (e, v) => e.memberId === v },
      ]}
      defaultSort={{ key: "date", dir: "desc" }}
      csvFilename="pontaj-proiect"
      pageSize={20}
      dense
      footer={(rows) => (
        <tr>
          <td className="px-3 py-2.5 pl-5 text-muted-foreground" colSpan={3}>
            {rows.length} intrări
          </td>
          <td className="px-3 py-2.5 text-right font-semibold tabular">{formatHours(rows.reduce((a, r) => a + r.hours, 0))}</td>
          <td colSpan={showMoney ? 4 : 3} className="hidden md:table-cell" />
        </tr>
      )}
    />
  );
}
