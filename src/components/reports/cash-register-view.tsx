"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, BookOpen, PiggyBank } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Card, CardHeaderRow } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateLong, formatNumber } from "@/lib/format";
import type { CashRegister } from "@/lib/reports/cash-register";
import { cn } from "@/lib/utils";
import { ExportMenu, TotalCell } from "./report-kit";

const n = (v: number) => formatNumber(v, true);

export function CashRegisterView({ data, period }: { data: CashRegister; period: { from: string; to: string } }) {
  let counter = 0;
  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Sold inițial" value={data.opening} icon={<PiggyBank />} tone="info" hint={`la ${formatDate(period.from)}`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Încasări în numerar" value={data.totalIn} icon={<ArrowDownLeft />} tone="success" hint={`${data.receipts} chitanțe emise`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Plăți în numerar" value={data.totalOut} icon={<ArrowUpRight />} tone="danger" hint={`${data.entries.filter((e) => e.out).length} plăți`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Sold final" value={data.closing} icon={<Banknote />} tone={data.closing < 0 ? "danger" : "brand"} hint={`la ${formatDate(period.to)}`} />
        </StaggerItem>
      </Stagger>

      {data.negativeDays.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Soldul casei a fost negativ în {data.negativeDays.length === 1 ? "ziua" : "zilele"} {data.negativeDays.map(formatDate).join(", ")}. Un sold de casă negativ nu este
            posibil — verifică dacă lipsesc încasări sau dacă unele plăți au fost înregistrate greșit ca numerar.
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeaderRow
          title="Registru de casă"
          description={`Operațiuni în numerar, în ordine cronologică · ${formatDateLong(period.from)} – ${formatDateLong(period.to)}`}
          icon={<BookOpen />}
        />
        {data.entries.length === 0 ? (
          <EmptyState
            compact
            icon={<Banknote />}
            title="Nicio operațiune în numerar"
            description="Încasările cu metoda „Numerar” (cu chitanță) și plățile în numerar apar aici automat."
          />
        ) : (
          <Table className="text-[13px]">
            <THead>
              <TR className="bg-subtle/50 hover:bg-subtle/50">
                <TH className="w-12 text-right">Nr.</TH>
                <TH>Document</TH>
                <TH>Explicație</TH>
                <TH className="text-right">Încasări</TH>
                <TH className="text-right">Plăți</TH>
                <TH className="text-right">Sold</TH>
              </TR>
            </THead>
            <TBody>
              {data.days.map((day) => (
                <Fragment key={day.date}>
                  <tr className="border-b border-border bg-muted/40 break-inside-avoid">
                    <td colSpan={3} className="px-3 py-2 pl-5 text-xs font-semibold tracking-wide uppercase">
                      {formatDateLong(day.date)}
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-right text-xs text-muted-foreground">
                      Sold precedent
                    </td>
                    <td className="px-3 py-2 pr-5 text-right text-xs font-medium tabular">{n(day.opening)}</td>
                  </tr>
                  {day.entries.map((e) => {
                    counter++;
                    return (
                      <TR key={e.id} className="break-inside-avoid">
                        <TD className="py-2 text-right text-muted-foreground tabular">{counter}</TD>
                        <TD className="py-2 whitespace-nowrap">
                          <div className="font-medium">{e.docNumber}</div>
                          <div className="text-xs text-muted-foreground">{e.docType}</div>
                        </TD>
                        <TD className="min-w-56 py-2">
                          {e.documentId ? (
                            <Link href={`/facturi/${e.documentId}`} className="hover:text-primary hover:underline">
                              {e.explanation}
                            </Link>
                          ) : (
                            e.explanation
                          )}
                        </TD>
                        <TD className="py-2 text-right tabular">{e.in ? <span className="font-medium text-success">{n(e.in)}</span> : ""}</TD>
                        <TD className="py-2 text-right tabular">{e.out ? <span className="font-medium text-danger">{n(e.out)}</span> : ""}</TD>
                        <TD className={cn("py-2 text-right font-medium tabular", e.balance < 0 && "text-danger")}>{n(e.balance)}</TD>
                      </TR>
                    );
                  })}
                  <tr className="border-b border-border break-inside-avoid">
                    <td colSpan={3} className="px-3 py-2 pl-5 text-right text-xs font-semibold text-muted-foreground">
                      Total rulaj zi · sold final
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular">{n(day.totalIn)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular">{n(day.totalOut)}</td>
                    <td className={cn("px-3 py-2 pr-5 text-right text-xs font-semibold tabular", day.closing < 0 && "text-danger")}>{n(day.closing)}</td>
                  </tr>
                </Fragment>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td colSpan={3} className="px-3 py-2.5 pl-5 text-right text-sm">
                  Total perioadă <span className="font-normal text-muted-foreground">· sold inițial {n(data.opening)}</span>
                </td>
                <TotalCell className="text-success">{n(data.totalIn)}</TotalCell>
                <TotalCell className="text-danger">{n(data.totalOut)}</TotalCell>
                <TotalCell className="font-semibold">{n(data.closing)}</TotalCell>
              </tr>
            </TFoot>
          </Table>
        )}
      </Card>

      <div className="hidden grid-cols-2 gap-16 pt-10 text-xs print:grid">
        <div className="border-t border-border pt-2 text-center">Casier</div>
        <div className="border-t border-border pt-2 text-center">Compartiment financiar-contabil</div>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Sumele sunt în RON. Încasările în numerar se înregistrează din pagina facturii (metoda „Numerar”, cu chitanță); plățile în numerar, din Cheltuieli.
      </p>
    </div>
  );
}

export function CashRegisterExport({ data }: { data: CashRegister }) {
  let i = 0;
  return (
    <ExportMenu
      exports={[
        {
          label: "Registru de casă",
          filename: "registru-casa",
          columns: [
            { key: "nr", label: "Nr. crt." },
            { key: "date", label: "Data" },
            { key: "doc", label: "Document" },
            { key: "type", label: "Tip document" },
            { key: "explanation", label: "Explicație" },
            { key: "in", label: "Încasări" },
            { key: "out", label: "Plăți" },
            { key: "balance", label: "Sold" },
          ],
          rows: [
            { nr: "", date: "", doc: "", type: "", explanation: "Sold inițial", in: "", out: "", balance: data.opening },
            ...data.entries.map((e) => ({
              nr: ++i,
              date: formatDate(e.date),
              doc: e.docNumber,
              type: e.docType,
              explanation: e.explanation,
              in: e.in || "",
              out: e.out || "",
              balance: e.balance,
            })),
            { nr: "", date: "", doc: "", type: "", explanation: "Total / sold final", in: data.totalIn, out: data.totalOut, balance: data.closing },
          ],
        },
      ]}
    />
  );
}
