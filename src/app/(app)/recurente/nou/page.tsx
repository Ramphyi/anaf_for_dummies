import { companyDefaults, latestRates, loadEditorData } from "@/components/documents/server";
import { requirePermission } from "@/lib/auth/session";
import { todayIso } from "@/lib/format";
import { RecurringForm } from "../recurring-form";

export const metadata = { title: "Șablon recurent nou" };

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const ctx = await requirePermission("billing");
  const [data, rates] = await Promise.all([loadEditorData(ctx.company.id, "recurring"), latestRates()]);
  const partner = data.partners.find((p) => p.id === client);
  return (
    <RecurringForm
      initial={{
        id: null,
        name: partner ? `Abonament ${partner.name}` : "",
        partnerId: partner?.id ?? null,
        seriesId: null,
        frequency: "monthly",
        intervalCount: 1,
        startDate: todayIso(),
        nextRunDate: todayIso(),
        endDate: null,
        dueDays: partner?.paymentTermDays ?? ctx.company.defaultDueDays,
        currency: partner?.defaultCurrency ?? ctx.company.defaultCurrency,
        notes: null,
        autoIssue: true,
        autoSendEmail: false,
        autoSendEfactura: false,
        active: true,
        lines: [],
      }}
      partners={data.partners}
      products={data.products}
      series={data.series}
      company={companyDefaults(ctx.company)}
      rates={rates}
      history={[]}
    />
  );
}
