import { friendlyAnafError, safeFilename } from "@/components/anaf/utils";
import { xmlToPdf } from "@/lib/anaf/client";
import { parseUbl } from "@/lib/anaf/ubl-parse";
import { can, getContext } from "@/lib/auth/session";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Conversie XML → PDF prin serviciul public ANAF.
 * Body: `multipart/form-data` cu câmpul `file`, sau XML brut (`text/xml` / `text/plain`).
 * `?validate=1` — ANAF validează XML-ul înainte de conversie.
 */
export async function POST(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Sesiunea a expirat. Autentifică-te din nou." }, { status: 401 });
  if (!can(ctx, "anaf")) return Response.json({ error: "Nu ai permisiunea necesară." }, { status: 403 });

  let xml = "";
  let sourceName = "factura.xml";
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Lipsește fișierul XML." }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "Fișierul depășește 5 MB." }, { status: 413 });
      sourceName = file.name || sourceName;
      xml = await file.text();
    } else {
      xml = await request.text();
      if (xml.length > MAX_BYTES) return Response.json({ error: "Fișierul depășește 5 MB." }, { status: 413 });
    }
  } catch {
    return Response.json({ error: "Nu am putut citi fișierul trimis." }, { status: 400 });
  }

  xml = xml.replace(/^﻿/, "").trim();
  if (!/<(\w+:)?(Invoice|CreditNote)[\s>]/.test(xml)) {
    return Response.json({ error: "Fișierul nu pare a fi o factură UBL (lipsește elementul Invoice / CreditNote)." }, { status: 422 });
  }

  let base = sourceName.replace(/\.xml$/i, "");
  try {
    const n = parseUbl(xml).number;
    if (n) base = `factura_${n}`;
  } catch {
    /* numele fișierului sursă */
  }

  const validate = new URL(request.url).searchParams.get("validate") === "1";
  try {
    const pdf = await xmlToPdf(ctx.company.id, xml, validate);
    const file = safeFilename(`${base}.pdf`);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: friendlyAnafError(err) }, { status: 502 });
  }
}
