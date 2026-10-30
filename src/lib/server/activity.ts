import "server-only";
import { db, type DbOrTx } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

export type Actor = { companyId: string; userId?: string | null; userName?: string | null };

export function actorFrom(ctx: { company: { id: string }; user: { id: string; name: string } }): Actor {
  return { companyId: ctx.company.id, userId: ctx.user.id, userName: ctx.user.name };
}

export async function logActivity(
  actor: Actor,
  entry: { entity: string; entityId?: string | null; action: string; message: string },
  tx: DbOrTx = db,
) {
  await tx.insert(activityLog).values({
    companyId: actor.companyId,
    userId: actor.userId ?? null,
    userName: actor.userName ?? "Sistem",
    ...entry,
  });
}
