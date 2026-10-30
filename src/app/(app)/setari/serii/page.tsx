import { and, count, eq, isNotNull, max, ne } from "drizzle-orm";
import { SeriesManager, type SeriesRow } from "@/components/settings/series-manager";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documentSeries, documents, payments } from "@/lib/db/schema";

export const metadata = { title: "Serii documente" };

export default async function SeriesPage() {
  const ctx = await requirePermission("settings");
  const companyId = ctx.company.id;
  const [series, docStats, receiptStats] = await Promise.all([
    db.query.documentSeries.findMany({ where: eq(documentSeries.companyId, companyId) }),
    db
      .select({ kind: documents.kind, series: documents.series, n: count(), max: max(documents.number) })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), ne(documents.status, "draft")))
      .groupBy(documents.kind, documents.series),
    db
      .select({ series: payments.receiptSeries, n: count(), max: max(payments.receiptNumber) })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), isNotNull(payments.receiptNumber)))
      .groupBy(payments.receiptSeries),
  ]);

  const rows: SeriesRow[] = series.map((s) => {
    const stat =
      s.type === "receipt" ? receiptStats.find((r) => r.series === s.prefix) : docStats.find((d) => d.kind === s.type && d.series === s.prefix);
    return {
      id: s.id,
      type: s.type,
      prefix: s.prefix,
      nextNumber: s.nextNumber,
      padding: s.padding,
      isDefault: s.isDefault,
      active: s.active,
      used: Number(stat?.max ?? 0),
      count: Number(stat?.n ?? 0),
    };
  });

  return <SeriesManager series={rows} />;
}
