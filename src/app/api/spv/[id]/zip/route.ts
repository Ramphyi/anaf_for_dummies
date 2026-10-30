import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { friendlyAnafError, safeFilename } from "@/components/anaf/utils";
import { spvMessageZip } from "@/lib/anaf/service";
import { can, getContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { spvMessages } from "@/lib/db/schema";
import { actorFrom } from "@/lib/server/activity";

/** Arhiva ZIP a unui mesaj SPV (factura XML + semnătura MF). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Sesiunea a expirat. Autentifică-te din nou." }, { status: 401 });
  if (!can(ctx, "anaf")) return Response.json({ error: "Nu ai permisiunea necesară pentru SPV." }, { status: 403 });
  const { id } = await params;
  try {
    const { name, data } = await spvMessageZip(actorFrom(ctx), id);
    const updated = await db
      .update(spvMessages)
      .set({ read: true })
      .where(and(eq(spvMessages.id, id), eq(spvMessages.companyId, ctx.company.id), eq(spvMessages.read, false)))
      .returning({ id: spvMessages.id });
    if (updated.length) revalidatePath("/", "layout");
    const file = safeFilename(name);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = friendlyAnafError(err);
    return Response.json({ error: message }, { status: /inexistent/i.test(message) ? 404 : 502 });
  }
}
