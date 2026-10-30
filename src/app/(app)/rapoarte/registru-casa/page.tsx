import { Banknote } from "lucide-react";
import { CashRegisterExport, CashRegisterView } from "@/components/reports/cash-register-view";
import { ReportHeader } from "@/components/reports/report-header";
import { requirePermission } from "@/lib/auth/session";
import { getCashRegister } from "@/lib/reports/cash-register";
import { resolvePeriod } from "@/lib/reports/period";

export const metadata = { title: "Registru de casă" };

export default async function CashRegisterPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "this_month");
  const data = await getCashRegister(ctx.company.id, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Registru de casă"
        description="Încasări și plăți în numerar, cu sold zilnic. Tipărește-l pentru arhivă la sfârșitul lunii."
        icon={<Banknote />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        printNote="Registru de casă în lei"
        actions={<CashRegisterExport data={data} />}
      />
      <CashRegisterView data={data} period={period} />
    </div>
  );
}
