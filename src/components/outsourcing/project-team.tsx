"use client";

import { Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { AnimatedBar } from "@/components/motion";
import { useAction } from "@/hooks/use-action";
import { formatHours, formatMoney } from "@/lib/format";
import { pct } from "@/lib/outsourcing/metrics";
import type { MemberLite } from "@/lib/outsourcing/types";
import { addProjectMemberAction, removeProjectMemberAction, updateProjectMemberAction } from "@/app/(app)/proiecte/actions";
import type { ProjectMemberRow } from "./project-detail";
import { DecimalInput, memberOptions } from "./shared";

export function ProjectTeam({
  projectId,
  currency,
  members,
  team,
  canManage,
  showMoney,
}: {
  projectId: string;
  currency: string;
  members: ProjectMemberRow[];
  team: MemberLite[];
  canManage: boolean;
  showMoney: boolean;
}) {
  const [editing, setEditing] = React.useState<{ open: boolean; row: ProjectMemberRow | null }>({ open: false, row: null });
  const [removing, setRemoving] = React.useState<ProjectMemberRow | null>(null);
  const { run } = useAction();
  const totalHours = members.reduce((a, m) => a + m.hours, 0);
  const maxHours = Math.max(1, ...members.map((m) => m.hours));
  const available = team.filter((t) => t.active && !members.some((m) => m.memberId === t.id));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Echipa proiectului</h3>
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "membru" : "membri"} · {formatHours(totalHours)} pontate în total
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing({ open: true, row: null })} disabled={!available.length}>
            <UserPlus /> Adaugă membru
          </Button>
        )}
      </div>
      {members.length === 0 ? (
        <EmptyState compact icon={<Users />} title="Nimeni în echipă încă" description="Adaugă membri ca să poată ponta ore pe acest proiect." />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Membru</TH>
              <TH className="hidden md:table-cell">Rol în proiect</TH>
              {showMoney && <TH className="text-right">Tarif</TH>}
              <TH className="w-[28%]">Ore pontate</TH>
              {canManage && <TH className="w-24" />}
            </TR>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.memberId} className="group">
                <TD>
                  <Link href={`/echipa/${m.memberId}`} className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.color} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="truncate group-hover:text-primary">{m.name}</span>
                        {!m.active && <Badge>inactiv</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{m.position ?? "—"}</div>
                    </div>
                  </Link>
                </TD>
                <TD className="hidden text-muted-foreground md:table-cell">{m.role ?? "—"}</TD>
                {showMoney && (
                  <TD className="text-right tabular">
                    <div className="font-medium">{m.effectiveRate ? `${formatMoney(m.effectiveRate, currency)}/h` : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{m.rateOverride ? "tarif specific proiect" : m.memberRate ? "tarif membru" : "tarif proiect"}</div>
                  </TD>
                )}
                <TD>
                  <div className="flex items-center gap-3">
                    <AnimatedBar value={pct(m.hours, maxHours)} color={m.color} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" />
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular">{formatHours(m.hours)}</span>
                  </div>
                </TD>
                {canManage && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon-xs" aria-label="Editează" onClick={() => setEditing({ open: true, row: m })}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Elimină" className="hover:text-danger" onClick={() => setRemoving(m)}>
                        <UserMinus />
                      </Button>
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
          <TFoot>
            <TR className="hover:bg-transparent">
              <TD className="text-muted-foreground">Total</TD>
              <TD className="hidden md:table-cell" />
              {showMoney && <TD />}
              <TD className="text-right font-semibold tabular">{formatHours(totalHours)}</TD>
              {canManage && <TD />}
            </TR>
          </TFoot>
        </Table>
      )}

      <MemberDialog
        open={editing.open}
        onOpenChange={(o) => setEditing((e) => ({ ...e, open: o }))}
        row={editing.row}
        available={available}
        projectId={projectId}
        currency={currency}
        showMoney={showMoney}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        title={`Elimini pe ${removing?.name ?? ""} din proiect?`}
        description="Orele deja pontate rămân. Task-urile deschise atribuite lui devin neatribuite."
        confirmLabel="Elimină"
        onConfirm={() =>
          new Promise<void>((resolve) => run(() => removeProjectMemberAction(projectId, removing!.memberId), { onSuccess: () => resolve(), onError: () => resolve() }))
        }
      />
    </Card>
  );
}

function MemberDialog({
  open,
  onOpenChange,
  row,
  available,
  projectId,
  currency,
  showMoney,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: ProjectMemberRow | null;
  available: MemberLite[];
  projectId: string;
  currency: string;
  showMoney: boolean;
}) {
  const [memberId, setMemberId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState("");
  const [rate, setRate] = React.useState<number | null>(null);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setMemberId(row?.memberId ?? null);
      setRole(row?.role ?? "");
      setRate(row?.rateOverride ?? null);
    }
  }, [open, row]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return;
    const input = { projectId, memberId, role, hourlyRate: rate };
    run(() => (row ? updateProjectMemberAction(input) : addProjectMemberAction(input)), { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{row ? row.name : "Adaugă în proiect"}</DialogTitle>
            <DialogDescription>Rolul și, opțional, un tarif facturabil specific acestui proiect.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!row && (
              <Field label="Membru" required>
                <Combobox
                  options={memberOptions(available)}
                  value={memberId}
                  onChange={(v) => {
                    setMemberId(v);
                    const m = available.find((x) => x.id === v);
                    if (m && !role) setRole(m.position ?? "");
                  }}
                  placeholder="Alege din echipă…"
                />
              </Field>
            )}
            <Field label="Rol în proiect">
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="ex. Tech lead" />
            </Field>
            {showMoney && (
              <Field label="Tarif specific / oră" hint="Gol = se folosește tariful membrului sau al proiectului">
                <DecimalInput value={rate} onChange={setRate} suffix={currency} />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={pending} disabled={!memberId}>
              {row ? "Salvează" : "Adaugă"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
