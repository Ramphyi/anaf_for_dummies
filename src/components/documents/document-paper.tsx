import { COUNTIES, SMALL_ENTERPRISE_MENTION, UNITS, vatExemptionReason } from "@/lib/constants";
import type { Company, Document, DocumentLine } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { formatDate, formatMoney, formatNumber, formatRate, formatUnitPrice } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import { KIND_META } from "./shared";

type PaperCompany = Pick<
  Company,
  | "name"
  | "cui"
  | "regCom"
  | "vatPayer"
  | "address"
  | "city"
  | "county"
  | "country"
  | "iban"
  | "bank"
  | "email"
  | "phone"
  | "website"
  | "shareCapital"
  | "logoDataUrl"
  | "invoiceFooter"
  | "brandColor"
>;

const countyLabel = (code: string | null | undefined) => (code ? (COUNTIES.find((c) => c.code === code)?.name ?? code) : null);
const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** Cum apare regimul TVA în coloana/antetul „Cota TVA” pentru categoriile fără cotă. */
const CATEGORY_SHORT: Record<string, string> = {
  Z: "0%",
  E: "scutit",
  AE: "taxare inversă",
  K: "scutit (livr. intracom.)",
  G: "scutit (export)",
  O: "neimpozabil",
};

// Documentul imită hârtia tipărită: culorile sunt fixe (alb/negru), indiferent de tema aplicației.
const CELL = "border border-neutral-500 px-2 py-1.5 align-top";
const HEAD = "border border-neutral-500 bg-neutral-100 px-2 py-1.5 text-center align-middle font-semibold";

/** Moneda din antetul coloanei („-lei-”), pe rând separat și nedespărțită. */
function Unit({ cur }: { cur: string }) {
  return <span className="block whitespace-nowrap">-{cur}-</span>;
}

