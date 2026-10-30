import { desc, eq } from "drizzle-orm";
import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { etransportDeclarations } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { sum } from "@/lib/utils";
import { EtransportList, type DeclarationRow } from "./etransport-list";

export const metadata = { title: "e-Transport" };

export default async function EtransportPage() {
  const ctx = await requirePermission("anaf");
  const rows = await db.query.etransportDeclarations.findMany({
    where: eq(etransportDeclarations.companyId, ctx.company.id),
    columns: { xml: false },
    orderBy: [desc(etransportDeclarations.transportDate), desc(etransportDeclarations.createdAt)],
  });

  const data: DeclarationRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    operationType: r.operationType,
    uit: r.uit,
    partnerName: r.partnerName,
    vehicleNumber: r.vehicleNumber,
    trailer1: r.trailer1,
    transportDate: r.transportDate,
    startCounty: r.startCounty,
    startCity: r.startCity,
    endCounty: r.endCounty,
    endCity: r.endCity,
    documentNumber: r.documentNumber,
    message: r.message,
    itemsCount: r.items.length,
    valueRon: sum(r.items, (i) => i.valueRon),
    grossWeight: sum(r.items, (i) => i.grossWeight),
  }));

  return (
    <>
      <PageHeader
        title="e-Transport"
        description="Declararea transporturilor de bunuri cu risc fiscal ridicat și obținerea codului UIT de la ANAF."
        icon={<Truck />}
        actions={
          <Button variant="gradient" asChild>
            <Link href="/etransport/nou">
              <Plus /> Declarație nouă
            </Link>
          </Button>
        }
      />
      <EtransportList rows={data} today={todayIso()} />
    </>
  );
}
