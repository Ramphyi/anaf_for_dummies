import { format, subMonths } from "date-fns";
import { ro } from "date-fns/locale";
import { and, desc, eq } from "drizzle-orm";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock,
  FileClock,
  FileOutput,
  FileStack,
  FileText,
  Hourglass,
  Percent,
  Plus,
  Repeat,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, type DocKind } from "@/lib/db/schema";
import { displayStatus, remaining } from "@/lib/documents/status";
import { todayIso } from "@/lib/format";
import { DocumentsTable, type DocRow } from "./documents-table";
import { KIND_META } from "./shared";

const DESCRIPTIONS: Record<DocKind, string> = {
  invoice: "Facturi emise, încasări și starea e-Factura într-un singur loc.",
  proforma: "Oferte și proforme trimise clienților, gata de transformat în factură.",
  notice: "Avize de însoțire a mărfii, cu descărcare automată din gestiune.",
};

const ICONS: Record<DocKind, React.ReactNode> = { invoice: <FileText />, proforma: <FileClock />, notice: <Truck /> };

const pctDelta = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const deltaProps = (cur: number, prev: number) => {
  const delta = pctDelta(cur, prev);
  return delta === null ? {} : { delta, deltaLabel: "vs. luna trecută" };
};

/** Lista + KPI-uri pentru facturi / proforme / avize. */
export async function DocumentListPage({ kind, status }: { kind: DocKind; status?: string | null }) {
  const ctx = await requirePermission("billing");
  const meta = KIND_META[kind];
  const docs = await db.query.documents.findMany({
    where: and(eq(documents.companyId, ctx.company.id), eq(documents.kind, kind)),
    orderBy: [desc(documents.issueDate), desc(documents.number)],
    with: { project: { columns: { name: true, color: true } } },
  });

  const rows: DocRow[] = docs.map((d) => ({
    id: d.id,
    fullNumber: d.fullNumber,
    isCreditNote: d.isCreditNote,
    clientName: d.clientName,
    clientCui: d.clientCui,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    total: d.total,
    currency: d.currency,
    exchangeRate: d.exchangeRate,
    paidAmount: d.paidAmount,
    remaining: remaining(d),
    status: displayStatus(d),
    efacturaStatus: d.efacturaStatus,
    efacturaSimulated: d.efacturaEnvironment === "simulation",
    projectName: d.project?.name ?? null,
    projectColor: d.project?.color ?? null,
  }));

  const now = new Date();
  const month = todayIso().slice(0, 7);
  const prevMonth = format(subMonths(now, 1), "yyyy-MM");
  const live = rows.filter((r) => !["draft", "cancelled"].includes(r.status));
  const ron = (r: DocRow, v = r.total) => v * r.exchangeRate;
  const sumBy = (list: DocRow[], pick: (r: DocRow) => number) => list.reduce((a, r) => a + pick(r), 0);
  const ofMonth = (m: string) => live.filter((r) => r.issueDate.startsWith(m));
  const thisMonth = ofMonth(month);
  const lastMonth = ofMonth(prevMonth);
  const spark = Array.from({ length: 6 }, (_, i) => sumBy(ofMonth(format(subMonths(now, 5 - i), "yyyy-MM")), (r) => ron(r)));
  const monthName = format(now, "LLLL", { locale: ro });

  let kpis: React.ReactNode;
  if (kind === "invoice") {
    const open = live.filter((r) => !r.isCreditNote && ["issued", "partially_paid", "overdue"].includes(r.status) && r.remaining > 0);
    const overdue = open.filter((r) => r.status === "overdue");
    const billed = sumBy(thisMonth, (r) => ron(r));
    const countNow = thisMonth.filter((r) => !r.isCreditNote).length;
    const countPrev = lastMonth.filter((r) => !r.isCreditNote).length;
    kpis = (
      <>
        <StaggerItem>
          <StatCard
            label={`Facturat în ${monthName}`}
            value={billed}
            icon={<Wallet />}
            spark={spark}
            {...deltaProps(
              billed,
              sumBy(lastMonth, (r) => ron(r)),
            )}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="De încasat"
            value={sumBy(open, (r) => ron(r, r.remaining))}
            icon={<Hourglass />}
            tone="info"
            hint={`${open.length} ${open.length === 1 ? "factură deschisă" : "facturi deschise"}`}
            href="/incasari?nou=1"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Scadențe depășite"
            value={sumBy(overdue, (r) => ron(r, r.remaining))}
            icon={<AlertTriangle />}
            tone="danger"
            hint={overdue.length ? `${overdue.length} ${overdue.length === 1 ? "factură" : "facturi"} restante` : "Nicio restanță"}
            href="/facturi?status=overdue"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={`Facturi emise în ${monthName}`}
            value={countNow}
            format="number"
            icon={<FileStack />}
            tone="success"
            {...deltaProps(countNow, countPrev)}
          />
        </StaggerItem>
      </>
    );
  } else if (kind === "proforma") {
    const pending = live.filter((r) => r.status === "issued");
    const converted = live.filter((r) => r.status === "converted");
    const rate = pending.length + converted.length ? (converted.length / (pending.length + converted.length)) * 100 : 0;
    kpis = (
      <>
        <StaggerItem>
          <StatCard
            label={`Valoare proforme ${monthName}`}
            value={sumBy(thisMonth, (r) => ron(r))}
            icon={<Wallet />}
            spark={spark}
            {...deltaProps(
              sumBy(thisMonth, (r) => ron(r)),
              sumBy(lastMonth, (r) => ron(r)),
            )}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="În așteptare"
            value={sumBy(pending, (r) => ron(r))}
            icon={<Clock />}
            tone="warning"
            hint={`${pending.length} netransformate în factură`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Rată de conversie" value={rate} format="percent" icon={<Percent />} tone="success" hint={`${converted.length} facturate`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label={`Proforme emise în ${monthName}`} value={thisMonth.length} format="number" icon={<CalendarRange />} tone="info" />
        </StaggerItem>
      </>
    );
  } else {
    const pending = live.filter((r) => r.status === "issued");
    const converted = live.filter((r) => r.status === "converted");
    kpis = (
      <>
        <StaggerItem>
          <StatCard
            label={`Avize emise în ${monthName}`}
            value={thisMonth.length}
            format="number"
            icon={<Truck />}
            {...deltaProps(thisMonth.length, lastMonth.length)}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Nefacturate" value={pending.length} format="number" icon={<Clock />} tone="warning" hint="Avize emise, fără factură" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Valoare nefacturată" value={sumBy(pending, (r) => ron(r))} icon={<Wallet />} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Facturate" value={converted.length} format="number" icon={<CheckCircle2 />} tone="success" hint="Transformate în facturi" />
        </StaggerItem>
      </>
    );
  }

  const validStatus = status && ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "storned", "converted"].includes(status) ? status : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={meta.many}
        description={DESCRIPTIONS[kind]}
        icon={ICONS[kind]}
        actions={
          <>
            {kind === "invoice" && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/recurente">
                    <Repeat /> Recurente
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/incasari?nou=1">
                    <Wallet /> Încasare
                  </Link>
                </Button>
              </>
            )}
            {kind === "notice" && (
              <Button variant="outline" asChild>
                <Link href="/etransport">
                  <FileOutput /> e-Transport
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={`${meta.path}/nou`}>
                <Plus /> {meta.newLabel}
              </Link>
            </Button>
          </>
        }
      />
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis}</Stagger>
      <DocumentsTable kind={kind} rows={rows} initialStatus={validStatus} />
    </div>
  );
}
