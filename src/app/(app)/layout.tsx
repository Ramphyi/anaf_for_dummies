import { and, count, eq, inArray, lt } from "drizzle-orm";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellData } from "@/components/shell/types";
import { isAiConfigured } from "@/lib/ai/openai";
import { connectionState, getConnection } from "@/lib/anaf/client";
import { can, requireContext, type Permission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, spvMessages, timeEntries } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";

const ALL: Permission[] = ["billing", "anaf", "reports", "settings", "users", "projects.manage", "timesheet.approve", "timesheet.own"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const companyId = ctx.company.id;
  const permissions = ALL.filter((p) => can(ctx, p));

  const [[overdue], [spvUnread], [approvals], [efacturaErrors], conn] = await Promise.all([
    db
      .select({ n: count() })
      .from(documents)
      .where(
        and(
          eq(documents.companyId, companyId),
          eq(documents.kind, "invoice"),
          inArray(documents.status, ["issued", "partially_paid"]),
          lt(documents.dueDate, todayIso()),
        ),
      ),
    db
      .select({ n: count() })
      .from(spvMessages)
      .where(and(eq(spvMessages.companyId, companyId), eq(spvMessages.read, false))),
    can(ctx, "timesheet.approve")
      ? db
          .select({ n: count() })
          .from(timeEntries)
          .where(and(eq(timeEntries.companyId, companyId), eq(timeEntries.status, "submitted")))
      : Promise.resolve([{ n: 0 }]),
    db
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), inArray(documents.efacturaStatus, ["nok", "error"]))),
    getConnection(companyId),
  ]);

  const state = connectionState(conn);
  const data: ShellData = {
    user: { name: ctx.user.name, email: ctx.user.email, avatarColor: ctx.user.avatarColor },
    company: { id: ctx.company.id, name: ctx.company.name, cui: ctx.company.cui },
    companies: ctx.companies,
    role: ctx.role,
    permissions,
    badges: {
      overdue: permissions.includes("billing") ? overdue.n : 0,
      spvUnread: permissions.includes("anaf") ? spvUnread.n : 0,
      approvals: approvals.n,
      efacturaErrors: permissions.includes("anaf") ? efacturaErrors.n : 0,
    },
    anaf: { label: state.label, tone: state.tone, environment: conn.environment },
    aiConfigured: isAiConfigured(),
  };

  return <AppShell data={data}>{children}</AppShell>;
}
