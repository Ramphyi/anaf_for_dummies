import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { connectionState, defaultRedirectUri, getConnection } from "@/lib/anaf/client";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { anafConnections } from "@/lib/db/schema";
import { ConnectionForm } from "./connection-form";

export const metadata = { title: "Conexiune ANAF" };

export default async function ConexiunePage() {
  const ctx = await requirePermission("anaf");
  const conn = await getConnection(ctx.company.id);
  // Secret salvat, dar care nu mai poate fi decriptat (ex. AUTH_SECRET schimbat) → trebuie reintrodus
  const raw = await db.query.anafConnections.findFirst({
    where: eq(anafConnections.companyId, ctx.company.id),
    columns: { clientSecret: true },
  });
  const state = connectionState(conn);

  return (
    <>
      <PageHeader
        title="Conexiune ANAF"
        description="Configurează accesul OAuth2 la e-Factura și e-Transport cu certificatul digital calificat."
        icon={<KeyRound />}
        breadcrumbs={[{ label: "e-Factura · SPV", href: "/efactura" }, { label: "Conexiune ANAF" }]}
      />
      <ConnectionForm
        initial={{
          environment: conn.environment,
          clientId: conn.clientId ?? "",
          redirectUri: conn.redirectUri ?? "",
          autoSync: conn.autoSync,
        }}
        status={{
          hasSecret: !!conn.clientSecret,
          secretUnreadable: !!raw?.clientSecret && !conn.clientSecret,
          hasTokens: !!conn.accessToken,
          stateLabel: state.label,
          stateTone: state.tone,
          connectedAt: conn.connectedAt?.toISOString() ?? null,
          accessTokenExpiresAt: conn.accessTokenExpiresAt?.toISOString() ?? null,
        }}
        defaultRedirect={defaultRedirectUri()}
        companyCui={ctx.company.cui}
      />
    </>
  );
}
