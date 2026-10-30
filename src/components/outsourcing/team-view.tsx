"use client";

import { Activity, Clock, Contact, LayoutGrid, Pencil, Plus, Rows3, Search, Users, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Avatar, ColorDot, Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { SENIORITY_LABELS } from "@/lib/constants";
import { formatHours, formatMoney } from "@/lib/format";
import { utilizationLevel } from "@/lib/outsourcing/metrics";
import type { MemberFormData } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { MemberDialog } from "./member-dialog";
import { useOpenFromUrl, useUrlState } from "./shared";

export type TeamCard = MemberFormData & {
  id: string;
  hasUser: boolean;
  utilization: number;
  billablePct: number;
  monthHours: number;
  allocatedToday: number;
  projects: { id: string; name: string; code: string | null; color: string }[];
};

const EMPLOYMENT_SHORT: Record<string, string> = { cim: "CIM", pfa: "PFA", srl: "SRL", freelancer: "Freelancer" };

export function NewMemberButton() {
  const [open, setOpen] = useOpenFromUrl();
  return (
    <MemberDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus /> Membru nou
        </Button>
      }
    />
  );
}

function utilClass(u: number) {
  const l = utilizationLevel(u);
  return l === "over" ? "text-danger" : l === "ok" ? "text-success" : l === "under" ? "text-info" : "text-muted-foreground";
}
function utilColor(u: number) {
  const l = utilizationLevel(u);
  return l === "over" ? "var(--danger)" : l === "ok" ? "var(--success)" : "var(--info)";
}

