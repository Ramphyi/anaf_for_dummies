import { desc, eq } from "drizzle-orm";
import { History } from "lucide-react";
import { ActivityTable, type ActivityRow } from "@/components/settings/activity-table";
import { Card, CardHeaderRow } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityLog, users } from "@/lib/db/schema";

export const metadata = { title: "Jurnal de activitate" };

const LIMIT = 2000;

export default async function ActivityPage() {
  const ctx = await requirePermission("settings");
  const rows = await db
    .select({
      id: activityLog.id,
      userName: activityLog.userName,
      avatarColor: users.avatarColor,
      entity: activityLog.entity,
      action: activityLog.action,
      message: activityLog.message,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.userId))
    .where(eq(activityLog.companyId, ctx.company.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(LIMIT);

  const data: ActivityRow[] = rows.map((r) => ({ ...r, userName: r.userName ?? "Sistem", createdAt: r.createdAt.toISOString() }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeaderRow
          title="Jurnal de activitate"
          description={`Ultimele ${data.length === LIMIT ? LIMIT : data.length} acțiuni din firmă — emiteri, încasări, trimiteri ANAF, modificări de setări și acces.`}
          icon={<History />}
        />
      </Card>
      <ActivityTable rows={data} />
    </div>
  );
}
