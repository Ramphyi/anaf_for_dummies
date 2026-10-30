import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { amountInWords } from "@/components/documents/amount-words";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import { docHref } from "@/components/documents/shared";
import { getContext, requirePermission } from "@/lib/auth/session";
import { COUNTIES } from "@/lib/constants";
import { db } from "@/lib/db";
import { documentSeries, payments } from "@/lib/db/schema";
import { formatDate, formatMoney } from "@/lib/format";

type Props = { params: Promise<{ paymentId: string }>; searchParams: Promise<{ print?: string }> };

const county = (c: string | null | undefined) => (c ? (COUNTIES.find((x) => x.code === c)?.name ?? c) : null);

export async function generateMetadata({ params }: Props) {
  const { paymentId } = await params;
  const ctx = await getContext();
  if (!ctx) return { title: "Chitanță" };
  const p = await db.query.payments.findFirst({
    where: and(eq(payments.id, paymentId), eq(payments.companyId, ctx.company.id)),
    columns: { receiptSeries: true, receiptNumber: true, partnerName: true },
  });
  return { title: { absolute: p?.receiptNumber ? `Chitanta ${p.receiptSeries} ${p.receiptNumber} - ${p.partnerName ?? ""}` : "Chitanță" } };
}

export default async function ReceiptPrintPage({ params, searchParams }: Props) {
  const { paymentId } = await params;
  const { print } = await searchParams;
  const ctx = await requirePermission("billing");
  const company = ctx.company;
  const payment = await db.query.payments.findFirst({
    where: and(eq(payments.id, paymentId), eq(payments.companyId, company.id)),
    with: { document: true, partner: true },
  });
  if (!payment || !payment.receiptNumber) notFound();
  const series = await db.query.documentSeries.findFirst({
    where: and(eq(documentSeries.companyId, company.id), eq(documentSeries.type, "receipt"), eq(documentSeries.prefix, payment.receiptSeries ?? "")),
    columns: { padding: true },
  });
  const number = String(payment.receiptNumber).padStart(series?.padding ?? 4, "0");
  const doc = payment.document;
  const payer = {
    name: doc?.clientName ?? payment.partner?.name ?? payment.partnerName ?? "—",
    cui: doc?.clientCui ?? payment.partner?.cui ?? null,
    regCom: doc?.clientRegCom ?? payment.partner?.regCom ?? null,
    pf: (doc?.clientEntityType ?? payment.partner?.entityType) === "pf",
    address: [doc?.clientAddress ?? payment.partner?.address, doc?.clientCity ?? payment.partner?.city, county(doc?.clientCounty ?? payment.partner?.county)]
      .filter(Boolean)
      .join(", "),
  };
  const accent = company.brandColor || "#6d5dfc";
  const purpose = doc ? `contravaloarea facturii ${doc.fullNumber} din ${formatDate(doc.issueDate)}` : (payment.notes ?? "încasare");

  const Receipt = ({ copy }: { copy: string }) => (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-card p-7 print:rounded-none print:border-0 print:p-2"
      style={{ printColorAdjust: "exact" }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-[12px] leading-relaxed">
          <p className="text-[14px] font-semibold">{company.name}</p>
          <p className="text-muted-foreground">
            CIF {company.vatPayer ? "RO" : ""}
            {company.cui}
            {company.regCom ? ` · Reg. Com. ${company.regCom}` : ""}
          </p>
          <p className="text-muted-foreground">{[company.address, company.city, county(company.county)].filter(Boolean).join(", ")}</p>
          {company.shareCapital && <p className="text-muted-foreground">Capital social: {company.shareCapital}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{copy}</p>
          <p className="text-[24px] leading-tight font-bold tracking-tight uppercase" style={{ color: accent }}>
            Chitanță
          </p>
          <p className="text-[13px]">
            Seria <strong>{payment.receiptSeries}</strong> nr. <strong>{number}</strong>
          </p>
          <p className="text-[13px] text-muted-foreground">Data: {formatDate(payment.date)}</p>
        </div>
      </div>

      <div className="mt-6 space-y-2 text-[13.5px] leading-[1.9]">
        <p>
          Am primit de la <strong className="border-b border-dotted border-muted-foreground/60">{payer.name}</strong>
          {payer.cui && (
            <>
              , {payer.pf ? "CNP" : "CIF"} <strong className="border-b border-dotted border-muted-foreground/60">{payer.cui}</strong>
            </>
          )}
          {!payer.pf && payer.regCom && (
            <>
              , Nr. Reg. Com. <span className="border-b border-dotted border-muted-foreground/60">{payer.regCom}</span>
            </>
          )}
          {payer.address && (
            <>
              , adresa <span className="border-b border-dotted border-muted-foreground/60">{payer.address}</span>
            </>
          )}
          , suma de <strong className="border-b border-dotted border-muted-foreground/60 tabular">{formatMoney(payment.amount, payment.currency)}</strong>,
          adică <em className="border-b border-dotted border-muted-foreground/60">{amountInWords(payment.amount, payment.currency)}</em>, reprezentând{" "}
          <span className="border-b border-dotted border-muted-foreground/60">{purpose}</span>.
        </p>
      </div>

      <div className="mt-8 flex items-end justify-between gap-6 text-[12px]">
        <div className="rounded-lg bg-muted px-4 py-2.5">
          <p className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Total încasat</p>
          <p className="text-[18px] font-bold tabular" style={{ color: accent }}>
            {formatMoney(payment.amount, payment.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">Casier</p>
          <div className="mt-8 h-px w-44 bg-border" />
        </div>
      </div>
    </section>
  );

  return (
    <>
      <main className="mx-auto w-full max-w-[210mm] space-y-0 px-3 py-6 sm:py-10 print:p-0">
        <div className="print-page space-y-0 rounded-2xl border border-border bg-card p-4 shadow-lift sm:p-6">
          <Receipt copy="Original" />
          <div className="relative my-6 flex items-center gap-3 text-[10px] tracking-widest text-muted-foreground uppercase print:my-8">
            <span className="h-px flex-1 border-t border-dashed border-border" />
            ✂ decupați aici
            <span className="h-px flex-1 border-t border-dashed border-border" />
          </div>
          <Receipt copy="Copie" />
        </div>
        <div className="h-20 print:hidden" />
      </main>
      <PrintToolbar backHref={doc ? docHref(doc.kind, doc.id) : "/incasari"} label={`Chitanța ${payment.receiptSeries} ${number}`} autoPrint={print === "1"} />
    </>
  );
}