export function TeamView({ members, canManage, showMoney }: { members: TeamCard[]; canManage: boolean; showMoney: boolean }) {
  const [dept, setDept] = useUrlState<string>("departament", "");
  const [layout, setLayout] = useUrlState<"carduri" | "tabel">("vedere", "carduri");
  const [query, setQuery] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<TeamCard | null>(null);

  const departments = React.useMemo(() => {
    const c = new Map<string, number>();
    for (const m of members) if (m.active && m.department) c.set(m.department, (c.get(m.department) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (!showInactive && !m.active) return false;
      if (dept && m.department !== dept) return false;
      if (q && !`${m.name} ${m.position ?? ""} ${m.skills.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, dept, query, showInactive]);

  const active = members.filter((m) => m.active);
  const avgUtil = active.length ? active.reduce((a, m) => a + m.utilization, 0) / active.length : 0;
  const billableActive = active.filter((m) => m.hourlyRate > 0);
  const avgRate = billableActive.length ? billableActive.reduce((a, m) => a + m.hourlyRate, 0) / billableActive.length : 0;

  const columns: Column<TeamCard>[] = [
    {
      key: "name",
      header: "Membru",
      cell: (m) => (
        <span className="flex items-center gap-3">
          <Avatar name={m.name} color={m.color} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{m.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{m.position}</span>
          </span>
        </span>
      ),
      sortValue: (m) => m.name,
    },
    { key: "department", header: "Departament", cell: (m) => m.department ?? "—", sortValue: (m) => m.department ?? "", hideOnMobile: true },
    { key: "seniority", header: "Nivel", cell: (m) => <Badge>{SENIORITY_LABELS[m.seniority]}</Badge>, sortValue: (m) => m.seniority, hideOnMobile: true },
    { key: "employment", header: "Contract", cell: (m) => EMPLOYMENT_SHORT[m.employmentType], sortValue: (m) => m.employmentType, hideOnMobile: true },
    ...(showMoney
      ? [
          {
            key: "rate",
            header: "Tarif",
            align: "right" as const,
            cell: (m: TeamCard) => (m.hourlyRate ? `${formatMoney(m.hourlyRate, m.rateCurrency)}/h` : "—"),
            sortValue: (m: TeamCard) => m.hourlyRate,
          },
          {
            key: "cost",
            header: "Cost",
            align: "right" as const,
            hideOnMobile: true,
            cell: (m: TeamCard) => `${formatMoney(m.hourlyCost, "RON")}/h`,
            sortValue: (m: TeamCard) => m.hourlyCost,
          },
        ]
      : []),
    {
      key: "util",
      header: "Utilizare 4 săpt.",
      cell: (m) => (
        <span className="flex items-center gap-2">
          <AnimatedBar value={m.utilization} color={utilColor(m.utilization)} className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" />
          <span className={cn("text-xs font-semibold tabular", utilClass(m.utilization))}>{Math.round(m.utilization)}%</span>
        </span>
      ),
      sortValue: (m) => m.utilization,
    },
    { key: "month", header: "Ore luna", align: "right", cell: (m) => formatHours(m.monthHours), sortValue: (m) => m.monthHours },
    {
      key: "projects",
      header: "Proiecte",
      hideOnMobile: true,
      cell: (m) => (
        <span className="flex items-center gap-1">
          {m.projects.slice(0, 4).map((p) => (
            <Tooltip key={p.id} content={p.name}>
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white" style={{ background: p.color }}>
                {p.code ?? p.name.slice(0, 3)}
              </span>
            </Tooltip>
          ))}
          {m.projects.length > 4 && <span className="text-xs text-muted-foreground">+{m.projects.length - 4}</span>}
        </span>
      ),
      sortValue: (m) => m.projects.length,
    },
  ];

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Membri activi" value={active.length} format="number" icon={<Users />} hint={`${departments.length} departamente`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Utilizare medie (4 săpt.)"
            value={avgUtil}
            format="percent"
            icon={<Activity />}
            tone={avgUtil > 100 ? "danger" : avgUtil >= 80 ? "success" : "warning"}
            hint="ore pontate / capacitate"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore pontate luna aceasta" value={active.reduce((a, m) => a + m.monthHours, 0)} format="hours" icon={<Clock />} tone="info" />
        </StaggerItem>
        <StaggerItem>
          {showMoney ? (
            <StatCard label="Tarif mediu facturabil" value={avgRate} format="money" currency="EUR" icon={<Wallet />} tone="success" hint="pe oră, membri facturabili" />
          ) : (
            <StatCard label="Capacitate săptămânală" value={active.reduce((a, m) => a + m.weeklyCapacity, 0)} format="hours" icon={<Wallet />} tone="success" />
          )}
        </StaggerItem>
      </Stagger>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-thin -mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {[["", "Toți", active.length] as const, ...departments.map(([d, n]) => [d, d, n] as const)].map(([value, label, n]) => (
            <button
              key={value || "all"}
              onClick={() => setDept(value)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all",
                dept === value ? "bg-foreground text-background shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {label}
              <span className="text-[11px] opacity-60 tabular">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nume, rol, competență…" className="h-8 pl-9" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Inactivi
          </label>
          <Segmented
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "carduri", label: "Carduri", icon: <LayoutGrid /> },
              { value: "tabel", label: "Tabel", icon: <Rows3 /> },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50">
          <EmptyState icon={<Contact />} title="Nimeni găsit" description="Schimbă filtrul de departament sau termenul căutat." />
        </div>
      ) : layout === "tabel" ? (
        <DataTable rows={filtered} columns={columns} getRowId={(m) => m.id} rowHref={(m) => `/echipa/${m.id}`} csvFilename="echipa" pageSize={25} />
      ) : (
        <Stagger key={`${dept}-${showInactive}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" stagger={0.035}>
          {filtered.map((m) => (
            <StaggerItem key={m.id} layout="position">
              <MemberCard m={m} showMoney={showMoney} canManage={canManage} onEdit={() => setEditing(m)} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {canManage && <MemberDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} member={editing} showMoney={showMoney} />}
    </div>
  );
}

function MemberCard({ m, showMoney, canManage, onEdit }: { m: TeamCard; showMoney: boolean; canManage: boolean; onEdit: () => void }) {
  const cap = m.weeklyCapacity / 5;
  return (
    <div className={cn("group relative h-full", !m.active && "opacity-60")}>
      <Link
        href={`/echipa/${m.id}`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <div className="relative h-14" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${m.color} 32%, var(--card)), color-mix(in oklab, ${m.color} 6%, var(--card)))` }}>
          <div className="absolute inset-0 bg-dots opacity-40" />
        </div>
        <div className="relative -mt-8 flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className="flex items-end justify-between gap-2">
            <Avatar name={m.name} color={m.color} size="xl" className="ring-4" />
            <div className="flex flex-wrap justify-end gap-1 pb-1">
              <Badge>{SENIORITY_LABELS[m.seniority]}</Badge>
              <Badge tone={m.employmentType === "cim" ? "neutral" : "brand"}>{EMPLOYMENT_SHORT[m.employmentType]}</Badge>
              {!m.active && <Badge tone="warning">inactiv</Badge>}
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{m.name}</h3>
            <p className="truncate text-[13px] text-muted-foreground">
              {m.position ?? "—"}
              {m.department && <span className="text-muted-foreground/70"> · {m.department}</span>}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Utilizare ultimele 4 săpt.</span>
              <span className={cn("font-semibold tabular", utilClass(m.utilization))}>{Math.round(m.utilization)}%</span>
            </div>
            <AnimatedBar value={m.utilization} color={utilColor(m.utilization)} />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{Math.round(m.billablePct)}% facturabil</span>
              <span className={cn(m.allocatedToday > cap && "font-medium text-danger")}>
                azi: {m.allocatedToday ? `${formatHours(m.allocatedToday)} alocate` : "nealocat"}
              </span>
            </div>
          </div>

          {showMoney && (
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-subtle/80 p-2.5 text-center ring-1 ring-border/60 ring-inset">
              <div>
                <div className="text-[13px] font-semibold tabular">{m.hourlyRate ? formatMoney(m.hourlyRate, m.rateCurrency).replace(/,00/, "") : "—"}</div>
                <div className="text-[10.5px] text-muted-foreground">tarif / h</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tabular">{formatMoney(m.hourlyCost, "RON").replace(/,00/, "")}</div>
                <div className="text-[10.5px] text-muted-foreground">cost / h</div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tabular">{formatHours(m.monthHours)}</div>
                <div className="text-[10.5px] text-muted-foreground">luna asta</div>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-2.5">
            {m.projects.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {m.projects.slice(0, 4).map((p) => (
                  <span key={p.id} className="inline-flex max-w-[140px] items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium">
                    <ColorDot color={p.color} className="size-2" />
                    <span className="truncate">{p.code ?? p.name}</span>
                  </span>
                ))}
                {m.projects.length > 4 && <span className="px-1 text-[11px] text-muted-foreground">+{m.projects.length - 4}</span>}
              </div>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">Fără proiecte active</p>
            )}
            {m.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {m.skills.slice(0, 4).map((s) => (
                  <span key={s} className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10.5px] font-medium text-primary-soft-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
      {canManage && (
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`Editează ${m.name}`}
          onClick={onEdit}
          className="absolute top-2.5 right-2.5 bg-card/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}
