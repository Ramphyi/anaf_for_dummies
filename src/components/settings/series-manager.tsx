"use client";

import { AlertTriangle, FileClock, FileOutput, FileText, Hash, Pencil, Plus, Receipt, Star, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { deleteSeriesAction, saveSeriesAction, type SeriesInput } from "@/app/(app)/setari/serii/actions";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";

type SeriesType = "invoice" | "proforma" | "notice" | "receipt";

export type SeriesRow = {
  id: string;
  type: SeriesType;
  prefix: string;
  nextNumber: number;
  padding: number;
  isDefault: boolean;
  active: boolean;
  used: number; // ultimul număr folosit
  count: number; // documente emise
};

const TYPES: { value: SeriesType; label: string; one: string; icon: React.ReactNode }[] = [
  { value: "invoice", label: "Facturi", one: "Următoarea factură", icon: <FileText /> },
  { value: "proforma", label: "Proforme", one: "Următoarea proformă", icon: <FileClock /> },
  { value: "notice", label: "Avize", one: "Următorul aviz", icon: <FileOutput /> },
  { value: "receipt", label: "Chitanțe", one: "Următoarea chitanță", icon: <Receipt /> },
];

const fmt = (prefix: string, n: number, padding: number) => `${prefix}${String(n).padStart(padding, "0")}`;

export function SeriesManager({ series }: { series: SeriesRow[] }) {
  const [tab, setTab] = React.useState<SeriesType>("invoice");
  const [editing, setEditing] = React.useState<SeriesRow | { type: SeriesType } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Numerotarea trebuie să fie continuă</strong> în cadrul fiecărei serii: nu sări peste numere și nu reveni la numere
          deja folosite. Pentru un nou an sau o nouă activitate, creează o serie nouă în loc să o resetezi pe cea existentă.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SeriesType)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.icon} {t.label}
                <span className="text-xs text-muted-foreground">{series.filter((s) => s.type === t.value).length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <Button size="sm" onClick={() => setEditing({ type: tab })}>
            <Plus /> Serie nouă
          </Button>
        </div>
        {TYPES.map((t) => {
          const list = series.filter((s) => s.type === t.value).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.active) - Number(a.active) || a.prefix.localeCompare(b.prefix));
          return (
            <TabsContent key={t.value} value={t.value}>
              {list.length ? (
                <Stagger className="grid gap-4 md:grid-cols-2">
                  {list.map((s) => (
                    <StaggerItem key={s.id}>
                      <SeriesCard s={s} one={t.one} onEdit={() => setEditing(s)} />
                    </StaggerItem>
                  ))}
                </Stagger>
              ) : (
                <Card>
                  <EmptyState
                    compact
                    icon={<Hash />}
                    title={`Nicio serie pentru ${t.label.toLowerCase()}`}
                    description="Prima serie creată devine automat implicită."
                    action={
                      <Button size="sm" onClick={() => setEditing({ type: t.value })}>
                        <Plus /> Adaugă serie
                      </Button>
                    }
                  />
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <SeriesDialog key={editing && "id" in editing ? editing.id : (editing?.type ?? "none")} value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SeriesCard({ s, one, onEdit }: { s: SeriesRow; one: string; onEdit: () => void }) {
  const { run } = useAction();
  return (
    <Card className={cn("group relative overflow-hidden p-5 transition-all hover:shadow-lift", !s.active && "opacity-60")}>
      {s.isDefault && <div className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold tracking-tight">{s.prefix}</span>
            {s.isDefault && (
              <Badge tone="brand">
                <Star className="size-3" /> Implicită
              </Badge>
            )}
            {!s.active && <Badge>Inactivă</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.count ? `${s.count} documente emise · ultimul ${fmt(s.prefix, s.used, s.padding)}` : "Niciun document emis încă"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Editează">
            <Pencil />
          </Button>
          {!s.isDefault && s.count === 0 && (
            <ConfirmDialog
              trigger={
                <Button size="icon-sm" variant="ghost" aria-label="Șterge">
                  <Trash2 />
                </Button>
              }
              title={`Ștergi seria ${s.prefix}?`}
              description="Seria nu are documente emise, deci poate fi ștearsă definitiv."
              confirmLabel="Șterge seria"
              destructive
              onConfirm={() => new Promise<void>((resolve) => run(() => deleteSeriesAction(s.id), { onSuccess: () => resolve(), onError: () => resolve() }))}
            />
          )}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{one}</div>
          <div className="font-mono text-xl font-semibold tracking-tight text-primary">{fmt(s.prefix, s.nextNumber, s.padding)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {s.padding ? `${s.padding} cifre` : "fără zerouri"}
          <br />
          nr. {s.nextNumber.toLocaleString("ro-RO")}
        </div>
      </div>
    </Card>
  );
}

function SeriesDialog({ value, onClose }: { value: SeriesRow | { type: SeriesType } | null; onClose: () => void }) {
  const existing = value && "id" in value ? value : null;
  const [form, setForm] = React.useState<SeriesInput>(() =>
    existing
      ? { id: existing.id, type: existing.type, prefix: existing.prefix, nextNumber: existing.nextNumber, padding: existing.padding, isDefault: existing.isDefault, active: existing.active }
      : { type: value?.type ?? "invoice", prefix: "", nextNumber: 1, padding: 4, isDefault: false, active: true },
  );
  const { run, pending } = useAction();
  const set = <K extends keyof SeriesInput>(k: K, v: SeriesInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const prefix = String(form.prefix ?? "").toUpperCase();
  const next = Math.max(1, Math.floor(Number(form.nextNumber) || 1));
  const padding = Number(form.padding) || 0;
  const used = existing?.used ?? 0;
  const tooLow = existing ? next <= used : false;
  const gap = existing && existing.count > 0 && next > used + 1 ? next - used - 1 : 0;
  const preview = fmt(prefix || "SERIE", next, padding);
  const typeInfo = TYPES.find((t) => t.value === form.type)!;

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveSeriesAction({ ...form, prefix, nextNumber: next, padding }), { onSuccess: onClose });
          }}
        >
          <DialogHeader>
            <DialogTitle>{existing ? `Editează seria ${existing.prefix}` : `Serie nouă de ${typeInfo.label.toLowerCase()}`}</DialogTitle>
            <DialogDescription>Numărul complet al documentului = prefix + număr completat cu zerouri.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {/* previzualizare live */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),color-mix(in_oklab,var(--accent)_8%,transparent))] px-5 py-4 text-center">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{typeInfo.one}</div>
              <div className="mt-1 flex justify-center font-mono text-3xl font-semibold tracking-tight">
                <AnimatePresence mode="popLayout" initial={false}>
                  {preview.split("").map((ch, i) => (
                    <motion.span
                      key={`${i}-${ch}`}
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className={i < (prefix || "SERIE").length ? "text-primary" : "text-foreground"}
                    >
                      {ch}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {!existing && (
                <Field label="Tip document" className="sm:col-span-2">
                  <NativeSelect value={form.type} onChange={(e) => set("type", e.target.value as SeriesType)}>
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field label="Prefix" required hint="Litere și cifre, ex. PXD, FCT2027">
                <Input
                  value={prefix}
                  onChange={(e) => set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                  maxLength={12}
                  className="font-mono uppercase"
                  autoFocus
                />
              </Field>
              <Field
                label="Număr următor"
                required
                error={tooLow ? `Minim ${used + 1} — ${fmt(existing!.prefix, used, existing!.padding)} a fost deja emis` : undefined}
                hint={existing?.count ? `Ultimul emis: ${fmt(existing.prefix, used, existing.padding)}` : undefined}
              >
                <Input type="number" min={1} value={form.nextNumber as number} onChange={(e) => set("nextNumber", Number(e.target.value))} aria-invalid={tooLow} />
              </Field>
              <Field label="Cifre (completare cu zero)">
                <NativeSelect value={String(padding)} onChange={(e) => set("padding", Number(e.target.value))}>
                  {[0, 2, 3, 4, 5, 6, 8].map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? "Fără zerouri (1, 2, 3…)" : `${p} cifre (${"1".padStart(p, "0")})`}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="space-y-3 sm:pt-6">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Switch checked={!!form.isDefault} onCheckedChange={(v) => set("isDefault", v)} disabled={existing?.isDefault} />
                  Serie implicită
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} disabled={!!form.isDefault} />
                  Activă
                </label>
              </div>
            </div>
            {existing?.isDefault && <p className="text-xs text-muted-foreground">Seria implicită rămâne activă; pentru a o schimba, setează altă serie ca implicită.</p>}
            {gap > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Vei sări peste {gap} {gap === 1 ? "număr" : "numere"} ({fmt(prefix, used + 1, padding)}
                {gap > 1 ? ` – ${fmt(prefix, next - 1, padding)}` : ""}). Golurile în numerotare trebuie justificate la control.
              </p>
            )}
            {existing && existing.count > 0 && prefix !== existing.prefix && (
              <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Documentele deja emise își păstrează numărul ({existing.prefix}…); doar documentele noi vor folosi prefixul {prefix || "nou"}.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Renunță
            </Button>
            <Button type="submit" loading={pending} disabled={!prefix || tooLow}>
              {existing ? "Salvează" : "Adaugă seria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
