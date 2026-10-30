"use client";

import { Check, Copy, KeyRound, Minus, RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { addUserAction, removeMembershipAction, updateMembershipAction, type AddUserInput } from "@/app/(app)/setari/utilizatori/actions";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: string;
  teamMemberId: string | null;
  teamMemberName: string | null;
  createdAt: string;
  isSelf: boolean;
};
export type TeamOption = { id: string; name: string; position: string | null; linkedTo: string | null };
export type PermissionMatrix = { roles: string[]; rows: { key: string; label: string; description: string; allowed: Record<string, boolean> }[] };

const ROLE_HINTS: Record<string, string> = {
  owner: "Acces complet, inclusiv gestionarea proprietarilor",
  admin: "Acces complet, fără a putea modifica proprietarii",
  accountant: "Facturare, ANAF și rapoarte",
  manager: "Proiecte, echipă, aprobări pontaj și rapoarte",
  employee: "Doar pontajul propriu și vizualizarea proiectelor",
};
const ROLE_TONE: Record<string, "brand" | "info" | "success" | "warning" | "neutral"> = { owner: "brand", admin: "info", accountant: "success", manager: "warning", employee: "neutral" };

function tempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export function UsersManager({ members, team, matrix, myRole }: { members: MemberRow[]; team: TeamOption[]; matrix: PermissionMatrix; myRole: string }) {
  const [adding, setAdding] = React.useState(false);
  const owners = members.filter((m) => m.role === "owner").length;
  const isOwner = myRole === "owner";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeaderRow
          title="Utilizatori cu acces"
          description={`${members.length} ${members.length === 1 ? "persoană are" : "persoane au"} acces la această firmă`}
          icon={<Users />}
          actions={
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus /> <span className="hidden sm:inline">Adaugă utilizator</span>
            </Button>
          }
        />
        <Stagger className="divide-y divide-border border-t border-border">
          {members.map((m) => (
            <StaggerItem key={m.id}>
              <MemberRowView m={m} team={team} canEditOwner={isOwner} lastOwner={m.role === "owner" && owners <= 1} />
            </StaggerItem>
          ))}
        </Stagger>
      </Card>

      <Card className="overflow-hidden">
        <CardHeaderRow title="Ce poate face fiecare rol" description="Permisiunile se aplică per firmă — același cont poate avea roluri diferite în firme diferite." icon={<ShieldCheck />} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-subtle/50">
                <th className="h-10 px-5 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Permisiune</th>
                {matrix.roles.map((r) => (
                  <th key={r} className="h-10 px-3 text-center text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </td>
                  {matrix.roles.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {row.allowed[r] ? (
                        <span className="inline-grid size-6 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground/40" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddUserDialog open={adding} onOpenChange={setAdding} team={team} isOwner={isOwner} />
    </div>
  );
}

function MemberRowView({ m, team, canEditOwner, lastOwner }: { m: MemberRow; team: TeamOption[]; canEditOwner: boolean; lastOwner: boolean }) {
  const { run, pending } = useAction();
  const lockedRole = lastOwner || (!canEditOwner && m.role === "owner");
  const roleOptions = Object.keys(ROLE_LABELS).filter((r) => canEditOwner || r !== "owner" || m.role === "owner");
  const teamChoices = team.filter((t) => !t.linkedTo || t.linkedTo === m.id);

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 transition-opacity md:flex", pending && "opacity-60")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={m.name} color={m.avatarColor} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{m.name}</span>
            {m.isSelf && <Badge tone="brand">tu</Badge>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {m.email} · din {formatDate(m.createdAt)}
          </div>
        </div>
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-2 md:flex md:w-auto md:items-center">
        <Tooltip content={lastOwner ? "Ultimul proprietar nu poate fi retrogradat" : lockedRole ? "Doar un proprietar poate modifica acest rol" : ROLE_HINTS[m.role]}>
          <div className="md:w-44">
            <NativeSelect
              value={m.role}
              disabled={lockedRole || pending}
              onChange={(e) => run(() => updateMembershipAction({ membershipId: m.id, role: e.target.value as AddUserInput["role"] }))}
              className="h-8 text-[13px]"
              aria-label="Rol"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </Tooltip>
        <div className="md:w-48">
          <NativeSelect
            value={m.teamMemberId ?? ""}
            disabled={pending}
            onChange={(e) => run(() => updateMembershipAction({ membershipId: m.id, teamMemberId: e.target.value || null }))}
            className="h-8 text-[13px]"
            aria-label="Membru de echipă"
          >
            <option value="">— fără membru echipă —</option>
            {teamChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.position ? ` · ${t.position}` : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="row-start-1 flex justify-end md:order-last md:w-9">
        {!m.isSelf && !(m.role === "owner" && (lastOwner || !canEditOwner)) ? (
          <ConfirmDialog
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label="Revocă accesul" disabled={pending}>
                <Trash2 />
              </Button>
            }
            title={`Revoci accesul lui ${m.name}?`}
            description="Contul rămâne activ pentru alte firme, dar nu va mai putea vedea datele acestei firme. Istoricul (pontaj, documente) se păstrează."
            confirmLabel="Revocă accesul"
            destructive
            onConfirm={() => new Promise<void>((resolve) => run(() => removeMembershipAction(m.id), { onSuccess: () => resolve(), onError: () => resolve() }))}
          />
        ) : (
          <span className="size-8" />
        )}
      </div>
    </div>
  );
}

function AddUserDialog({ open, onOpenChange, team, isOwner }: { open: boolean; onOpenChange: (o: boolean) => void; team: TeamOption[]; isOwner: boolean }) {
  const empty = (): AddUserInput & { teamMode: "none" | "create" | "link" } => ({ email: "", name: "", password: tempPassword(), role: "employee", teamMember: "none", teamMode: "create" });
  const [form, setForm] = React.useState(empty);
  const [done, setDone] = React.useState<{ existed: boolean; name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { run, pending } = useAction();
  const free = team.filter((t) => !t.linkedTo);

  React.useEffect(() => {
    if (open) {
      setForm(empty());
      setDone(null);
      setCopied(false);
    }
  }, [open]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const teamMember = form.teamMode === "create" ? "create" : form.teamMode === "link" ? form.teamMember : "none";
    run(() => addUserAction({ email: form.email, name: form.name, password: form.password, role: form.role, teamMember: teamMember || "none" }), {
      success: (d) => (d.existed ? `${d.name} are acum acces la firmă` : `Cont creat pentru ${d.name}`),
      onSuccess: (d) => setDone({ ...d, password: form.password ?? "" }),
    });
  };

  const credentials = done ? `AND (ANAF for Dummies) — ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${done.email}\nParolă temporară: ${done.password}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {done ? (
          <>
            <DialogHeader className="items-center pr-6 text-center">
              <div className="mb-2 grid size-12 place-items-center rounded-full bg-success-soft text-success">
                <Check className="size-5" />
              </div>
              <DialogTitle>{done.existed ? "Acces acordat" : "Cont creat"}</DialogTitle>
              <DialogDescription>
                {done.existed
                  ? `${done.name} avea deja un cont AND; firma apare acum în lista sa de firme.`
                  : "Trimite-i datele de autentificare pe un canal sigur. La prima conectare își poate schimba parola din Profil."}
              </DialogDescription>
            </DialogHeader>
            {!done.existed && (
              <DialogBody>
                <div className="rounded-lg border border-border bg-subtle/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{credentials}</div>
              </DialogBody>
            )}
            <DialogFooter>
              {!done.existed && (
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(credentials).then(() => {
                      setCopied(true);
                      toast.success("Copiat în clipboard");
                    });
                  }}
                >
                  {copied ? <Check /> : <Copy />} Copiază datele
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Gata</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>Adaugă utilizator</DialogTitle>
              <DialogDescription>Dacă emailul are deja cont AND, îi acordăm doar acces la această firmă (numele și parola se ignoră).</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="coleg@firma.ro" autoFocus required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nume complet" hint="Pentru cont nou">
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ion Popescu" />
                </Field>
                <Field label="Parolă temporară" hint="Minim 8 caractere">
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={form.password} onChange={(e) => set("password", e.target.value)} className="pr-9 pl-9 font-mono text-[13px]" />
                    <button
                      type="button"
                      onClick={() => set("password", tempPassword())}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Generează parolă"
                      title="Generează altă parolă"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </div>
                </Field>
              </div>
              <Field label="Rol">
                <div className="grid gap-1.5">
                  {Object.keys(ROLE_LABELS)
                    .filter((r) => isOwner || r !== "owner")
                    .map((r) => (
                      <label
                        key={r}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                          form.role === r ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
                        )}
                      >
                        <input type="radio" name="role" value={r} checked={form.role === r} onChange={() => set("role", r as AddUserInput["role"])} className="accent-[var(--primary)]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {ROLE_LABELS[r]} <Badge tone={ROLE_TONE[r]}>{r === "owner" ? "tot" : r === "employee" ? "minim" : "parțial"}</Badge>
                          </span>
                          <span className="block text-xs text-muted-foreground">{ROLE_HINTS[r]}</span>
                        </span>
                      </label>
                    ))}
                </div>
              </Field>
              <Field label="Membru în echipă" hint="Necesar pentru pontaj și planificare">
                <div className="space-y-2">
                  <Segmented
                    size="sm"
                    value={form.teamMode}
                    onChange={(v) => set("teamMode", v)}
                    options={[
                      { value: "create", label: "Creează nou" },
                      { value: "link", label: "Asociază existent" },
                      { value: "none", label: "Fără" },
                    ]}
                  />
                  {form.teamMode === "link" && (
                    <NativeSelect value={form.teamMember === "none" || form.teamMember === "create" ? "" : (form.teamMember ?? "")} onChange={(e) => set("teamMember", e.target.value)}>
                      <option value="">{free.length ? "Alege membrul de echipă" : "Toți membrii sunt deja asociați"}</option>
                      {free.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.position ? ` · ${t.position}` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Renunță
              </Button>
              <Button type="submit" loading={pending} disabled={!form.email || (form.teamMode === "link" && (!form.teamMember || form.teamMember === "none" || form.teamMember === "create"))}>
                <UserPlus /> Adaugă
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
