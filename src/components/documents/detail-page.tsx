import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  Activity,
  ArrowUpRight,
  Ban,
  Banknote,
  FileCheck2,
  FileMinus2,
  FileOutput,
  FileText,
  FolderKanban,
  Link2,
  Mail,
  NotebookPen,
  Pencil,
  Repeat,
  Send,
  ShieldCheck,
  ShieldX,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Stagger, StaggerItem } from "@/components/motion";
import { EfacturaBadge } from "@/components/anaf/efactura-badge";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page";
import { can, requirePermission } from "@/lib/auth/session";
import { DOC_STATUS } from "@/lib/constants";
import { db } from "@/lib/db";
import { activityLog, documents, etransportDeclarations, recurringInvoices, type DocKind, type Document } from "@/lib/db/schema";
import { getDocument } from "@/lib/documents/server";
import { displayStatus, isEditable, remaining } from "@/lib/documents/status";
import { formatDate, formatMoney, formatRelative, todayIso } from "@/lib/format";
import { isSmtpConfigured } from "@/lib/server/email";
import { cn } from "@/lib/utils";
import { DetailCards } from "./detail-cards";
import { DocumentActions } from "./document-actions";
import { DocumentPaper } from "./document-paper";
import { defaultEmailFor } from "./server";
import { daysBetween, docHref, KIND_META } from "./shared";

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: FileText,
  issued: FileCheck2,
  updated: Pencil,
  cancelled: Ban,
  emailed: Mail,
  efactura_sent: Send,
  efactura_ok: ShieldCheck,
  efactura_nok: ShieldX,
  deleted: Ban,
};

function relationLabel(doc: Document, r: Document) {
  if (r.isCreditNote && r.relatedDocumentId === doc.id) return "Factură storno";
  if (doc.isCreditNote && r.id === doc.relatedDocumentId) return "Factura stornată";
  if (r.kind === "proforma") return "Proforma de origine";
  if (r.kind === "notice") return "Avizul de origine";
  if (r.kind === "invoice" && doc.kind !== "invoice") return "Factura generată";
  return "Document legat";
}

