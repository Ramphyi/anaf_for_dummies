import type { Tone } from "@/lib/constants";
import type { AnafEnvironment } from "@/lib/db/schema";

/** Date despre conexiune trimise în browser — fără secrete sau token-uri. */
export type ConnInfo = {
  environment: AnafEnvironment;
  envLabel: string;
  state: { connected: boolean; label: string; tone: Tone };
  hasClientId: boolean;
  hasSecret: boolean;
  hasTokens: boolean;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  companyName: string;
  companyCui: string;
};

export type SentRow = {
  id: string;
  fullNumber: string;
  clientName: string;
  clientCui: string | null;
  clientEntityType: "pj" | "pf";
  issueDate: string;
  total: number;
  currency: string;
  isCreditNote: boolean;
  status: string;
  efacturaStatus: string;
  efacturaUploadId: string | null;
  efacturaDownloadId: string | null;
  efacturaMessage: string | null;
  efacturaSentAt: string | null;
  /** Transmisă doar în modul simulare. */
  efacturaSimulated: boolean;
  spvMessageId: string | null;
};

export type SpvRow = {
  id: string;
  anafId: string;
  type: string;
  createdAt: string | null;
  details: string | null;
  requestId: string | null;
  issuerCui: string | null;
  issuerName: string | null;
  read: boolean;
  downloaded: boolean;
  purchaseInvoiceId: string | null;
  documentId: string | null;
  documentNumber: string | null;
  documentMessage: string | null;
  summary: { number: string; total: number; currency: string; issueDate: string } | null;
};

export type LogRow = {
  id: string;
  action: string;
  environment: string;
  success: boolean;
  request: string | null;
  response: string | null;
  truncated: boolean;
  durationMs: number | null;
  createdAt: string;
};
