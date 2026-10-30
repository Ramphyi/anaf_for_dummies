"use client";

import { AlarmClock, CheckCircle2, Clock, Hourglass, Mail, MailCheck, TimerReset, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { sendReminderAction } from "@/app/(app)/rapoarte/restante/actions";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatMoney } from "@/lib/format";
import type { AgingKey, AgingReport, OpenInvoiceRow } from "@/lib/reports/receivables";
import { cn, sum } from "@/lib/utils";
import { AGING_COLORS, AgingByClientChart, DistributionBar } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

type ClientRow = AgingReport["clients"][number];
const money = (v: number) => formatMoney(v);
const short = (v: number) => formatMoney(v).replace(/,\d{2}(?=\s)/, "");

const BUCKET_TONE: Record<AgingKey, "info" | "warning" | "danger"> = { current: "info", d30: "warning", d60: "warning", d90: "danger", d90p: "danger" };

function ReminderButton({ row, canSend }: { row: OpenInvoiceRow; canSend: boolean }) {
  const { run, pending } = useAction();
  const [sent, setSent] = React.useState(false);
  if (!canSend) return null;
  if (!row.email) {
    return (
      <Tooltip content="Clientul nu are adresă de email — adaug-o în fișa clientului.">
        <span>
          <Button size="xs" variant="ghost" disabled>
            <Mail /> Reminder
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={sent ? "Trimis" : `Trimite către ${row.email}`}>
      <Button
        size="xs"
        variant={sent ? "soft" : "outline"}
        loading={pending}
        onClick={(e) => {
          e.stopPropagation();
          run(() => sendReminderAction(row.id), { success: (d) => `Reminder trimis către ${d.to}`, onSuccess: () => setSent(true) });
        }}
      >
        {!pending && (sent ? <MailCheck /> : <Mail />)} {sent ? "Trimis" : "Trimite reminder"}
      </Button>
    </Tooltip>
  );
}

function invoiceColumns(canSend: boolean): Column<OpenInvoiceRow>[] {
  const cols: Column<OpenInvoiceRow>[] = [
    {
      key: "number",
      header: "Factura",
      sortValue: (r) => r.fullNumber,
      cell: (r) => (
        <Link href={`/facturi/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.fullNumber}
        </Link>
      ),
    },
    {
      key: "client",
      header: "Client",
      sortValue: (r) => r.clientName,
      cell: (r) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium">{r.clientName}</div>
          <div className="truncate text-xs text-muted-foreground">{r.email ?? "fără email"}</div>
        </div>
      ),
    },
    { key: "issue", header: "Emisă", hideOnMobile: true, sortValue: (r) => r.issueDate, csv: (r) => formatDate(r.issueDate), cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span> },
    { key: "due", header: "Scadența", sortValue: (r) => r.dueDate, csv: (r) => formatDate(r.dueDate), cell: (r) => <span className="tabular">{formatDate(r.dueDate)}</span> },
    {
      key: "days",
      header: "Întârziere",
      align: "right",
      sortValue: (r) => r.daysOverdue,
      cell: (r) => (
        <Badge tone={BUCKET_TONE[r.bucket]} dot>
          {r.daysOverdue} {r.daysOverdue === 1 ? "zi" : "zile"}
        </Badge>
      ),
    },
    {
      key: "remaining",
      header: "Rest de încasat",
      align: "right",
      sortValue: (r) => r.remainingRon,
      cell: (r) => (
        <div>
          <span className="font-semibold">{money(r.remainingRon)}</span>
          {r.currency !== "RON" && <div className="text-xs text-muted-foreground">{formatMoney(r.remaining, r.currency)}</div>}
        </div>
      ),
    },
  ];
  if (canSend) cols.push({ key: "action", header: "", align: "right", className: "print:hidden", headerClassName: "print:hidden", cell: (r) => <ReminderButton row={r} canSend={canSend} /> });
  return cols;
}

function clientColumns(buckets: AgingReport["buckets"]): Column<ClientRow>[] {
  return [
    {
      key: "name",
      header: "Client",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {r.count} {r.count === 1 ? "factură" : "facturi"}
            {r.maxDays > 0 ? ` · max. ${r.maxDays} zile` : ""}
          </div>
        </div>
      ),
    },
    ...buckets.map<Column<ClientRow>>((b) => ({
      key: b.key,
      header: b.short,
      align: "right",
      sortValue: (r) => r.buckets[b.key as AgingKey],
      cell: (r) =>
        r.buckets[b.key as AgingKey] ? (
          <span className={cn(b.key !== "current" && "font-medium", b.key === "d90p" && "text-danger")}>{money(r.buckets[b.key as AgingKey])}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        ),
    })),
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{money(r.total)}</span> },
  ];
}

export function AgingView({ data, canSend }: { data: AgingReport; canSend: boolean }) {
  const k = data.kpis;
  if (!data.invoices.length) {
    return (
      <Card>
        <EmptyState icon={<CheckCircle2 />} title="Nicio creanță deschisă" description="Toate facturile emise sunt încasate. Felicitări!" />
      </Card>
    );
  }
  const overdue = data.invoices.filter((i) => i.bucket !== "current");
  const chartData = data.clients.slice(0, 8).map((c) => ({ name: c.name, ...c.buckets }));

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Total de încasat" value={k.totalOpen} icon={<Hourglass />} hint={`${data.invoices.length} facturi deschise`} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Restant (scadență depășită)" value={k.totalOverdue} icon={<AlarmClock />} tone="danger" hint={`${k.overduePct.toFixed(0)}% din total · ${k.overdueCount} facturi`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Peste 90 de zile" value={k.over90} icon={<Clock />} tone="warning" hint={`întârziere medie ${k.avgDaysOverdue} zile`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="DSO (zile de încasare)" value={k.dso} format="number" icon={<TimerReset />} tone="brand" hint="creanțe / vânzări ultimele 90 zile" />
        </StaggerItem>
      </Stagger>

      <Card className="report-section">
        <CardHeaderRow title="Vechimea creanțelor" description={`Sold de încasat pe intervale de întârziere, la ${formatDate(data.today)}`} icon={<Clock />} />
        <CardContent>
          <DistributionBar
            format={short}
            segments={data.buckets.map((b) => ({ key: b.key, label: b.label, value: b.amount, color: AGING_COLORS[b.key], sub: `${b.count} fact.` }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-5">
        <Card className="report-section 2xl:col-span-2">
          <CardHeaderRow title="Top clienți după sold" description="Defalcat pe vechime" icon={<Users />} />
          <CardContent>
            <AgingByClientChart data={chartData} buckets={data.buckets} />
          </CardContent>
        </Card>
        <div className="2xl:col-span-3">
          <ReportTable
            rows={data.clients}
            columns={clientColumns(data.buckets)}
            getRowId={(r) => r.key}
            search={(r) => r.name}
            searchPlaceholder="Caută client…"
            defaultSort={{ key: "total", dir: "desc" }}
            pageSize={10}
            dense
            printTitle="Creanțe pe client"
            footer={(rows) => (
              <tr>
                <TotalCell align="left">Total</TotalCell>
                {data.buckets.map((b) => (
                  <TotalCell key={b.key}>{money(sum(rows, (r) => r.buckets[b.key as AgingKey]))}</TotalCell>
                ))}
                <TotalCell>{money(sum(rows, (r) => r.total))}</TotalCell>
              </tr>
            )}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Facturi cu scadența depășită</h2>
            <p className="text-sm text-muted-foreground">
              {overdue.length} facturi · {money(k.totalOverdue)}
              {canSend ? " — trimite un reminder politicos direct din listă." : ""}
            </p>
          </div>
        </div>
        <ReportTable
          rows={overdue}
          columns={invoiceColumns(canSend)}
          getRowId={(r) => r.id}
          rowHref={(r) => `/facturi/${r.id}`}
          search={(r) => `${r.fullNumber} ${r.clientName}`}
          searchPlaceholder="Caută factură sau client…"
          filters={[
            {
              key: "bucket",
              label: "Vechime",
              options: data.buckets.filter((b) => b.key !== "current" && b.count).map((b) => ({ value: b.key, label: b.short })),
              predicate: (r, v) => r.bucket === v,
            },
          ]}
          defaultSort={{ key: "days", dir: "desc" }}
          pageSize={15}
          dense
          printTitle="Facturi restante"
          empty={<EmptyState compact icon={<CheckCircle2 />} title="Nicio factură restantă" description="Toate facturile scadente au fost încasate." />}
        />
      </div>
    </div>
  );
}

export function AgingExport({ data }: { data: AgingReport }) {
  const bucketCols = data.buckets.map((b) => ({ key: b.key, label: b.label }));
  const exports: CsvExport[] = [
    {
      label: "Creanțe pe client",
      filename: "restante-clienti",
      columns: [{ key: "name", label: "Client" }, { key: "count", label: "Facturi" }, ...bucketCols, { key: "total", label: "Total RON" }, { key: "maxDays", label: "Întârziere maximă (zile)" }],
      rows: data.clients.map((c) => ({ name: c.name, count: c.count, ...c.buckets, total: c.total, maxDays: c.maxDays })),
    },
    {
      label: "Facturi deschise",
      filename: "restante-facturi",
      columns: [
        { key: "number", label: "Factura" },
        { key: "client", label: "Client" },
        { key: "email", label: "Email" },
        { key: "issue", label: "Data emiterii" },
        { key: "due", label: "Scadența" },
        { key: "days", label: "Zile întârziere" },
        { key: "bucket", label: "Interval" },
        { key: "currency", label: "Valută" },
        { key: "remaining", label: "Rest în valută" },
        { key: "remainingRon", label: "Rest RON" },
      ],
      rows: data.invoices.map((i) => ({
        number: i.fullNumber,
        client: i.clientName,
        email: i.email,
        issue: formatDate(i.issueDate),
        due: formatDate(i.dueDate),
        days: i.daysOverdue,
        bucket: data.buckets.find((b) => b.key === i.bucket)?.label,
        currency: i.currency,
        remaining: i.remaining,
        remainingRon: i.remainingRon,
      })),
    },
  ];
  return <ExportMenu exports={exports} />;
}
