"use client";

import { CalendarDays, FileText, KanbanSquare, LayoutDashboard, MoreHorizontal, Pencil, Timer, Trash2, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { BILLING_TYPE_LABELS, PROJECT_STATUS } from "@/lib/constants";
import { formatDateLong } from "@/lib/format";
import type { BudgetInfo } from "@/lib/outsourcing/metrics";
import type { ClientOption, MemberLite, ProjectFormData } from "@/lib/outsourcing/types";
import { deleteProjectAction } from "@/app/(app)/proiecte/actions";
import { Kanban } from "./kanban";
import { ProjectBilling } from "./project-billing";
import { ProjectDialog } from "./project-dialog";
import { ProjectEntries } from "./project-entries";
import { ProjectOverview } from "./project-overview";
import { ProjectTeam } from "./project-team";
import { useUrlState } from "./shared";

export type ProjectEntry = {
  id: string;
  date: string;
  hours: number;
  description: string | null;
  billable: boolean;
  status: string;
  memberId: string;
  memberName: string;
  memberColor: string;
  memberPosition: string | null;
  taskId: string | null;
  taskTitle: string | null;
  invoicedDocumentId: string | null;
  invoiceNumber: string | null;
  rejectionReason: string | null;
  running: boolean;
  rate: number;
};

export type KanbanTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  estimateHours: number | null;
  dueDate: string | null;
  position: number;
  loggedHours: number;
};

export type ProjectMemberRow = {
  memberId: string;
  name: string;
  color: string;
  position: string | null;
  active: boolean;
  role: string | null;
  rateOverride: number | null;
  memberRate: number | null;
  memberRateCurrency: string;
  effectiveRate: number;
  hours: number;
};

export type ProjectDetailData = {
  project: Omit<ProjectFormData, "id" | "description"> & { id: string; description: string | null };
  client: { id: string; name: string; country: string } | null;
  manager: { id: string; name: string; color: string; position: string | null } | null;
  stats: {
    hours: number;
    billableHours: number;
    monthHours: number;
    revenue: number;
    revenueRon: number;
    costRon: number;
    marginRon: number;
    marginPct: number;
    uninvoicedApprovedHours: number;
    budget: BudgetInfo;
  };
  weekly: Record<string, number | string>[];
  series: { id: string; name: string; color: string }[];
  burn: { unit: "hours" | "money"; total: number | null; points: { label: string; actual: number; ideal: number | null }[] };
  members: ProjectMemberRow[];
  tasks: KanbanTask[];
  entries: ProjectEntry[];
  documents: { id: string; fullNumber: string; status: string; issueDate: string; total: number; currency: string; kind: string }[];
  team: MemberLite[];
  clients: ClientOption[];
};

export function ProjectDetail({
  data,
  canManage,
  canBill,
  showMoney,
  meId,
  today,
}: {
  data: ProjectDetailData;
  canManage: boolean;
  canBill: boolean;
  showMoney: boolean;
  meId: string | null;
  today: string;
}) {
  const { project: p } = data;
  const router = useRouter();
  const [tab, setTab] = useUrlState<string>("tab", "prezentare");
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { run } = useAction();
  const openTasks = data.tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-6">
      {/* Antet */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      >
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${p.color}, color-mix(in oklab, ${p.color} 30%, transparent))` }} />
        <div
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: `color-mix(in oklab, ${p.color} 16%, transparent)` }}
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <nav className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/proiecte" className="transition-colors hover:text-foreground">
                Proiecte
              </Link>
              <span className="opacity-50">/</span>
              <span className="truncate text-foreground/80">{p.code ?? p.name}</span>
            </nav>
            <div className="flex items-start gap-4">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-2xl font-mono text-xs font-bold text-white shadow-lift"
                style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #000))` }}
              >
                {(p.code ?? p.name).slice(0, 3).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
                  <StatusBadge status={p.status} map={PROJECT_STATUS} pulse={p.status === "active"} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                  {data.client ? (
                    canBill ? (
                      <Link href={`/clienti/${data.client.id}`} className="font-medium text-foreground/90 underline-offset-4 hover:text-primary hover:underline">
                        {data.client.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground/90">{data.client.name}</span>
                    )
                  ) : (
                    <span>Proiect intern</span>
                  )}
                  <Badge tone="neutral">{BILLING_TYPE_LABELS[p.billingType]}</Badge>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {formatDateLong(p.startDate)} → {p.endDate ? formatDateLong(p.endDate) : "nedefinit"}
                  </span>
                  {data.manager && (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={data.manager.name} color={data.manager.color} size="xs" className="ring-0" />
                      {data.manager.name}
                      <span className="text-muted-foreground/70">· manager</span>
                    </span>
                  )}
                </div>
                {p.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{p.description}</p>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/planificare?proiect=${p.id}`}>
                <CalendarDays /> Planificare
              </Link>
            </Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil /> Editează
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Mai multe">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <Link href="/pontaj">
                        <Timer /> Pontează ore
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                      <Trash2 /> Șterge proiectul
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="prezentare">
            <LayoutDashboard /> Prezentare
          </TabsTrigger>
          <TabsTrigger value="taskuri">
            <KanbanSquare /> Task-uri
            <span className="rounded-md bg-foreground/[0.06] px-1.5 text-[11px] text-muted-foreground tabular">{openTasks}</span>
          </TabsTrigger>
          <TabsTrigger value="echipa">
            <Users /> Echipă
            <span className="rounded-md bg-foreground/[0.06] px-1.5 text-[11px] text-muted-foreground tabular">{data.members.length}</span>
          </TabsTrigger>
          <TabsTrigger value="pontaj">
            <Timer /> Pontaj
          </TabsTrigger>
          {canBill && (
            <TabsTrigger value="facturare">
              <FileText /> Facturare
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="prezentare">
          <ProjectOverview data={data} showMoney={showMoney} />
        </TabsContent>
        <TabsContent value="taskuri">
          <Kanban projectId={p.id} tasks={data.tasks} members={data.members} canManage={canManage} meId={meId} today={today} />
        </TabsContent>
        <TabsContent value="echipa">
          <ProjectTeam projectId={p.id} currency={p.currency} members={data.members} team={data.team} canManage={canManage} showMoney={showMoney} />
        </TabsContent>
        <TabsContent value="pontaj">
          <ProjectEntries entries={data.entries} showMoney={canBill} currency={p.currency} />
        </TabsContent>
        {canBill && (
          <TabsContent value="facturare">
            <ProjectBilling data={data} today={today} />
          </TabsContent>
        )}
      </Tabs>

      {canManage && (
        <>
          <ProjectDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            project={{ ...p }}
            clients={data.clients}
            members={data.team}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            destructive
            title={`Ștergi proiectul ${p.name}?`}
            description="Se șterg și task-urile și membrii proiectului. Proiectele cu pontaje sau facturi nu pot fi șterse — schimbă-le statusul."
            confirmLabel="Șterge"
            onConfirm={() =>
              new Promise<void>((resolve) =>
                run(() => deleteProjectAction(p.id), {
                  onSuccess: () => {
                    resolve();
                    router.push("/proiecte");
                  },
                  onError: () => resolve(),
                }),
              )
            }
          />
        </>
      )}
    </div>
  );
}
