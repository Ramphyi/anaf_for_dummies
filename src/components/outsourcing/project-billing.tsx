"use client";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Hourglass, Layers, ReceiptText, Rows3, User, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { DOC_STATUS } from "@/lib/constants";
import { formatDate, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { buildInvoiceLines, defaultServiceVat, INVOICE_GROUPING_LABELS, type InvoiceGrouping } from "@/lib/outsourcing/invoice";
import { cn } from "@/lib/utils";
import { createProjectInvoiceAction } from "@/app/(app)/proiecte/actions";
import type { ProjectDetailData } from "./project-detail";

type Preset = "last" | "current" | "all" | "custom";
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function ProjectBilling({ data, today }: { data: ProjectDetailData; today: string }) {
  const { project: p, client } = data;
  const router = useRouter();
  const { run, pending } = useAction();
  const billable = React.useMemo(
    () => data.entries.filter((e) => e.status === "approved" && e.billable && !e.invoicedDocumentId),
    [data.entries],
  );
  const oldest = billable.reduce((a, e) => (e.date < a ? e.date : a), today);

  const ranges = React.useMemo(() => {
    const now = new Date(`${today}T12:00:00`);
    const last = subMonths(now, 1);
    return {
      last: { from: iso(startOfMonth(last)), to: iso(endOfMonth(last)) },
      current: { from: iso(startOfMonth(now)), to: today },
      all: { from: oldest, to: today },
    };
  }, [today, oldest]);

  const [preset, setPreset] = React.useState<Preset>(p.billingType === "retainer" ? "last" : "all");
  const [custom, setCustom] = React.useState(ranges.last);
  const period = preset === "custom" ? custom : ranges[preset];
  const [grouping, setGrouping] = React.useState<InvoiceGrouping>("member");

  const inPeriod = billable.filter((e) => e.date >= period.from && e.date <= period.to);
  const preview = buildInvoiceLines(
    p,
    inPeriod.map((e) => ({ ...e })),
    grouping,
    period,
  );
  const vat = defaultServiceVat(true, client?.country);
  const pendingHours = data.entries.filter((e) => e.status === "submitted").reduce((a, e) => a + e.hours, 0);
  const invoicedHours = data.entries.filter((e) => e.invoicedDocumentId).reduce((a, e) => a + e.hours, 0);
  const billableTotal = billable.reduce((a, e) => a + e.hours, 0);
  const missingRate = inPeriod.some((e) => !e.rate);

  if (p.billingType === "non_billable")
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50">
        <EmptyState icon={<ReceiptText />} title="Proiect intern" description="Proiectele nefacturabile nu generează facturi. Schimbă modelul de facturare din editarea proiectului dacă e cazul." />
      </div>
    );

  const create = () =>
    run(() => createProjectInvoiceAction({ projectId: p.id, from: period.from, to: period.to, grouping }), {
      onSuccess: ({ id }) => router.push(`/facturi/${id}/editare`),
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat icon={<CheckCircle2 />} tone="success" label="Aprobate, nefacturate" value={formatHours(billableTotal)} />
        <MiniStat icon={<Hourglass />} tone="warning" label="În așteptarea aprobării" value={formatHours(pendingHours)} />
        <MiniStat icon={<FileText />} tone="brand" label="Deja facturate" value={formatHours(invoicedHours)} />
      </div>

      <Card>
        <CardHeaderRow
          icon={<Wand2 />}
          title="Facturează orele aprobate"
          description={
            p.billingType === "retainer"
              ? "Proiect retainer: o linie cu valoarea lunară pentru fiecare lună din perioadă."
              : "Alege perioada și modul de grupare, verifică liniile, apoi creează o factură ciornă."
          }
        />
        <CardContent className="space-y-5">
          {!client && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Proiectul nu are un client asociat. Setează clientul din „Editează” pentru a putea factura.
            </div>
          )}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="space-y-1.5">
              <span className="text-[13px] font-medium">Perioadă</span>
              <div className="scrollbar-thin overflow-x-auto">
                <Segmented<Preset>
                  value={preset}
                  onChange={setPreset}
                  options={[
                    { value: "last", label: "Luna trecută" },
                    { value: "current", label: "Luna aceasta" },
                    { value: "all", label: "Tot nefacturat" },
                    { value: "custom", label: "Personalizat" },
                  ]}
                />
              </div>
            </div>
            <AnimatePresence initial={false}>
              {preset === "custom" && (
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="flex gap-2">
                  <Field label="De la" className="w-40">
                    <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                  </Field>
                  <Field label="Până la" className="w-40">
                    <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
            {p.billingType !== "retainer" && (
              <div className="space-y-1.5 lg:ml-auto">
                <span className="text-[13px] font-medium">Grupare linii</span>
                <div className="scrollbar-thin overflow-x-auto">
                  <Segmented<InvoiceGrouping>
                    value={grouping}
                    onChange={setGrouping}
                    options={[
                      { value: "member", label: INVOICE_GROUPING_LABELS.member, icon: <User /> },
                      { value: "task", label: INVOICE_GROUPING_LABELS.task, icon: <Layers /> },
                      { value: "single", label: INVOICE_GROUPING_LABELS.single, icon: <Rows3 /> },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-2.5 text-xs text-muted-foreground">
              <span>
                {formatDate(period.from)} – {formatDate(period.to)} · <span className="font-medium text-foreground">{inPeriod.length}</span> intrări ·{" "}
                <span className="font-medium text-foreground">{formatHours(preview.hours)}</span>
              </span>
              <span>Monedă: {p.currency}</span>
            </div>
            {preview.lines.length ? (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11.5px] tracking-wide text-muted-foreground uppercase">
                      <th className="h-9 px-4 text-left font-semibold">Denumire</th>
                      <th className="h-9 px-3 text-right font-semibold">Cant.</th>
                      <th className="hidden h-9 px-3 text-left font-semibold sm:table-cell">UM</th>
                      <th className="h-9 px-3 text-right font-semibold">Preț unitar</th>
                      <th className="h-9 px-4 text-right font-semibold">Valoare</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {preview.lines.map((l, i) => (
                        <motion.tr
                          key={`${grouping}-${l.key}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                          exit={{ opacity: 0 }}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{l.name}</div>
                            <div className="text-xs text-muted-foreground">{l.description}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular">{formatNumber(l.quantity)}</td>
                          <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{l.unit === "ora" ? "oră" : "lună"}</td>
                          <td className="px-3 py-2.5 text-right tabular">{formatMoney(l.unitPrice, p.currency)}</td>
                          <td className="px-4 py-2.5 text-right font-medium tabular">{formatMoney(l.amount, p.currency)}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                  <tfoot className="border-t border-border bg-subtle/60">
                    <tr>
                      <td className="px-4 py-2.5 text-muted-foreground" colSpan={2}>
                        {vat.vatCategory === "S" ? `+ TVA ${vat.vatRate}% la emitere` : vat.vatCategory === "AE" ? "Taxare inversă (client UE)" : "Fără TVA"}
                      </td>
                      <td className="hidden sm:table-cell" />
                      <td className="px-3 py-2.5 text-right text-muted-foreground">Subtotal</td>
                      <td className="px-4 py-2.5 text-right text-base font-semibold tabular">{formatMoney(preview.total, p.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyState
                compact
                icon={<ReceiptText />}
                title="Nimic de facturat în perioada aleasă"
                description={billable.length ? "Alege „Tot nefacturat” sau altă perioadă." : "Orele trebuie aprobate înainte de facturare (Pontaj → Aprobări)."}
              />
            )}
          </div>

          {missingRate && (
            <p className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="size-3.5" /> Unii membri nu au tarif — setează tariful membrului sau al proiectului.
            </p>
          )}

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Se creează o <strong className="text-foreground">factură ciornă</strong> pe care o poți edita înainte de emitere. Orele incluse sunt marcate ca facturate.
            </p>
            <Button variant="gradient" onClick={create} loading={pending} disabled={!client || !preview.lines.length}>
              <FileText /> Creează factura ciornă <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow icon={<FileText />} title="Facturi pentru acest proiect" description={`${data.documents.length} documente`} />
        {data.documents.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {data.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/facturi/${d.id}`} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{d.fullNumber}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(d.issueDate)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={d.status} map={DOC_STATUS} />
                    <span className="w-28 text-right font-semibold tabular">{formatMoney(d.total, d.currency)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <CardContent>
            <EmptyState compact icon={<FileText />} title="Nicio factură încă" description="Facturile generate din pontaj apar aici." />
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "warning" | "brand" }) {
  const t = { success: "bg-success-soft text-success-soft-foreground", warning: "bg-warning-soft text-warning-soft-foreground", brand: "bg-primary-soft text-primary-soft-foreground" }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className={cn("grid size-10 place-items-center rounded-xl [&_svg]:size-5", t)}>{icon}</div>
      <div>
        <div className="text-lg font-semibold tabular">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
