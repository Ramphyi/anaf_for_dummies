import { AlarmClock, Archive, ArrowLeft, Building2, CircleDollarSign, TrendingDown } from "lucide-react";
import Link from "next/link";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { NewPartnerButton } from "@/components/catalog/new-partner-button";
import { PartnersTable } from "@/components/catalog/partner-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getSupplierList } from "./queries";

export const metadata = { title: "Furnizori" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ nou?: string; arhivati?: string }> }) {
  const ctx = await requirePermission("billing");
  const sp = await searchParams;
  const archived = sp.arhivati === "1";
  const { list, spark, dueSoon, archivedCount } = await getSupplierList(ctx.company.id, { archived });

  const total12 = list.reduce((s, r) => s + r.total12, 0);
  const balance = list.reduce((s, r) => s + r.balance, 0);
  const overdue = list.reduce((s, r) => s + r.overdue, 0);
  const withOverdue = list.filter((r) => r.overdue > 0).length;
  const fromSpv = list.filter((r) => r.eInvoiceRegistered).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={archived ? "Furnizori arhivați" : "Furnizori"}
        description={archived ? "Furnizorii arhivați nu mai apar în formularele de cheltuieli." : "Furnizorii, facturile primite și soldurile de plată."}
        icon={<Building2 />}
        breadcrumbs={archived ? [{ label: "Furnizori", href: "/furnizori" }, { label: "Arhivă" }] : undefined}
        actions={
          <>
            {archived ? (
              <Button variant="outline" asChild>
                <Link href="/furnizori">
                  <ArrowLeft /> Furnizori activi
                </Link>
              </Button>
            ) : (
              archivedCount > 0 && (
                <Button variant="ghost" asChild>
                  <Link href="/furnizori?arhivati=1">
                    <Archive /> Arhivați ({archivedCount})
                  </Link>
                </Button>
              )
            )}
            <NewPartnerButton kind="supplier" autoOpen={sp.nou === "1"} />
          </>
        }
      />

      {!archived && (
        <KpiGrid>
          <Kpi label="Furnizori activi" value={list.length} format="number" icon={<Building2 />} deltaLabel={`${fromSpv} înregistrați în RO e-Factura`} />
          <Kpi label="Achiziții în ultimele 12 luni" value={total12} icon={<TrendingDown />} tone="info" spark={spark} deltaLabel="toți furnizorii, în RON" href="/cheltuieli" />
          <Kpi
            label="Sold de plată"
            value={balance}
            icon={<CircleDollarSign />}
            tone={overdue > 0 ? "danger" : "brand"}
            deltaLabel={overdue > 0 ? `${formatMoney(overdue, "RON", { compact: true })} restant la ${withOverdue} furnizori` : "nicio scadență depășită"}
          />
          <Kpi
            label="Scadente în 7 zile"
            value={dueSoon.amount}
            icon={<AlarmClock />}
            tone="warning"
            deltaLabel={dueSoon.count ? `${dueSoon.count} ${dueSoon.count === 1 ? "factură" : "facturi"} de plătit curând` : "nimic de plătit săptămâna aceasta"}
          />
        </KpiGrid>
      )}

      <PartnersTable rows={list} mode="supplier" />
    </div>
  );
}
