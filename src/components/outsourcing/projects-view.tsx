"use client";

import { CalendarDays, CheckCircle2, Clock, FolderKanban, Hourglass, ListTodo, Plus, Search, Wallet, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { motion } from "motion/react";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarStack } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { BILLING_TYPE_LABELS, PROJECT_STATUS } from "@/lib/constants";
import { formatDateLong, formatHours, formatMoney } from "@/lib/format";
import { budgetTone, type BudgetInfo } from "@/lib/outsourcing/metrics";
import type { ClientOption, MemberLite } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { ProjectDialog } from "./project-dialog";
import { useOpenFromUrl, useUrlState } from "./shared";

export type ProjectCardData = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  status: string;
  billingType: string;
  currency: string;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  monthlyRetainer: number | null;
  team: { name: string; color: string }[];
  hours: number;
  monthHours: number;
  revenue: number;
  budget: BudgetInfo;
  budgetIsMoney: boolean;
  tasksOpen: number;
  tasksDone: number;
};

const toneColor = { brand: "var(--primary)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" };

export function NewProjectButton({ clients, members }: { clients: ClientOption[]; members: MemberLite[] }) {
  const [open, setOpen] = useOpenFromUrl();
  return (
    <ProjectDialog
      clients={clients}
      members={members}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus /> Proiect nou
        </Button>
      }
    />
  );
}

export function ProjectsView({
  projects,
  canManage,
  showMoney,
  kpis,
}: {
  projects: ProjectCardData[];
  canManage: boolean;
  showMoney: boolean;
  kpis: { active: number; monthHours: number; uninvoiced: number; monthRevenue: number; openTasks: number };
}) {
  const [status, setStatus] = useUrlState<string>("status", "active");
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return `${p.name} ${p.code ?? ""} ${p.clientName ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q);
    });
  }, [projects, status, query]);

  const options = [
    { value: "all", label: <Count label="Toate" n={counts.all} /> },
    ...["active", "planning", "on_hold", "completed", "cancelled"]
      .filter((s) => counts[s] || s === "active")
      .map((s) => ({ value: s, label: <Count label={PROJECT_STATUS[s].label} n={counts[s] ?? 0} /> })),
  ];

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Proiecte active" value={kpis.active} format="number" icon={<FolderKanban />} hint={`${projects.length} în total`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore pontate luna aceasta" value={kpis.monthHours} format="hours" icon={<Clock />} tone="info" />
        </StaggerItem>
        {showMoney ? (
          <>
            <StaggerItem>
              <StatCard label="Ore aprobate nefacturate" value={kpis.uninvoiced} format="hours" icon={<Hourglass />} tone="warning" hint="gata de facturat" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Venit estimat luna aceasta" value={kpis.monthRevenue} format="money" currency="EUR" icon={<Wallet />} tone="success" />
            </StaggerItem>
          </>
        ) : (
          <>
            <StaggerItem>
              <StatCard label="Task-uri deschise" value={kpis.openTasks} format="number" icon={<ListTodo />} tone="warning" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Proiecte finalizate" value={counts.completed ?? 0} format="number" icon={<CheckCircle2 />} tone="success" />
            </StaggerItem>
          </>
        )}
      </Stagger>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <Segmented value={status} onChange={setStatus} options={options} />
        </div>
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Caută proiect, cod sau client…" className="pl-9" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50">
          <EmptyState
            icon={<FolderKanban />}
            title={projects.length ? "Niciun proiect găsit" : "Încă nu ai proiecte"}
            description={projects.length ? "Schimbă filtrul de status sau termenul căutat." : "Creează primul proiect, adaugă echipa și începe să pontezi ore."}
            action={!projects.length && canManage ? <Button asChild><Link href="/proiecte?nou=1"><Plus /> Proiect nou</Link></Button> : undefined}
          />
        </div>
      ) : (
        <Stagger key={`${status}`} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" stagger={0.04}>
          {filtered.map((p) => (
            <StaggerItem key={p.id} layout="position">
              <ProjectCard p={p} showMoney={showMoney} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <>
      {label}
      <span className="rounded-md bg-foreground/[0.06] px-1.5 text-[11px] tabular text-muted-foreground">{n}</span>
    </>
  );
}

function ProjectCard({ p, showMoney }: { p: ProjectCardData; showMoney: boolean }) {
  const tone = budgetTone(p.budget.percent);
  const totalTasks = p.tasksOpen + p.tasksDone;
  return (
    <Link
      href={`/proiecte/${p.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      style={{ ["--pc" as string]: p.color }}
    >
      {/* accent */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${p.color}, color-mix(in oklab, ${p.color} 35%, transparent))` }} />
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `color-mix(in oklab, ${p.color} 22%, transparent)` }}
      />
      <div className="relative flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="grid size-10 shrink-0 place-items-center rounded-xl font-mono text-[11px] font-bold text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #000))` }}
            >
              {(p.code ?? p.name).slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] leading-tight font-semibold tracking-tight">{p.name}</h3>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{p.clientName ?? "Proiect intern"}</p>
            </div>
          </div>
          <StatusBadge status={p.status} map={PROJECT_STATUS} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{BILLING_TYPE_LABELS[p.billingType]}</span>
          {(p.startDate || p.endDate) && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDateLong(p.startDate)} → {p.endDate ? formatDateLong(p.endDate) : "…"}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              {p.billingType === "retainer" ? "Retainer lunar" : p.budget.percent === null ? "Fără buget" : "Buget consumat"}
            </span>
            <span className="font-medium tabular">
              {p.billingType === "retainer" && showMoney && p.monthlyRetainer ? (
                `${formatMoney(p.monthlyRetainer, p.currency)} / lună`
              ) : p.budget.percent !== null ? (
                <>
                  <span className={cn(tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{Math.round(p.budget.percent)}%</span>
                  {p.budget.total !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {p.budget.unit === "hours" ? `${Math.round(p.budget.used)} / ${p.budget.total} h` : `${formatMoney(p.budget.used, p.currency, { compact: true })} / ${formatMoney(p.budget.total, p.currency, { compact: true })}`}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">{formatHours(p.hours)} total</span>
              )}
            </span>
          </div>
          <AnimatedBar value={p.budget.percent ?? (p.billingType === "retainer" ? 100 : 0)} color={p.budget.percent === null ? p.color : toneColor[tone]} />
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 rounded-lg bg-subtle/80 p-2.5 text-center ring-1 ring-border/60 ring-inset">
          <Metric label="Luna aceasta" value={formatHours(p.monthHours)} />
          <Metric label="Total ore" value={formatHours(p.hours)} />
          <Metric label="Task-uri" value={totalTasks ? `${p.tasksDone}/${totalTasks}` : "—"} />
        </div>

        <div className="flex items-center justify-between">
          {p.team.length ? <AvatarStack people={p.team} max={5} /> : <span className="text-xs text-muted-foreground">Fără echipă</span>}
          {showMoney && p.revenue > 0 && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground">
              venit estimat <span className="font-semibold text-foreground tabular">{formatMoney(p.revenue, p.currency, { compact: true })}</span>
            </motion.span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[13px] font-semibold tabular">{value}</div>
      <div className="truncate text-[10.5px] text-muted-foreground">{label}</div>
    </div>
  );
}