export async function DocumentDetailPage({ kind, id }: { kind: DocKind; id: string }) {
  const ctx = await requirePermission("billing");
  const cid = ctx.company.id;
  const doc = await getDocument(cid, id);
  if (!doc) notFound();
  if (doc.kind !== kind) redirect(docHref(doc.kind, id));

  const paymentIds = doc.payments.map((p) => p.id);
  const [relatedRows, activity, declarations, recurring] = await Promise.all([
    db.query.documents.findMany({
      where: and(
        eq(documents.companyId, cid),
        doc.relatedDocumentId ? or(eq(documents.relatedDocumentId, doc.id), eq(documents.id, doc.relatedDocumentId)) : eq(documents.relatedDocumentId, doc.id),
      ),
    }),
    db.query.activityLog.findMany({
      where: and(
        eq(activityLog.companyId, cid),
        paymentIds.length
          ? or(
              and(eq(activityLog.entity, "document"), eq(activityLog.entityId, doc.id)),
              and(eq(activityLog.entity, "payment"), inArray(activityLog.entityId, paymentIds)),
            )
          : and(eq(activityLog.entity, "document"), eq(activityLog.entityId, doc.id)),
      ),
      orderBy: desc(activityLog.createdAt),
      limit: 30,
    }),
    db.query.etransportDeclarations.findMany({
      where: and(eq(etransportDeclarations.companyId, cid), eq(etransportDeclarations.documentId, doc.id)),
      columns: { id: true, uit: true, status: true, transportDate: true },
    }),
    doc.recurringId
      ? db.query.recurringInvoices.findFirst({
          where: and(eq(recurringInvoices.id, doc.recurringId), eq(recurringInvoices.companyId, cid)),
          columns: { id: true, name: true },
        })
      : Promise.resolve(undefined),
  ]);

  const related = relatedRows.filter((r) => r.id !== doc.id);
  const original = doc.isCreditNote && doc.relatedDocumentId ? related.find((r) => r.id === doc.relatedDocumentId) : null;
  const meta = KIND_META[kind];
  const status = displayStatus(doc);
  const rest = remaining(doc);
  const isDraft = doc.status === "draft";
  const editable = isEditable(doc);
  const canAnaf = can(ctx, "anaf");
  const isInvoice = kind === "invoice";
  const invoiceOption =
    isInvoice && !doc.isCreditNote && ["issued", "partially_paid", "paid"].includes(doc.status)
      ? {
          id: doc.id,
          fullNumber: doc.fullNumber,
          clientName: doc.clientName,
          remaining: rest,
          total: doc.total,
          currency: doc.currency,
          issueDate: doc.issueDate,
          dueDate: doc.dueDate,
        }
      : null;
  const email = { to: doc.clientEmail ?? doc.partner?.email ?? "", ...defaultEmailFor(ctx.company, doc) };
  const eventAt = (action: string) => activity.find((a) => a.action === action)?.createdAt ?? null;

  const dueInfo = (() => {
    if (!isInvoice || !doc.dueDate || doc.isCreditNote) return null;
    if (doc.status === "paid") return { label: "Încasată", tone: "text-success" };
    const d = daysBetween(todayIso(), doc.dueDate);
    if (d < 0) return { label: `Depășită cu ${-d} ${-d === 1 ? "zi" : "zile"}`, tone: "text-danger" };
    if (d === 0) return { label: "Scadentă azi", tone: "text-warning" };
    return { label: `Peste ${d} ${d === 1 ? "zi" : "zile"}`, tone: "text-muted-foreground" };
  })();

  const stats: { label: string; value: string; hint?: string | null; tone?: string }[] = [
    {
      label: "Total",
      value: formatMoney(doc.total, doc.currency),
      hint: doc.currency !== "RON" ? `≈ ${formatMoney(doc.total * doc.exchangeRate, "RON")}` : null,
    },
    ...(isInvoice && !doc.isCreditNote
      ? [
          {
            label: "Încasat",
            value: formatMoney(doc.paidAmount, doc.currency),
            hint: doc.payments.length ? `${doc.payments.length} ${doc.payments.length === 1 ? "plată" : "plăți"}` : "—",
          },
          { label: "Rest de plată", value: formatMoney(rest, doc.currency), tone: rest > 0 && status === "overdue" ? "text-danger" : undefined },
          { label: "Scadență", value: formatDate(doc.dueDate), hint: dueInfo?.label, tone: dueInfo?.tone },
        ]
      : [
          { label: "Data emiterii", value: formatDate(doc.issueDate) },
          kind === "proforma"
            ? {
                label: "Valabilă până la",
                value: formatDate(doc.dueDate),
                ...(doc.status === "issued" && doc.dueDate && doc.dueDate < todayIso() ? { hint: "Ofertă expirată", tone: "text-warning" } : {}),
              }
            : kind === "notice"
              ? { label: "Data expedierii", value: formatDate(doc.deliveryDate ?? doc.issueDate) }
              : { label: "Scadență", value: formatDate(doc.dueDate) },
          {
            label: "Linii",
            value: String(doc.lines.length),
            hint: `${doc.lines.reduce((a, l) => a + Math.abs(l.quantity), 0).toLocaleString("ro-RO")} unități`,
          },
        ]),
  ];

  return (
    <>
      <PageHeader
        title={doc.isCreditNote ? `Storno ${doc.fullNumber}` : `${meta.one} ${doc.fullNumber}`}
        breadcrumbs={[{ label: meta.many, href: meta.path }, { label: doc.fullNumber }]}
        icon={doc.isCreditNote ? <FileMinus2 /> : kind === "notice" ? <Truck /> : kind === "proforma" ? <FileOutput /> : <FileText />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <StatusBadge status={status} map={DOC_STATUS} />
            {isInvoice && !isDraft && <EfacturaBadge status={doc.efacturaStatus} simulated={doc.efacturaEnvironment === "simulation"} />}
            {doc.isCreditNote && <Badge tone="danger">Factură storno</Badge>}
            <span className="text-muted-foreground">·</span>
            {doc.partnerId ? (
              <Link
                href={`/clienti/${doc.partnerId}`}
                className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
              >
                {doc.clientName}
                <ArrowUpRight className="size-3.5 opacity-60" />
              </Link>
            ) : (
              <span className="font-medium text-foreground">{doc.clientName}</span>
            )}
            <span className="text-muted-foreground">· {formatDate(doc.issueDate)}</span>
          </span>
        }
        actions={
          <DocumentActions
            doc={{
              id: doc.id,
              kind,
              status: doc.status,
              efacturaStatus: doc.efacturaStatus,
              efacturaSimulated: doc.efacturaEnvironment === "simulation",
              isCreditNote: doc.isCreditNote,
              fullNumber: doc.fullNumber,
              total: doc.total,
              paidAmount: doc.paidAmount,
              remaining: rest,
              currency: doc.currency,
              editable,
            }}
            lines={doc.lines.map((l) => ({ id: l.id, name: l.name, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice }))}
            canAnaf={canAnaf}
            smtpConfigured={isSmtpConfigured(ctx.company)}
            email={email}
            invoiceOption={invoiceOption}
          />
        }
      />

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StaggerItem key={s.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-soft">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 truncate text-lg font-semibold tracking-tight tabular", s.tone)}>{s.value}</p>
            {s.hint && <p className={cn("truncate text-xs", s.tone ?? "text-muted-foreground")}>{s.hint}</p>}
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border shadow-lift">
            <DocumentPaper doc={doc} company={ctx.company} related={original} />
          </div>
          {doc.internalNotes && (
            <Card>
              <CardHeaderRow title="Notă internă" description="Nu apare pe document" icon={<NotebookPen />} />
              <CardContent>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{doc.internalNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <DetailCards
            showPayments={isInvoice && !doc.isCreditNote && !isDraft && doc.status !== "cancelled"}
            showEfactura={isInvoice}
            payments={{
              total: doc.total,
              paidAmount: doc.paidAmount,
              currency: doc.currency,
              invoiceOption,
              canAdd: !!invoiceOption && rest > 0,
              rows: doc.payments
                .filter((p) => p.direction === "in")
                .map((p) => ({
                  id: p.id,
                  date: p.date,
                  amount: p.amount,
                  method: p.method,
                  reference: p.reference,
                  receiptSeries: p.receiptSeries,
                  receiptNumber: p.receiptNumber,
                })),
            }}
            efactura={{
              docId: doc.id,
              status: doc.efacturaStatus,
              simulated: doc.efacturaEnvironment === "simulation",
              uploadId: doc.efacturaUploadId,
              downloadId: doc.efacturaDownloadId,
              message: doc.efacturaMessage,
              sentAt: doc.efacturaSentAt,
              issuedAt: eventAt("issued") ?? (isDraft ? null : doc.createdAt),
              validatedAt: eventAt("efactura_ok"),
              isDraft,
              cancelled: doc.status === "cancelled",
              canAnaf,
            }}
          />

          {(related.length > 0 || doc.project || recurring || declarations.length > 0) && (
            <Card>
              <CardHeaderRow title="Documente legate" icon={<Link2 />} />
              <CardContent className="space-y-1.5">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={docHref(r.kind, r.id)}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        r.isCreditNote ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-soft-foreground",
                      )}
                    >
                      {r.isCreditNote ? <FileMinus2 className="size-4" /> : <FileText className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">{relationLabel(doc, r)}</span>
                      <span className="block truncate text-sm font-medium">
                        {r.fullNumber} · <span className="tabular">{formatMoney(r.total, r.currency)}</span>
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                ))}
                {doc.project && (
                  <Link
                    href={`/proiecte/${doc.project.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <FolderKanban className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Proiect</span>
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <ColorDot color={doc.project.color} /> {doc.project.name}
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </Link>
                )}
                {recurring && (
                  <Link
                    href={`/recurente/${recurring.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Repeat className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Generată din șablonul recurent</span>
                      <span className="block truncate text-sm font-medium">{recurring.name}</span>
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </Link>
                )}
                {declarations.map((d) => (
                  <Link
                    key={d.id}
                    href={`/etransport/${d.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Truck className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Declarație e-Transport · {formatDate(d.transportDate)}</span>
                      <span className="block truncate text-sm font-medium">{d.uit ? `UIT ${d.uit}` : "Ciornă"}</span>
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeaderRow title="Activitate" icon={<Activity />} description={activity.length ? undefined : "Nicio activitate înregistrată"} />
            {activity.length > 0 && (
              <CardContent>
                <ol className="space-y-3">
                  {activity.map((a) => {
                    const Icon = a.entity === "payment" ? Banknote : (ACTIVITY_ICONS[a.action] ?? Activity);
                    return (
                      <li key={a.id} className="flex gap-3">
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full",
                            a.action === "efactura_nok" || a.action === "cancelled" || a.action === "deleted"
                              ? "bg-danger-soft text-danger"
                              : a.action === "efactura_ok" || a.entity === "payment"
                                ? "bg-success-soft text-success"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] leading-snug">{a.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.userName ?? "Sistem"} · {formatRelative(a.createdAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
