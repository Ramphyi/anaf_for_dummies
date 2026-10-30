import { friendlyAnafError, safeFilename } from "@/components/anaf/utils";
import { xmlToPdf } from "@/lib/anaf/client";
import { downloadSpvMessage } from "@/lib/anaf/service";
import { parseUbl } from "@/lib/anaf/ubl-parse";
import { can, getContext } from "@/lib/auth/session";
import { actorFrom } from "@/lib/server/activity";

/** PDF-ul oficial ANAF (serviciul public de transformare XML → PDF) pentru un mesaj SPV. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Sesiunea a expirat. Autentifică-te din nou." }, { status: 401 });
  if (!can(ctx, "anaf")) return Response.json({ error: "Nu ai permisiunea necesară pentru SPV." }, { status: 403 });
  const { id } = await params;

  let xml: string | null;
  let anafId: string;
  try {
    const msg = await downloadSpvMessage(actorFrom(ctx), id);
    xml = msg.xml;
    anafId = msg.anafId;
  } catch (err) {
    const message = friendlyAnafError(err);
    return Response.json({ error: message }, { status: /inexistent/i.test(message) ? 404 : 502 });
  }
  if (!xml) return Response.json({ error: "Mesajul nu conține o factură XML." }, { status: 422 });

  let number = anafId;
  try {
    number = parseUbl(xml).number || anafId;
  } catch {
    /* păstrăm id-ul ANAF */
  }

  try {
    const pdf = await xmlToPdf(ctx.company.id, xml);
    const file = safeFilename(`factura_${number}.pdf`);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: `Conversia în PDF a eșuat. ${friendlyAnafError(err)}` }, { status: 502 });
  }
}
