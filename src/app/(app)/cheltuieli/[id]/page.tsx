import { and, eq } from "drizzle-orm";
import { ArrowUpRight, Banknote, FileText, Info, PackageCheck, Receipt, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeletePaymentButton, PurchaseActions, ReceiveStockButton, type PurchaseSummary, type ReceiveContext } from "@/components/purchases/purchase-actions";
import { PurchasePaymentDialog } from "@/components/purchases/payment-dialog";
import { AnimatedBar, FadeIn } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/misc";
import { DetailRow, EmptyState, PageHeader } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { products, purchaseInvoices, warehouses } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, UNITS } from "@/lib/constants";
import { formatDate, formatDateTime, formatMoney, formatNumber, todayIso } from "@/lib/format";
import { daysBetween } from "@/lib/purchases/periods";
import { PURCHASE_DISPLAY_STATUS, purchaseDisplayStatus } from "@/lib/purchases/schema";
import { guessProduct } from "@/lib/purchases/match";
import { getPurchase } from "@/lib/purchases/server";
import { round2 } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const p = await db.query.purchaseInvoices.findFirst({
    where: and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, ctx.company.id)),
    columns: { number: true, supplierName: true },
  });
  return { title: p ? `${p.number} · ${p.supplierName}` : "Cheltuială" };
}

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const companyId = ctx.company.id;
  const pi = await getPurchase(companyId, id);
  if (!pi) notFound();
  const today = todayIso();
  const display = purchaseDisplayStatus(pi, today);
  const rest = round2(Math.max(0, pi.total - pi.paidAmount));
  const paidPct = pi.total > 0 ? Math.min(100, (pi.paidAmount / pi.total) * 100) : 0;
  const breakdown = computeTotals(pi.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate }))).breakdown;
  const isOpen = pi.status === "unpaid" || pi.status === "partially_paid";
  const dueIn = pi.dueDate ? daysBetween(today, pi.dueDate) : null;

  // context pentru recepția NIR: doar dacă există produse gestionate și factura nu a fost recepționată
  let receive: ReceiveContext | null = null;
  if (!pi.stockReceived && pi.status !== "cancelled" && pi.lines.length) {
    const [tracked, whs] = await Promise.all([
      db.query.products.findMany({
        where: and(eq(products.companyId, companyId), eq(products.trackStock, true), eq(products.active, true)),
        columns: { id: true, name: true, code: true, unit: true },
        orderBy: (p, { asc }) => [asc(p.name)],
      }),
      db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId), columns: { id: true, name: true, isDefault: true } }),
    ]);
    if (tracked.length && whs.length) {
      receive = {
        lines: pi.lines.map((l) => ({ id: l.id, name: l.name, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, productId: l.productId })),
        products: tracked,
        warehouses: whs,
      };
    }
  }
  const mappable = receive ? receive.lines.filter((l) => guessProduct(l, receive!.products)).length : 0;

  const summary: PurchaseSummary = {
    id: pi.id,
    number: pi.number,
    supplierName: pi.supplierName,
    issueDate: pi.issueDate,
    currency: pi.currency,
    exchangeRate: pi.exchangeRate,
    total: pi.total,
    paidAmount: pi.paidAmount,
    status: pi.status,
    source: pi.source,
    stockReceived: pi.stockReceived,
  };
  const supplierHref = pi.supplierId ? `/furnizori/${pi.supplierId}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Cheltuieli", href: "/cheltuieli" }, { label: pi.number }]}
        title={`Factura ${pi.number}`}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {supplierHref ? (
              <Link href={supplierHref} className="font-medium text-foreground hover:text-primary">
                {pi.supplierName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{pi.supplierName}</span>
            )}
            <span>· {formatDate(pi.issueDate)}</span>
            <StatusBadge status={display} map={PURCHASE_DISPLAY_STATUS} pulse={display === "overdue"} />
            {pi.source === "spv" ? (
              <Badge tone="brand">
                <ShieldCheck className="size-3" /> Din SPV
              </Badge>
            ) : (
              <Badge>Introdusă manual</Badge>
            )}
          </span>
        }
        icon={<Receipt />}
        actions={<PurchaseActions purchase={summary} xml={pi.xml} receive={receive} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {receive && mappable > 0 && (
            <FadeIn>
              <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-soft/50 p-4 sm:flex-row sm:items-center">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <PackageCheck className="size-5" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">Marfă de recepționat în stoc</div>
                  <div className="text-muted-foreground">
                    {mappable} din {receive.lines.length} {receive.lines.length === 1 ? "linie corespunde" : "linii corespund"} unor produse gestionate. Generează NIR-ul cu un click.
                  </div>
                </div>
                <ReceiveStockButton purchase={summary} receive={receive}>
                  <PackageCheck /> Recepționează (NIR)
                </ReceiveStockButton>
              </div>
            </FadeIn>
          )}

          <FadeIn delay={0.05}>
            <Card className="overflow-hidden">
              <CardHeaderRow title="Linii factură" description={`${pi.lines.length} ${pi.lines.length === 1 ? "poziție" : "poziții"} · prețuri fără TVA`} icon={<FileText />} />
              {pi.lines.length === 0 ? (
                <EmptyState compact icon={<FileText />} title="Factura nu are linii" description="Editează factura pentru a adăuga produsele sau serviciile facturate." />
              ) : (
                <Table>
                  <THead>
                    <TR className="bg-subtle/50 hover:bg-subtle/50">
                      <TH className="w-8">#</TH>
                      <TH>Denumire</TH>
                      <TH className="text-right">Cant.</TH>
                      <TH className="hidden text-right sm:table-cell">Preț unitar</TH>
                      <TH className="hidden text-right md:table-cell">TVA</TH>
                      <TH className="text-right">Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pi.lines.map((l, i) => (
                      <TR key={l.id}>
                        <TD className="text-xs text-muted-foreground tabular">{i + 1}</TD>
                        <TD>
                          <div className="font-medium">{l.name}</div>
                          {l.product && (
                            <Link href={`/produse?id=${l.product.id}`} className="text-xs text-primary hover:underline">
                              {l.product.code ? `${l.product.code} · ` : ""}
                              {l.product.name}
                            </Link>
                          )}
                        </TD>
                        <TD className="text-right whitespace-nowrap tabular">
                          {formatNumber(l.quantity)} <span className="text-xs text-muted-foreground">{unitLabel(l.unit)}</span>
                        </TD>
                        <TD className="hidden text-right tabular sm:table-cell">{formatMoney(l.unitPrice, pi.currency)}</TD>
                        <TD className="hidden text-right md:table-cell">
                          <div className="tabular">{formatMoney(l.vatAmount, pi.currency)}</div>
                          <div className="text-xs text-muted-foreground">{l.vatRate}%</div>
                        </TD>
                        <TD className="text-right font-medium tabular">{formatMoney(l.totalAmount, pi.currency)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <div className="flex justify-end border-t border-border bg-subtle/50 px-5 py-4">
                <dl className="w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total fără TVA</dt>
                    <dd className="tabular">{formatMoney(pi.subtotal, pi.currency)}</dd>
                  </div>
                  {breakdown.map((b) => (
                    <div key={`${b.category}-${b.rate}`} className="flex justify-between text-muted-foreground">
                      <dt>TVA {b.rate}%</dt>
                      <dd className="tabular">{formatMoney(b.vat, pi.currency)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular">{formatMoney(pi.total, pi.currency)}</dd>
                  </div>
                  {pi.currency !== "RON" && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <dt>Echivalent (curs {pi.exchangeRate})</dt>
                      <dd className="tabular">{formatMoney(round2(pi.total * pi.exchangeRate))}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </Card>
          </FadeIn>

          <FadeIn delay={0.1}>
            <Card>
              <CardHeaderRow
                title="Plăți"
                description={pi.payments.length ? `${pi.payments.length} ${pi.payments.length === 1 ? "plată înregistrată" : "plăți înregistrate"}` : "Nicio plată încă"}
                icon={<Banknote />}
                actions={
                  isOpen && (
                    <PurchasePaymentDialog
                      purchase={summary}
                      trigger={
                        <Button size="sm" variant="soft">
                          <Banknote /> Adaugă plată
                        </Button>
                      }
                    />
                  )
                }
              />
              <CardContent>
                {pi.payments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    {pi.status === "cancelled" ? "Factura este anulată." : "Înregistrează plata când achiți factura — soldul și statusul se actualizează automat."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {pi.payments.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success-soft-foreground">
                          <Banknote className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {formatDate(p.date)}
                            {p.reference ? ` · ${p.reference}` : ""}
                            {p.notes ? ` · ${p.notes}` : ""}
                          </div>
                        </div>
                        <span className="font-semibold tabular">{formatMoney(p.amount, p.currency)}</span>
                        <DeletePaymentButton paymentId={p.id} label={formatMoney(p.amount, p.currency)} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </div>

        <div className="space-y-6">
          <FadeIn delay={0.05}>
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium text-muted-foreground">{rest > 0 && pi.status !== "cancelled" ? "Rest de plată" : "Sold"}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{formatMoney(pi.status === "cancelled" ? 0 : rest, pi.currency)}</div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular">{paidPct.toFixed(0)}% plătit</span>
                </div>
                <AnimatedBar value={paidPct} color={display === "overdue" ? "var(--danger)" : paidPct >= 100 ? "var(--success)" : "var(--primary)"} className="h-2 w-full overflow-hidden rounded-full bg-muted" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Plătit {formatMoney(pi.paidAmount, pi.currency)}</span>
                  <span>din {formatMoney(pi.total, pi.currency)}</span>
                </div>
                {isOpen && dueIn != null && (
                  <div className={dueIn < 0 ? "rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger-soft-foreground" : "rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"}>
                    {dueIn < 0 ? `Scadența a fost depășită cu ${-dueIn} zile` : dueIn === 0 ? "Scadentă astăzi" : `Scadentă în ${dueIn} zile (${formatDate(pi.dueDate)})`}
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.1}>
            <Card>
              <CardHeaderRow title="Detalii" icon={<Info />} />
              <CardContent className="divide-y divide-border/70">
                <DetailRow label="Furnizor">
                  {supplierHref ? (
                    <Link href={supplierHref} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      {pi.supplierName} <ArrowUpRight className="size-3" />
                    </Link>
                  ) : (
                    pi.supplierName
                  )}
                </DetailRow>
                {pi.supplierCui && (
                  <DetailRow label="CUI">
                    <span className="font-mono text-[13px]">{pi.supplierCui}</span>
                  </DetailRow>
                )}
                <DetailRow label="Data facturii">{formatDate(pi.issueDate)}</DetailRow>
                <DetailRow label="Scadență">{formatDate(pi.dueDate)}</DetailRow>
                <DetailRow label="Monedă">{pi.currency === "RON" ? "RON" : `${pi.currency} · curs ${pi.exchangeRate}`}</DetailRow>
                <DetailRow label="Categorie">{EXPENSE_CATEGORY_LABELS[pi.category] ?? pi.category}</DetailRow>
                <DetailRow label="Proiect">
                  {pi.project ? (
                    <Link href={`/proiecte/${pi.project.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <ColorDot color={pi.project.color} /> {pi.project.name}
                    </Link>
                  ) : (
                    <span className="font-normal text-muted-foreground">—</span>
                  )}
                </DetailRow>
                <DetailRow label="Recepție în stoc">
                  {pi.nirs.length ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {pi.nirs.map((n) => (
                        <Link key={n.id} href={`/stocuri?tab=documente&doc=${n.id}`}>
                          <Badge tone="success">
                            <PackageCheck className="size-3" /> {n.number}
                          </Badge>
                        </Link>
                      ))}
                    </span>
                  ) : pi.stockReceived ? (
                    "Da"
                  ) : (
                    <span className="font-normal text-muted-foreground">Nu</span>
                  )}
                </DetailRow>
                <DetailRow label="Înregistrată">{formatDateTime(pi.createdAt)}</DetailRow>
              </CardContent>
            </Card>
          </FadeIn>

          {pi.notes && (
            <FadeIn delay={0.15}>
              <Card>
                <CardHeaderRow title="Note" />
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{pi.notes}</p>
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </div>
      </div>
    </div>
  );
}
