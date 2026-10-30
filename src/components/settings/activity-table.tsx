"use client";

import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import type { Tone } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";

export type ActivityRow = {
  id: string;
  userName: string;
  avatarColor: string | null;
  entity: string;
  action: string;
  message: string;
  createdAt: string;
};

export const ENTITY_LABELS: Record<string, { label: string; tone: Tone }> = {
  document: { label: "Documente", tone: "brand" },
  payment: { label: "Încasări", tone: "success" },
  purchase: { label: "Cheltuieli", tone: "warning" },
  partner: { label: "Parteneri", tone: "info" },
  product: { label: "Produse", tone: "info" },
  stock: { label: "Stocuri", tone: "warning" },
  spv: { label: "ANAF / SPV", tone: "danger" },
  efactura: { label: "e-Factura", tone: "danger" },
  etransport: { label: "e-Transport", tone: "danger" },
  project: { label: "Proiecte", tone: "brand" },
  task: { label: "Task-uri", tone: "neutral" },
  timesheet: { label: "Pontaj", tone: "info" },
  team: { label: "Echipă", tone: "neutral" },
  recurring: { label: "Recurente", tone: "neutral" },
  company: { label: "Firmă", tone: "neutral" },
  series: { label: "Serii", tone: "neutral" },
  user: { label: "Utilizatori", tone: "neutral" },
  warehouse: { label: "Gestiuni", tone: "warning" },
  expense: { label: "Cheltuieli", tone: "warning" },
  invoice: { label: "Documente", tone: "brand" },
  anaf: { label: "ANAF / SPV", tone: "danger" },
  assistant: { label: "Asistent AI", tone: "info" },
  settings: { label: "Setări", tone: "neutral" },
};

const entity = (e: string) => ENTITY_LABELS[e] ?? { label: e.charAt(0).toUpperCase() + e.slice(1), tone: "neutral" as Tone };

const columns: Column<ActivityRow>[] = [
  {
    key: "user",
    header: "Utilizator",
    sortValue: (r) => r.userName,
    cell: (r) => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        <Avatar name={r.userName} color={r.avatarColor ?? "#94a3b8"} size="sm" />
        <span className="font-medium">{r.userName}</span>
      </span>
    ),
  },
  { key: "entity", header: "Zona", sortValue: (r) => entity(r.entity).label, cell: (r) => <Badge tone={entity(r.entity).tone}>{entity(r.entity).label}</Badge> },
  { key: "message", header: "Activitate", sortValue: (r) => r.message, cell: (r) => <span className="line-clamp-2 min-w-64">{r.message}</span> },
  {
    key: "when",
    header: "Când",
    align: "right",
    sortValue: (r) => r.createdAt,
    csv: (r) => formatDateTime(r.createdAt),
    cell: (r) => (
      <Tooltip content={formatDateTime(r.createdAt)}>
        <span className="whitespace-nowrap text-muted-foreground">{formatRelative(r.createdAt)}</span>
      </Tooltip>
    ),
  },
];

export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  const zones = [...new Set(rows.map((r) => entity(r.entity).label))].sort((a, b) => a.localeCompare(b, "ro"));
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      search={(r) => `${r.message} ${r.userName}`}
      searchPlaceholder="Caută în jurnal…"
      filters={[
        { key: "entity", label: "Zona", options: zones.map((z) => ({ value: z, label: z })), predicate: (r, v) => entity(r.entity).label === v },
      ]}
      defaultSort={{ key: "when", dir: "desc" }}
      pageSize={25}
      dense
      csvFilename="jurnal-activitate"
      empty={<EmptyState compact icon={<History />} title="Nicio activitate" description="Acțiunile importante (emiteri, încasări, modificări de setări) apar aici." />}
    />
  );
}
