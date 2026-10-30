import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { parseAnafDate } from "@/components/anaf/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { connectionState, ENV_LABELS, getConnection } from "@/lib/anaf/client";
import { parseUbl } from "@/lib/anaf/ubl-parse";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { anafLogs, documents, partners, spvMessages } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { normalizeCui } from "@/lib/utils";
import { EfacturaView, type EfacturaTab } from "./efactura-view";
import type { ConnInfo, LogRow, SentRow, SpvRow } from "./types";

export const metadata = { title: "e-Factura · SPV" };

const TABS: EfacturaTab[] = ["trimise", "primite", "erori", "jurnal"];
const LOG_PREVIEW = 3000;

export default async function EfacturaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sync?: string; connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requirePermission("anaf");
  const cid = ctx.company.id;
  const conn = await getConnection(cid);
  const state = connectionState(conn);

  const [invoices, messages, logs] = await Promise.all([
    db
      .select({
        id: documents.id,
        fullNumber: documents.fullNumber,
        clientName: documents.clientName,
        clientCui: documents.clientCui,
        clientEntityType: documents.clientEntityType,
        issueDate: documents.issueDate,
        total: documents.total,
        currency: documents.currency,
        isCreditNote: documents.isCreditNote,
        status: documents.status,
        efacturaStatus: documents.efacturaStatus,
        efacturaUploadId: documents.efacturaUploadId,
        efacturaDownloadId: documents.efacturaDownloadId,
        efacturaMessage: documents.efacturaMessage,
        efacturaSentAt: documents.efacturaSentAt,
        efacturaEnvironment: documents.efacturaEnvironment,
      })
      .from(documents)
      .where(and(eq(documents.companyId, cid), eq(documents.kind, "invoice"), ne(documents.status, "draft")))
      .orderBy(desc(documents.issueDate), desc(documents.number)),
    db.query.spvMessages.findMany({
      where: eq(spvMessages.companyId, cid),
      columns: { signatureXml: false },
      orderBy: desc(spvMessages.anafCreatedAt),
    }),
    db.query.anafLogs.findMany({ where: eq(anafLogs.companyId, cid), orderBy: desc(anafLogs.createdAt), limit: 200 }),
  ]);

  // Denumiri furnizori după CUI (nomenclator) + rezumat din XML-urile deja descărcate
  const issuerCuis = [...new Set(messages.map((m) => m.issuerCui).filter((c): c is string => !!c))];
  const known = issuerCuis.length
    ? await db.query.partners.findMany({
        where: and(eq(partners.companyId, cid), inArray(partners.cui, issuerCuis)),
        columns: { cui: true, name: true },
      })
    : [];
  const partnerName = new Map(known.map((p) => [normalizeCui(p.cui), p.name]));
  const docById = new Map(invoices.map((d) => [d.id, d]));
  const sentMsgByDoc = new Map(messages.filter((m) => m.type === "FACTURA TRIMISA" && m.documentId).map((m) => [m.documentId!, m.id]));

  const sentRows: SentRow[] = invoices.map((d) => ({
    ...d,
    efacturaSentAt: d.efacturaSentAt?.toISOString() ?? null,
    efacturaSimulated: d.efacturaEnvironment === "simulation",
    spvMessageId: sentMsgByDoc.get(d.id) ?? null,
  }));

  const spvRows: SpvRow[] = messages
    .filter((m) => m.type !== "FACTURA TRIMISA")
    .map((m) => {
      let summary: SpvRow["summary"] = null;
      let parsedName: string | null = null;
      if (m.xml && m.type === "FACTURA PRIMITA") {
        try {
          const p = parseUbl(m.xml);
          summary = { number: p.number, total: p.payable || p.total, currency: p.currency, issueDate: p.issueDate };
          parsedName = p.supplier.name;
        } catch {
          /* XML nevalid — afișăm doar detaliile */
        }
      }
      const doc = m.documentId ? docById.get(m.documentId) : undefined;
      return {
        id: m.id,
        anafId: m.anafId,
        type: m.type,
        createdAt: parseAnafDate(m.anafCreatedAt)?.toISOString() ?? m.createdAt.toISOString(),
        details: m.details,
        requestId: m.requestId,
        issuerCui: m.issuerCui,
        issuerName: (m.issuerCui && partnerName.get(m.issuerCui)) || parsedName,
        read: m.read,
        downloaded: m.downloaded,
        purchaseInvoiceId: m.purchaseInvoiceId,
        documentId: m.documentId,
        documentNumber: doc?.fullNumber ?? null,
        documentMessage: doc?.efacturaMessage ?? null,
        summary,
      };
    });

  const logRows: LogRow[] = logs.map((l) => {
    const truncated = (l.response?.length ?? 0) > LOG_PREVIEW;
    return {
      id: l.id,
      action: l.action,
      environment: l.environment,
      success: l.success,
      request: l.request,
      response: truncated ? l.response!.slice(0, LOG_PREVIEW) : l.response,
      truncated,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    };
  });

  const connInfo: ConnInfo = {
    environment: conn.environment,
    envLabel: ENV_LABELS[conn.environment],
    state,
    hasClientId: !!conn.clientId,
    hasSecret: !!conn.clientSecret,
    hasTokens: !!conn.accessToken,
    accessTokenExpiresAt: conn.accessTokenExpiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt: conn.refreshTokenExpiresAt?.toISOString() ?? null,
    connectedAt: conn.connectedAt?.toISOString() ?? null,
    lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    companyName: ctx.company.name,
    companyCui: ctx.company.cui,
  };

  const tab: EfacturaTab = sp.sync === "1" ? "primite" : TABS.includes(sp.tab as EfacturaTab) ? (sp.tab as EfacturaTab) : "trimise";

  return (
    <>
      <PageHeader
        title="e-Factura · SPV"
        description="Transmiterea facturilor în Sistemul RO e-Factura, mesajele din Spațiul Privat Virtual și jurnalul comunicării cu ANAF."
        icon={<ShieldCheck />}
        actions={
          <Button variant="outline" asChild>
            <Link href="/instrumente?tab=validare">
              <FileCheck2 /> Validare XML
            </Link>
          </Button>
        }
      />
      <EfacturaView
        conn={connInfo}
        sent={sentRows}
        spv={spvRows}
        logs={logRows}
        initialTab={tab}
        autoSync={sp.sync === "1"}
        flash={{ connected: sp.connected === "1", error: sp.error ?? null }}
        serverNow={Date.now()}
        today={todayIso()}
      />
    </>
  );
}
