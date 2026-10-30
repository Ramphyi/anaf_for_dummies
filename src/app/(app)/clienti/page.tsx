import { AlertTriangle, Archive, ArrowLeft, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { NewPartnerButton } from "@/components/catalog/new-partner-button";
import { PartnersTable } from "@/components/catalog/partner-table";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getClientList } from "./queries";

export const metadata = { title: "Clienți" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ nou?: string; arhivati?: string }> }) {
  const ctx = await requirePermission("billing");
  const sp = await searchParams;
  const archived = sp.arhivati === "1";
  const { list, spark, archivedCount } = await getClientList(ctx.company.id, { archived });

  const billed12 = list.reduce((s, r) => s + r.total12, 0);
  const balance = list.reduce((s, r) => s + r.balance, 0);
  const overdue = list.reduce((s, r) => s + r.overdue, 0);
  const withOverdue = list.filter((r) => r.overdue > 0).length;
  const billedRecently = list.filter((r) => r.total12 > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={archived ? "Clienți arhivați" : "Clienți"}
        description={archived ? "Clienții arhivați nu mai apar în formularele de facturare." : "Portofoliul de clienți, soldurile și istoricul de facturare."}
        icon={<Users />}
        breadcrumbs={archived ? [{ label: "Clienți", href: "/clienti" }, { label: "Arhivă" }] : undefined}
        actions={
          <>
            {archived ? (
              <Button variant="outline" asChild>
                <Link href="/clienti">
                  <ArrowLeft /> Clienți activi
                </Link>
              </Button>
            ) : (
              archivedCount > 0 && (
                <Button variant="ghost" asChild>
                  <Link href="/clienti?arhivati=1">
                    <Archive /> Arhivați ({archivedCount})
                  </Link>
                </Button>
              )
            )}
            <NewPartnerButton kind="client" autoOpen={sp.nou === "1"} />
          </>
        }
      />

      {!archived && (
        <KpiGrid>
          <Kpi label="Clienți activi" value={list.length} format="number" icon={<Users />} deltaLabel={`${billedRecently} facturați în ultimele 12 luni`} />
          <Kpi label="Facturat în ultimele 12 luni" value={billed12} icon={<TrendingUp />} tone="success" spark={spark} deltaLabel="toți clienții, în RON" />
          <Kpi
            label="Sold de încasat"
            value={balance}
            icon={<Wallet />}
            tone="info"
            deltaLabel={overdue > 0 ? `din care ${formatMoney(overdue, "RON", { compact: true })} restant` : "nicio restanță"}
            href="/incasari"
          />
          <Kpi
            label="Clienți cu restanțe"
            value={withOverdue}
            format="number"
            icon={<AlertTriangle />}
            tone={withOverdue > 0 ? "danger" : "success"}
            deltaLabel={withOverdue > 0 ? "facturi cu scadența depășită" : "toată lumea plătește la timp"}
          />
        </KpiGrid>
      )}

      <PartnersTable rows={list} mode="client" />
    </div>
  );
}
