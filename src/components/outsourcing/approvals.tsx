"use client";

import { Check, CheckCheck, ChevronDown, Clock, ExternalLink, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Avatar, Checkbox, ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { useAction } from "@/hooks/use-action";
import { formatHours } from "@/lib/format";
import { formatDay, WEEKDAY_SHORT, weekDays, weekRangeLabel } from "@/lib/outsourcing/dates";
import { cn } from "@/lib/utils";
import { approveEntriesAction, rejectEntriesAction } from "@/app/(app)/pontaj/actions";

export type ApprovalEntry = {
  id: string;
  date: string;
  hours: number;
  description: string | null;
  billable: boolean;
  memberId: string;
  memberName: string;
  memberColor: string;
  memberPosition: string | null;
  weeklyCapacity: number;
  projectId: string;
  projectName: string;
  projectColor: string;
  projectCode: string | null;
  taskTitle: string | null;
  weekStart: string;
};

type Group = { key: string; memberId: string; weekStart: string; entries: ApprovalEntry[]; hours: number };

const QUICK_REASONS = ["Lipsește descrierea activității", "Ore pontate pe proiectul greșit", "Depășește estimarea agreată", "Verifică orele din weekend"];

export function ApprovalsView({ entries }: { entries: ApprovalEntry[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reject, setReject] = React.useState<{ ids: string[]; label: string } | null>(null);
  const { run, pending } = useAction();

  const members = React.useMemo(() => {
    const byMember = new Map<string, { id: string; name: string; color: string; position: string | null; capacity: number; groups: Group[]; hours: number }>();
    for (const e of entries) {
      let m = byMember.get(e.memberId);
      if (!m) byMember.set(e.memberId, (m = { id: e.memberId, name: e.memberName, color: e.memberColor, position: e.memberPosition, capacity: e.weeklyCapacity, groups: [], hours: 0 }));
      let g = m.groups.find((x) => x.weekStart === e.weekStart);
      if (!g) m.groups.push((g = { key: `${e.memberId}|${e.weekStart}`, memberId: e.memberId, weekStart: e.weekStart, entries: [], hours: 0 }));
      g.entries.push(e);
      g.hours += e.hours;
      m.hours += e.hours;
    }
    return [...byMember.values()].map((m) => ({ ...m, groups: m.groups.sort((a, b) => a.weekStart.localeCompare(b.weekStart)) }));
  }, [entries]);

  const groups = members.flatMap((m) => m.groups);
  React.useEffect(() => {
    setSelected((s) => new Set([...s].filter((k) => groups.some((g) => g.key === k))));
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const idsOf = (keys: Iterable<string>) => groups.filter((g) => [...keys].includes(g.key)).flatMap((g) => g.entries.map((e) => e.id));
  const totalHours = entries.reduce((a, e) => a + e.hours, 0);
  const billableHours = entries.filter((e) => e.billable).reduce((a, e) => a + e.hours, 0);
  const allSelected = groups.length > 0 && selected.size === groups.length;

  const approve = (ids: string[]) =>
    run(() => approveEntriesAction({ ids }), { success: (d) => `${formatHours(d.hours)} aprobate (${d.count} intrări)` });

  if (!entries.length)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50">
        <EmptyState
          icon={<CheckCheck />}
          title="Totul e la zi"
          description="Nu există ore în așteptarea aprobării. Când colegii trimit pontajul săptămânal, îl vei vedea aici."
          action={
            <Button variant="outline" asChild>
              <Link href="/pontaj">Mergi la pontaj</Link>
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Ore de aprobat" value={totalHours} format="hours" icon={<Clock />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Membri" value={members.length} format="number" icon={<Users />} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Săptămâni" value={groups.length} format="number" icon={<CheckCheck />} tone="warning" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Facturabile" value={totalHours ? (billableHours / totalHours) * 100 : 0} format="percent" icon={<Check />} tone="success" hint={formatHours(billableHours)} />
        </StaggerItem>
      </Stagger>

      <div className="sticky top-16 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/90 px-4 py-2.5 shadow-soft backdrop-blur">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={allSelected ? true : selected.size ? "indeterminate" : false}
            onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(groups.map((g) => g.key)))}
          />
          {selected.size ? (
            <span>
              <span className="font-semibold">{selected.size}</span> {selected.size === 1 ? "săptămână selectată" : "săptămâni selectate"} ·{" "}
              {formatHours(groups.filter((g) => selected.has(g.key)).reduce((a, g) => a + g.hours, 0))}
            </span>
          ) : (
            <span className="text-muted-foreground">Selectează tot</span>
          )}
        </label>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <Button variant="destructive-soft" size="sm" onClick={() => setReject({ ids: idsOf(selected), label: `${selected.size} săptămâni` })}>
                <X /> Respinge
              </Button>
              <Button variant="success" size="sm" loading={pending} onClick={() => approve(idsOf(selected))}>
                <Check /> Aprobă selecția
              </Button>
            </>
          ) : (
            <Button variant="success" size="sm" loading={pending} onClick={() => approve(entries.map((e) => e.id))}>
              <CheckCheck /> Aprobă tot ({formatHours(totalHours)})
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {members.map((m) => (
            <motion.section
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-soft"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-3">
                <Link href={`/echipa/${m.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.name} color={m.color} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold hover:text-primary">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.position}</div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="font-semibold tabular">{formatHours(m.hours)}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.groups.length} {m.groups.length === 1 ? "săptămână" : "săptămâni"}
                  </div>
                </div>
              </header>
              <AnimatePresence initial={false}>
                {m.groups.map((g) => (
                  <WeekGroup
                    key={g.key}
                    group={g}
                    capacity={m.capacity}
                    selected={selected.has(g.key)}
                    onSelect={(on) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (on) n.add(g.key);
                        else n.delete(g.key);
                        return n;
                      })
                    }
                    onApprove={() => approve(g.entries.map((e) => e.id))}
                    onReject={() => setReject({ ids: g.entries.map((e) => e.id), label: `${m.name} · ${weekRangeLabel(g.weekStart)}` })}
                    pending={pending}
                  />
                ))}
              </AnimatePresence>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      <RejectDialog
        target={reject}
        onClose={() => setReject(null)}
        onConfirm={(reason) =>
          run(() => rejectEntriesAction({ ids: reject!.ids, reason }), {
            success: (d) => `${d.count} intrări respinse`,
            onSuccess: () => setReject(null),
          })
        }
        pending={pending}
      />
    </div>
  );
}

function WeekGroup({
  group: g,
  capacity,
  selected,
  onSelect,
  onApprove,
  onReject,
  pending,
}: {
  group: Group;
  capacity: number;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const days = weekDays(g.weekStart);
  const perDay = days.map((d) => g.entries.filter((e) => e.date === d).reduce((a, e) => a + e.hours, 0));
  const maxDay = Math.max(8, ...perDay);
  const byProject = new Map<string, { name: string; color: string; hours: number }>();
  for (const e of g.entries) {
    const p = byProject.get(e.projectId) ?? { name: e.projectCode ?? e.projectName, color: e.projectColor, hours: 0 };
    p.hours += e.hours;
    byProject.set(e.projectId, p);
  }
  const over = g.hours > capacity * 1.1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
      className={cn("border-b border-border/70 last:border-0", selected && "bg-primary-soft/30")}
    >
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-64">
          <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label="Selectează săptămâna" />
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2 text-left">
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{weekRangeLabel(g.weekStart)}</div>
              <div className="text-xs text-muted-foreground">
                {g.entries.length} intrări ·{" "}
                <span className={cn("font-medium", over ? "text-warning" : "text-foreground")}>
                  {formatHours(g.hours)} / {formatHours(capacity)}
                </span>
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-end gap-1.5 lg:w-56" aria-hidden>
          {perDay.map((h, i) => (
            <Tooltip key={i} content={`${formatDay(days[i], "EEEE d MMM")}: ${formatHours(h)}`}>
              <div className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-8 w-full items-end overflow-hidden rounded bg-muted/60">
                  <motion.div
                    className={cn("w-full rounded", h > 10 ? "bg-warning" : i >= 5 && h > 0 ? "bg-info" : "bg-primary/80")}
                    initial={{ height: 0 }}
                    animate={{ height: `${(h / maxDay) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="text-[9.5px] text-muted-foreground">{WEEKDAY_SHORT[i]}</span>
              </div>
            </Tooltip>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {[...byProject.values()]
            .sort((a, b) => b.hours - a.hours)
            .map((p) => (
              <span key={p.name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                <ColorDot color={p.color} className="size-2" />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground tabular">{formatHours(p.hours)}</span>
              </span>
            ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" className="hover:text-danger" onClick={onReject} disabled={pending}>
            <X /> Respinge
          </Button>
          <Button variant="soft" size="sm" onClick={onApprove} disabled={pending}>
            <Check /> Aprobă
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="scrollbar-thin mx-4 mb-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <tbody>
                  {g.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 last:border-0">
                      <td className="w-28 px-3 py-2 text-xs text-muted-foreground first-letter:uppercase">{formatDay(e.date, "EEE d MMM")}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <ColorDot color={e.projectColor} className="size-2" />
                          {e.projectName}
                        </span>
                        {e.taskTitle && <span className="text-muted-foreground"> · {e.taskTitle}</span>}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">{e.description ?? <span className="italic opacity-60">fără descriere</span>}</td>
                      <td className="w-24 px-3 py-2 text-center text-xs">{e.billable ? <span className="text-success">facturabil</span> : <span className="text-muted-foreground">intern</span>}</td>
                      <td className="w-20 px-3 py-2 text-right font-semibold tabular">{formatHours(e.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="-mt-2 mb-3 px-4 text-right">
              <Link href={`/pontaj?membru=${g.memberId}&week=${g.weekStart}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                Deschide pontajul săptămânii <ExternalLink className="size-3" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RejectDialog({
  target,
  onClose,
  onConfirm,
  pending,
}: {
  target: { ids: string[]; label: string } | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (target) setReason("");
  }, [target]);
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(reason);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle>Respinge pontajul</DialogTitle>
            <DialogDescription>
              {target?.label} · {target?.ids.length} intrări. Motivul va fi afișat colegului în pagina de pontaj.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    reason === r ? "border-danger/40 bg-danger-soft text-danger-soft-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explică ce trebuie corectat…" rows={4} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={reason.trim().length < 3}>
              <X /> Respinge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