function Party({ title, name, rows }: { title: string; name: string; rows: [string, string | null | undefined][] }) {
  return (
    <div className="min-w-0 text-[11.5px] leading-snug">
      <p>
        <span className="font-semibold">{title}: </span>
        <span className="text-[13px] font-bold uppercase">{name}</span>
      </p>
      <dl className="mt-1 space-y-0.5">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="break-words">
              <dt className="inline text-neutral-600">{k}: </dt>
              <dd className="inline">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/**
 * Documentul așa cum arată tipărit (pagina de detaliu și /print), în formatul clasic al facturii românești:
 * furnizor | titlu, serie, număr, date | cumpărător, tabel cu coloane numerotate, totaluri, semnături.
 * Conține elementele obligatorii din art. 319 alin. (20) Cod fiscal și art. 74 din Legea 31/1990.
 */
export function DocumentPaper({
  doc,
  company,
  related,
  className,
}: {
  doc: Document & { lines: DocumentLine[] };
  company: PaperCompany;
  related?: Pick<Document, "fullNumber" | "issueDate"> | null;
  className?: string;
}) {
  const lines = [...doc.lines].sort((a, b) => a.position - b.position);
  const totals = computeTotals(lines);
  const vat = company.vatPayer;
  const isDraft = doc.status === "draft";
  const title = doc.isCreditNote ? "Factură storno" : KIND_META[doc.kind].printTitle;
  const number = isDraft ? "—" : doc.fullNumber.startsWith(doc.series) ? doc.fullNumber.slice(doc.series.length) : String(doc.number);
  const cur = doc.currency === "RON" ? "lei" : doc.currency;
  const foreign = doc.currency !== "RON";
  const inLei = (n: number) => formatMoney(round2(n * doc.exchangeRate), "RON");
  const amount = (n: number) => formatNumber(n, true);

  const buyerForeign = (doc.clientCountry ?? "RO") !== "RO";
  const buyerPf = doc.clientEntityType === "pf";
  const buyerIdLabel = buyerForeign ? (doc.clientVatPayer ? "Cod TVA" : "Cod fiscal") : buyerPf ? "CNP" : "CIF";
  const buyerId = doc.clientCui ? (!buyerForeign && !buyerPf && doc.clientVatPayer ? `RO${doc.clientCui}` : doc.clientCui) : null;

  // O singură cotă → apare în antet, ca pe formularul clasic; mai multe cote/regimuri → coloană separată.
  const regimes = [...new Set(lines.map((l) => (l.vatCategory === "S" ? `${formatNumber(l.vatRate)}%` : CATEGORY_SHORT[l.vatCategory] ?? l.vatCategory)))];
  const rateColumn = vat && regimes.length > 1;
  const showBreakdown = vat && (regimes.length > 1 || foreign);
  // Mențiunile legale ale regimului TVA (art. 319 alin. (20) lit. l)–m)); neplătitorii: art. 310.
  const exemptions = vat
    ? [...new Set(lines.map((l) => l.vatCategory).filter((c) => c !== "S"))].map((c) => vatExemptionReason(c, true)).filter((r): r is string => !!r)
    : [SMALL_ENTERPRISE_MENTION];
  const deliveryDiffers = doc.kind !== "notice" && !!doc.deliveryDate && doc.deliveryDate !== doc.issueDate;
  const showExpedition = doc.kind === "notice" || (doc.kind === "invoice" && !doc.isCreditNote);
  const watermark = isDraft ? "CIORNĂ" : doc.status === "cancelled" ? "ANULAT" : null;

  // Coloane: 0 Nr. crt · 1 Denumire · 2 U.M. · 3 Cant. · 4 Preț unitar · 5 Valoare (3×4) · [Cota TVA] · Valoarea TVA
  const valueCols = vat ? (rateColumn ? 3 : 2) : 1;
  const vatColNo = rateColumn ? 7 : 6;

  const centerRows: [string, string][] = [
    ["Data emiterii", formatDate(doc.issueDate)],
    ...(doc.kind === "notice" ? [["Data expedierii", formatDate(doc.deliveryDate ?? doc.issueDate)] as [string, string]] : []),
    ...(deliveryDiffers ? [["Data livrării", formatDate(doc.deliveryDate)] as [string, string]] : []),
    ...(doc.kind === "invoice" && doc.dueDate ? [["Termen de plată", formatDate(doc.dueDate)] as [string, string]] : []),
    ...(doc.kind === "proforma" && doc.dueDate ? [["Valabilă până la", formatDate(doc.dueDate)] as [string, string]] : []),
    ...(vat && !rateColumn && regimes[0] ? [["Cota TVA", regimes[0]] as [string, string]] : []),
    ...(foreign ? [["Moneda", `${doc.currency} · curs BNR ${formatRate(doc.exchangeRate)} lei`] as [string, string]] : []),
  ];

  return (
    <article
      className={cn("relative overflow-hidden bg-white text-[12px] leading-normal text-neutral-900", className)}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact", colorScheme: "light" }}
    >
      {watermark && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden select-none" aria-hidden>
          <span className="-rotate-[28deg] text-[110px] font-black tracking-widest text-neutral-900/[0.05]">{watermark}</span>
        </div>
      )}

      <div className="relative space-y-5 p-5 sm:p-8 print:px-1 print:py-0">
        {/* Antet: furnizor | document | cumpărător */}
        <header className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-6">
          <Party
            title="Furnizor"
            name={company.name}
            rows={[
              ["Nr. ord. reg. com.", company.regCom],
              ["CIF", `${vat ? "RO" : ""}${company.cui}`],
              ["Sediul", [company.address, company.city, countyLabel(company.county)].filter(Boolean).join(", ")],
              ["Capital social", company.shareCapital],
              ["Cont (IBAN)", company.iban],
              ["Banca", company.bank],
              ["Telefon", company.phone],
              ["Email", company.email],
              ["Regim TVA", vat ? null : "neplătitor de TVA"],
            ]}
          />

          <div className="order-first text-center sm:order-none sm:min-w-[200px]">
            {company.logoDataUrl && <img src={company.logoDataUrl} alt={company.name} className="mx-auto mb-2 max-h-12 max-w-[180px] object-contain" />}
            <p className="text-[20px] leading-tight font-bold tracking-wide uppercase" style={company.brandColor ? { color: company.brandColor } : undefined}>
              {title}
            </p>
            <p className="mt-1 text-[13px]">
              Seria <strong>{isDraft ? "—" : doc.series}</strong> nr. <strong>{number}</strong>
            </p>
            <table className="mx-auto mt-2 text-left text-[11.5px]">
              <tbody>
                {centerRows.map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-2 text-neutral-600">{k}:</td>
                    <td className="font-semibold tabular">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {doc.vatOnCollection && <p className="mt-1.5 text-[12px] font-bold uppercase">TVA la încasare</p>}
            {doc.isCreditNote && related && (
              <p className="mt-1.5 text-[11.5px]">
                Stornează factura <strong>{related.fullNumber}</strong> din {formatDate(related.issueDate)}
              </p>
            )}
            {/* Norme pct. 97 alin. (1): pe prima pagină, numărul total de rânduri al facturii. */}
            <p className="mt-1 text-[10.5px] text-neutral-600">Nr. poziții: {lines.length}</p>
          </div>

          <Party
            title={doc.kind === "notice" ? "Cumpărător / destinatar" : "Cumpărător"}
            name={doc.clientName}
            rows={[
              ["Nr. ord. reg. com.", buyerPf ? null : doc.clientRegCom],
              [buyerIdLabel, buyerId],
              [buyerPf ? "Adresa" : "Sediul", [doc.clientAddress, doc.clientCity, buyerForeign ? doc.clientCountry : countyLabel(doc.clientCounty)].filter(Boolean).join(", ")],
              ["Email", doc.clientEmail],
            ]}
          />
        </header>

        {/* Produse / servicii */}
        <div className="scrollbar-thin overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[640px] border-collapse text-[11.5px] print:min-w-0">
            <thead>
              <tr className="text-[10.5px] leading-tight">
                <th className={cn(HEAD, "w-10")}>Nr. crt.</th>
                <th className={HEAD}>Denumirea produselor sau a serviciilor</th>
                <th className={cn(HEAD, "w-14")}>U.M.</th>
                <th className={cn(HEAD, "w-16")}>Cant.</th>
                <th className={cn(HEAD, "w-24")}>
                  Preț unitar{vat ? " (fără TVA)" : ""} <Unit cur={cur} />
                </th>
                <th className={cn(HEAD, "w-24")}>
                  Valoarea <Unit cur={cur} />
                </th>
                {rateColumn && <th className={cn(HEAD, "w-16")}>Cota TVA</th>}
                {vat && (
                  <th className={cn(HEAD, "w-24")}>
                    Valoarea TVA <Unit cur={cur} />
                  </th>
                )}
              </tr>
              <tr className="text-[10px] text-neutral-600">
                {["0", "1", "2", "3", "4", "5 (3×4)", ...(rateColumn ? ["6"] : []), ...(vat ? [String(vatColNo)] : [])].map((n) => (
                  <th key={n} className="border border-neutral-500 bg-neutral-50 px-1 py-0.5 text-center font-normal">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} className="break-inside-avoid">
                  <td className={cn(CELL, "text-center tabular")}>{i + 1}</td>
                  <td className={CELL}>
                    <p>{l.name}</p>
                    {l.description && <p className="mt-0.5 text-[10.5px] whitespace-pre-line text-neutral-600">{l.description}</p>}
                    {l.discountPercent > 0 && (
                      <p className="mt-0.5 text-[10.5px] text-neutral-600">
                        Reducere {formatNumber(l.discountPercent)}% (−{amount(l.discountAmount)} {cur}) inclusă în valoare
                      </p>
                    )}
                  </td>
                  <td className={cn(CELL, "text-center")}>{unitLabel(l.unit)}</td>
                  <td className={cn(CELL, "text-right tabular")}>{formatNumber(l.quantity)}</td>
                  <td className={cn(CELL, "text-right tabular")}>{formatUnitPrice(l.unitPrice)}</td>
                  <td className={cn(CELL, "text-right tabular")}>{amount(l.netAmount)}</td>
                  {rateColumn && (
                    <td className={cn(CELL, "text-center tabular")}>{l.vatCategory === "S" ? `${formatNumber(l.vatRate)}%` : (CATEGORY_SHORT[l.vatCategory] ?? l.vatCategory)}</td>
                  )}
                  {vat && <td className={cn(CELL, "text-right tabular")}>{amount(l.vatAmount)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="break-inside-avoid">
              {vat ? (
                <>
                  <tr>
                    <td colSpan={5} className={cn(CELL, "text-right font-semibold")}>
                      Total
                    </td>
                    <td className={cn(CELL, "text-right font-semibold tabular")}>{amount(doc.subtotal)}</td>
                    {rateColumn && <td className={CELL} />}
                    <td className={cn(CELL, "text-right font-semibold tabular")}>{amount(doc.vatTotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className={cn(CELL, "text-right font-bold")}>
                      {doc.kind === "notice" ? "Total" : "Total de plată"} (col. 5 + col. {vatColNo})
                    </td>
                    <td colSpan={valueCols} className={cn(CELL, "text-right text-[14px] font-bold tabular")}>
                      {formatMoney(doc.total, doc.currency)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={5} className={cn(CELL, "text-right font-bold")}>
                    {doc.kind === "notice" ? "Total" : "Total de plată"}
                  </td>
                  <td className={cn(CELL, "text-right text-[14px] font-bold tabular")}>{formatMoney(doc.total, doc.currency)}</td>
                </tr>
              )}
              {foreign && (
                <tr>
                  <td colSpan={5 + valueCols} className={cn(CELL, "text-right text-[11px]")}>
                    {/* Art. 319 alin. (20) lit. j) și alin. (23): TVA-ul se exprimă în lei și la facturile în valută. */}
                    {vat && (
                      <>
                        TVA în lei: <strong className="tabular">{inLei(doc.vatTotal)}</strong> ·{" "}
                      </>
                    )}
                    Total echivalent: <strong className="tabular">{inLei(doc.total)}</strong> (curs BNR {formatRate(doc.exchangeRate)} lei/{doc.currency})
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Mențiuni și defalcarea TVA */}
        {(doc.notes || exemptions.length > 0 || showBreakdown || company.invoiceFooter) && (
          <div className="grid gap-4 text-[11.5px] sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1">
              {(doc.notes || exemptions.length > 0 || company.invoiceFooter) && <p className="font-semibold">Mențiuni:</p>}
              {exemptions.map((e) => (
                <p key={e} className="font-semibold">
                  {e}
                </p>
              ))}
              {doc.notes && <p className="whitespace-pre-line">{doc.notes}</p>}
              {company.invoiceFooter && <p className="whitespace-pre-line text-neutral-700">{company.invoiceFooter}</p>}
            </div>
            {showBreakdown && (
              <table className="border-collapse self-start text-[11px]">
                <thead>
                  <tr>
                    <th className={HEAD}>Cota TVA</th>
                    <th className={HEAD}>
                      Baza impozabilă <Unit cur={cur} />
                    </th>
                    <th className={HEAD}>
                      TVA <Unit cur={cur} />
                    </th>
                    {foreign && (
                      <th className={HEAD}>
                        TVA <Unit cur="lei" />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {totals.breakdown.map((b) => (
                    <tr key={`${b.category}-${b.rate}`}>
                      <td className={cn(CELL, "text-center")}>{b.category === "S" ? `${formatNumber(b.rate)}%` : (CATEGORY_SHORT[b.category] ?? b.category)}</td>
                      <td className={cn(CELL, "text-right tabular")}>{amount(b.taxable)}</td>
                      <td className={cn(CELL, "text-right tabular")}>{amount(b.vat)}</td>
                      {foreign && <td className={cn(CELL, "text-right tabular")}>{amount(round2(b.vat * doc.exchangeRate))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Semnături și expediție */}
        <div className={cn("grid break-inside-avoid border border-neutral-500 text-[11px] sm:divide-x sm:divide-neutral-500", showExpedition ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <div className="min-h-24 p-2.5">
            <p className="font-semibold">Semnătura și ștampila furnizorului</p>
            <p className="mt-1 text-neutral-700">Întocmit de: {doc.issuedBy || "………………………"}</p>
            {doc.issuerCnp && <p className="text-neutral-700">CNP: {doc.issuerCnp}</p>}
          </div>
          {showExpedition && (
            <div className="space-y-0.5 border-t border-neutral-500 p-2.5 sm:border-t-0">
              <p className="font-semibold">Date privind expediția</p>
              <p className="text-neutral-700">Numele delegatului: {doc.delegateName || "………………………"}</p>
              <p className="text-neutral-700">B.I./C.I.: {doc.delegateIdCard || "………………………"}</p>
              <p className="text-neutral-700">Mijlocul de transport: {doc.transportMeans || "………………………"}</p>
              <p className="text-neutral-700">Expedierea s-a efectuat în prezența noastră la data de ………… ora ……</p>
              <p className="text-neutral-700">Semnăturile: ………………………</p>
            </div>
          )}
          <div className="min-h-24 border-t border-neutral-500 p-2.5 sm:border-t-0">
            <p className="font-semibold">Semnătura de primire</p>
          </div>
        </div>

        <footer className="space-y-0.5 text-center text-[10px] text-neutral-600">
          {doc.kind === "invoice" && <p>Factura circulă fără semnătură și ștampilă, conform art. 319 alin. (29) din Legea nr. 227/2015 privind Codul fiscal.</p>}
          {doc.kind === "proforma" && <p>Factura proformă nu este document fiscal și nu se înregistrează în contabilitate.</p>}
        </footer>
      </div>
    </article>
  );
}
