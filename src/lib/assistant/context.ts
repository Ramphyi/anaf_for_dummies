import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { can, type AppContext, type Permission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens, assistantSettings, companies, memberships, users } from "@/lib/db/schema";
import type { ToolCtx } from "./tools";

const ALL: Permission[] = ["billing", "anaf", "reports", "settings", "users", "projects.manage", "timesheet.approve", "timesheet.own"];

export function toolCtxFromApp(ctx: AppContext): ToolCtx {
  return {
    companyId: ctx.company.id,
    companyName: ctx.company.name,
    userId: ctx.user.id,
    userName: ctx.user.name,
    role: ctx.role,
    teamMemberId: ctx.teamMemberId,
    permissions: ALL.filter((p) => can(ctx, p)),
  };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function generateApiToken() {
  const token = `afd_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

/** Autentificare pentru serverul MCP: `Authorization: Bearer afd_…` → contextul utilizatorului. */
export async function toolCtxFromToken(token: string): Promise<ToolCtx | null> {
  const row = await db.query.apiTokens.findFirst({ where: and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)) });
  if (!row) return null;
  const [user, membership, company] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, row.userId) }),
    db.query.memberships.findFirst({ where: and(eq(memberships.userId, row.userId), eq(memberships.companyId, row.companyId)) }),
    db.query.companies.findFirst({ where: eq(companies.id, row.companyId) }),
  ]);
  if (!user || !membership || !company) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  return {
    companyId: company.id,
    companyName: company.name,
    userId: user.id,
    userName: user.name,
    role: membership.role,
    teamMemberId: membership.teamMemberId,
    permissions: ALL.filter((p) => can({ role: membership.role }, p)),
  };
}

export async function getAssistantSettings(companyId: string) {
  const s = await db.query.assistantSettings.findFirst({ where: eq(assistantSettings.companyId, companyId) });
  return s ?? { companyId, webSearch: true, effort: "medium" as const, instructions: null, model: null };
}
