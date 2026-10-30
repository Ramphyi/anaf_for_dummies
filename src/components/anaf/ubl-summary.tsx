"use client";

import { ArrowRight, Building2, CalendarDays, Landmark } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { countyName } from "@/lib/constants";
import type { ParsedParty, ParsedUbl } from "@/lib/anaf/ubl-parse";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Party({ title, party }: { title: string; party: ParsedParty }) {
  const place = [party.address, party.city, party.county ? countyName(party.county) : null, party.country !== "RO" ? party.country : null]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <p className="mt-1.5 flex items-start gap-2 font-semibold">
        <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0 break-words">{party.name}</span>
      </p>
      <div className="mt-2 space-y-0.5 text-[13px] text-muted-foreground">
        {(party.vatId || party.cui) && (
          <p>
            CUI: <span className="font-mono text-foreground">{party.vatId ?? party.cui}</span>
          </p>
        )}
        {party.regCom && <p>Reg. Com.: {party.regCom}</p>}
        {place && <p className="break-words">{place}</p>}
        {party.email && <p className="truncate">{party.email}</p>}
      </div>
    </div>
  );
}

/** Rezumatul unei facturi UBL parsate: părți, linii, totaluri. */
export function UblSummary({ data, className }: { data: ParsedUbl; className?: string }) {
  const c = data.currency;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Badge tone={data.kind === "credit_note" ? "danger" : "brand"}>{data.kind === "credit_note" ? "Notă de credit" : "Factură"}</Badge>
          <span className="text-lg font-semibold tracking-tight">{data.number || "—"}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatDate(data.issueDate)}
          {data.dueDate && (
            <>
              <ArrowRight className="size-3.5" /> scadență {formatDate(data.dueDate)}
            </>
          )}
        </span>
        {c !== "RON" && <Badge tone="info">{c}</Badge>}
      </div>

      <Stagger className="grid gap-3 sm:grid-cols-2">
        <StaggerItem>
          <Party title="Furnizor" party={data.supplier} />
        </StaggerItem>
        <StaggerItem>
          <Party title="Cumpărător" party={data.customer} />
        </StaggerItem>
      </Stagger>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-2 text-left">Denumire</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">Preț unitar</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">TVA</th>
                <th className="px-4 py-2 text-right">Valoare</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{l.name}</p>
                    {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                    {formatNumber(l.quantity)} <span className="text-muted-foreground">{l.unit}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right whitespace-nowrap tabular sm:table-cell">{formatMoney(l.unitPrice, c)}</td>
                  <td className="hidden px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground tabular sm:table-cell">
                    {l.vatCategory === "S" ? `${formatNumber(l.vatRate)}%` : l.vatCategory}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap tabular">{formatMoney(l.netAmount, c)}</td>
                </tr>
              ))}
              {!data.lines.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Factura nu conține linii.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-1 border-t border-border bg-subtle/60 px-4 py-3 text-sm sm:ml-auto sm:max-w-xs">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Total fără TVA</span>
            <span className="tabular">{formatMoney(data.subtotal, c)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">TVA</span>
            <span className="tabular">{formatMoney(data.vatTotal, c)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1.5 text-base font-semibold">
            <span>De plată</span>
            <span className="tabular">{formatMoney(data.payable || data.total, c)}</span>
          </div>
        </div>
      </div>

      {(data.iban || data.notes.length > 0) && (
        <div className="space-y-1.5 text-[13px] text-muted-foreground">
          {data.iban && (
            <p className="flex items-center gap-2">
              <Landmark className="size-4" /> IBAN: <span className="font-mono text-foreground">{data.iban}</span>
            </p>
          )}
          {data.notes.map((n, i) => (
            <p key={i} className="rounded-lg bg-muted/60 px-3 py-2">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
