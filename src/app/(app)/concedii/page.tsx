import { and, desc, eq, gte } from "drizzle-orm";
import { Palmtree } from "lucide-react";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { timeOff } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso } from "@/lib/outsourcing/dates";
import { loadMembersLite } from "@/lib/outsourcing/server";
import { PageHeader } from "@/components/ui/page";
import { NewTimeOffButton, TimeOffView } from "@/components/outsourcing/time-off";

export const metadata = { title: "Concedii" };

export default async function TimeOffPage() {
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const today = todayIso();
  const year = today.slice(0, 4);
  const from = [`${year}-01-01`, addDaysIso(today, -400)].sort()[0];

  const [members, rows] = await Promise.all([
    loadMembersLite(cid),
    db
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.companyId, cid), gte(timeOff.endDate, from)))
      .orderBy(desc(timeOff.startDate)),
  ]);

  const canApprove = can(ctx, "timesheet.approve");
  const props = {
    today,
    members: members.filter((m) => m.active || rows.some((r) => r.memberId === m.id)),
    meId: ctx.teamMemberId,
    canApprove,
  };

  return (
    <>
      <PageHeader
        title="Concedii"
        description="Cereri de concediu, calendarul echipei și zilele luate în an."
        icon={<Palmtree />}
        actions={canApprove || ctx.teamMemberId ? <NewTimeOffButton {...props} /> : undefined}
      />
      <TimeOffView
        {...props}
        requests={rows.map((r) => ({ id: r.id, memberId: r.memberId, type: r.type, startDate: r.startDate, endDate: r.endDate, status: r.status, notes: r.notes }))}
      />
    </>
  );
}
