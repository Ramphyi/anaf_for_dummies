"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyAnafError } from "@/components/anaf/utils";
import { etransportStatus, etransportUpload, getConnection } from "@/lib/anaf/client";
import { buildEtransportXml, ETRANSPORT_OPERATIONS, ETRANSPORT_PURPOSES } from "@/lib/anaf/etransport";
import { requirePermission, type AppContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { etransportDeclarations, partners, type EtransportDeclaration } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction, zDate } from "@/lib/server/action";
import { normalizeCui, round2 } from "@/lib/utils";

const text = z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null));
const num = z.coerce.number({ error: "Valoare numerică invalidă" }).finite().min(0, "Valoarea nu poate fi negativă");

const itemSchema = z.object({
  name: z.string().trim().max(200).default(""),
  ncCode: z.string().trim().default(""),
  quantity: num.default(0),
  unitCode: z.string().trim().default("H87"),
  netWeight: num.default(0),
  grossWeight: num.default(0),
  valueRon: num.default(0),
  purposeCode: z.string().default("101"),
});

const baseSchema = z.object({
  id: z.string().optional().nullable(),
  operationType: z.string().refine((v) => v in ETRANSPORT_OPERATIONS, "Tip de operațiune invalid"),
  partnerId: text,
  partnerName: text,
  vehicleNumber: text,
  trailer1: text,
  carrierName: text,
  carrierCui: text,
  transportDate: zDate,
  startCounty: text,
  startCity: text,
  startAddress: text,
  endCounty: text,
  endCity: text,
  endAddress: text,
  documentId: text,
  documentNumber: text,
  items: z.array(itemSchema).max(200, "Maximum 200 de articole"),
});

/** Validare completă pentru declararea la ANAF (ciornele pot fi incomplete). */
const submitSchema = baseSchema.superRefine((d, ctx) => {
  const req = (value: unknown, path: string, message: string) => {
    if (!value) ctx.addIssue({ code: "custom", path: [path], message });
  };
  req(d.partnerName, "partnerName", "Alege partenerul comercial");
  req(d.vehicleNumber, "vehicleNumber", "Numărul de înmatriculare este obligatoriu");
  if (d.vehicleNumber && !/^[A-Z0-9]{4,10}$/i.test(d.vehicleNumber.replace(/[\s-]/g, ""))) {
    ctx.addIssue({ code: "custom", path: ["vehicleNumber"], message: "Număr de înmatriculare invalid (ex. B123ABC)" });
  }
  req(d.startCounty, "startCounty", "Alege județul de plecare");
  req(d.startCity, "startCity", "Localitatea de plecare este obligatorie");
  req(d.endCounty, "endCounty", "Alege județul de destinație");
  req(d.endCity, "endCity", "Localitatea de destinație este obligatorie");
  if (!d.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Adaugă cel puțin un bun transportat" });
  d.items.forEach((it, i) => {
    if (!it.name) ctx.addIssue({ code: "custom", path: ["items", i, "name"], message: "Denumirea este obligatorie" });
    if (!/^\d{4}(\d{2}){0,2}$/.test(it.ncCode)) ctx.addIssue({ code: "custom", path: ["items", i, "ncCode"], message: "Cod NC de 4, 6 sau 8 cifre" });
    if (!(it.quantity > 0)) ctx.addIssue({ code: "custom", path: ["items", i, "quantity"], message: "Cantitate > 0" });
    if (!(it.grossWeight > 0)) ctx.addIssue({ code: "custom", path: ["items", i, "grossWeight"], message: "Greutatea brută este obligatorie" });
    if (it.grossWeight < it.netWeight) ctx.addIssue({ code: "custom", path: ["items", i, "grossWeight"], message: "Brută ≥ netă" });
    if (!(it.valueRon > 0)) ctx.addIssue({ code: "custom", path: ["items", i, "valueRon"], message: "Valoarea este obligatorie" });
    if (!(it.purposeCode in ETRANSPORT_PURPOSES)) ctx.addIssue({ code: "custom", path: ["items", i, "purposeCode"], message: "Scop invalid" });
  });
});

export type EtransportInput = z.input<typeof baseSchema>;
type Parsed = z.output<typeof baseSchema>;

function normalize(d: Parsed) {
  const plate = (v: string | null) => (v ? v.replace(/[\s-]/g, "").toUpperCase() : null);
  return {
    operationType: d.operationType,
    partnerId: d.partnerId,
    partnerName: d.partnerName,
    vehicleNumber: plate(d.vehicleNumber),
    trailer1: plate(d.trailer1),
    carrierName: d.carrierName,
    carrierCui: d.carrierCui ? normalizeCui(d.carrierCui) || d.carrierCui : null,
    transportDate: d.transportDate,
    startCounty: d.startCounty,
    startCity: d.startCity,
    startAddress: d.startAddress,
    endCounty: d.endCounty,
    endCity: d.endCity,
    endAddress: d.endAddress,
    documentId: d.documentId,
    documentNumber: d.documentNumber,
    items: d.items.map((it) => ({ ...it, valueRon: round2(it.valueRon), netWeight: round2(it.netWeight), grossWeight: round2(it.grossWeight) })),
  };
}

async function persist(ctx: AppContext, d: Parsed): Promise<EtransportDeclaration> {
  const values = normalize(d);
  if (d.id) {
    const existing = await db.query.etransportDeclarations.findFirst({
      where: and(eq(etransportDeclarations.id, d.id), eq(etransportDeclarations.companyId, ctx.company.id)),
    });
    if (!existing) throw new Error("Declarația nu există.");
    if (existing.status === "ok" || existing.status === "pending") throw new Error("Declarația a fost deja transmisă la ANAF și nu mai poate fi modificată.");
    const [saved] = await db.update(etransportDeclarations).set({ ...values, status: "draft", message: null }).where(eq(etransportDeclarations.id, d.id)).returning();
    return saved;
  }
  const [saved] = await db
    .insert(etransportDeclarations)
    .values({ companyId: ctx.company.id, ...values, status: "draft", createdBy: ctx.user.id })
    .returning();
  return saved;
}

/** Generează XML-ul, îl încarcă la ANAF și salvează UIT-ul. */
async function submit(ctx: AppContext, decl: EtransportDeclaration) {
  const partner = decl.partnerId
    ? await db.query.partners.findFirst({
        where: and(eq(partners.id, decl.partnerId), eq(partners.companyId, ctx.company.id)),
        columns: { cui: true, country: true },
      })
    : null;
  const xml = buildEtransportXml(ctx.company, { ...decl, partnerCui: partner?.cui ?? null, partnerCountry: partner?.country ?? "RO" });
  const conn = await getConnection(ctx.company.id);
  let result: { ok: boolean; uit: string | null; uploadId: string | null; errors: string[] };
  try {
    result = await etransportUpload(conn, normalizeCui(ctx.company.cui), xml);
  } catch (err) {
    result = { ok: false, uit: null, uploadId: null, errors: [friendlyAnafError(err)] };
  }
  await db
    .update(etransportDeclarations)
    .set({
      xml,
      uit: result.uit ?? decl.uit,
      uploadId: result.uploadId,
      status: result.ok ? "pending" : "error",
      message: result.ok ? null : result.errors.join("\n") || "ANAF a respins declarația.",
    })
    .where(eq(etransportDeclarations.id, decl.id));
  await logActivity(actorFrom(ctx), {
    entity: "etransport",
    entityId: decl.id,
    action: result.ok ? "declared" : "declare_failed",
    message: result.ok
      ? `Declarație e-Transport transmisă (UIT ${result.uit}) — ${decl.partnerName ?? ""}`
      : `Declarația e-Transport către ${decl.partnerName ?? "—"} a fost respinsă la încărcare`,
  });
  return { ok: result.ok, uit: result.uit, errors: result.errors };
}

function revalidate(id?: string) {
  revalidatePath("/etransport");
  if (id) revalidatePath(`/etransport/${id}`);
}

/** Salvează ca ciornă sau (cu `declare`) salvează și declară la ANAF. */
export async function saveEtransportAction(input: EtransportInput, declare = false) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const parsed = (declare ? submitSchema : baseSchema).safeParse(input);
    if (!parsed.success) {
      // Erorile de validare se întorc ca date, pentru afișare lângă câmpuri (fără cheile tehnice în toast)
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      const count = Object.keys(fieldErrors).length;
      return { invalid: true as const, fieldErrors, message: count === 1 ? Object.values(fieldErrors)[0] : `${count} câmpuri trebuie completate sau corectate.` };
    }
    const saved = await persist(ctx, parsed.data);
    if (!declare) {
      revalidate(saved.id);
      return { invalid: false as const, id: saved.id, declared: false, ok: true, uit: null as string | null, errors: [] as string[] };
    }
    const r = await submit(ctx, saved);
    revalidate(saved.id);
    return { invalid: false as const, id: saved.id, declared: true, ...r };
  });
}

/** Declară o ciornă existentă (din pagina de detalii). */
export async function declareEtransportAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const decl = await db.query.etransportDeclarations.findFirst({
      where: and(eq(etransportDeclarations.id, z.string().parse(id)), eq(etransportDeclarations.companyId, ctx.company.id)),
    });
    if (!decl) throw new Error("Declarația nu există.");
    if (decl.status === "ok" || decl.status === "pending") throw new Error("Declarația a fost deja transmisă.");
    const check = submitSchema.safeParse({ ...decl, items: decl.items });
    if (!check.success) {
      throw new Error(`Completează declarația înainte de transmitere: ${check.error.issues[0]?.message ?? "date incomplete"}.`);
    }
    const r = await submit(ctx, decl);
    revalidate(decl.id);
    if (!r.ok) throw new Error(`ANAF a respins declarația: ${r.errors.join("; ")}`);
    return r;
  });
}

export async function refreshEtransportStatusAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const decl = await db.query.etransportDeclarations.findFirst({
      where: and(eq(etransportDeclarations.id, z.string().parse(id)), eq(etransportDeclarations.companyId, ctx.company.id)),
    });
    if (!decl?.uploadId) throw new Error("Declarația nu a fost transmisă la ANAF.");
    const conn = await getConnection(ctx.company.id);
    let r;
    try {
      r = await etransportStatus(conn, decl.uploadId);
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
    const status = r.state === "ok" ? "ok" : r.state === "nok" ? "nok" : r.state === "processing" ? "pending" : "error";
    await db
      .update(etransportDeclarations)
      .set({ status, message: status === "ok" || status === "pending" ? null : r.message })
      .where(eq(etransportDeclarations.id, decl.id));
    revalidate(decl.id);
    return { state: status, message: r.message };
  });
}

export async function deleteEtransportAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const decl = await db.query.etransportDeclarations.findFirst({
      where: and(eq(etransportDeclarations.id, z.string().parse(id)), eq(etransportDeclarations.companyId, ctx.company.id)),
      columns: { id: true, status: true },
    });
    if (!decl) throw new Error("Declarația nu există.");
    if (!["draft", "error"].includes(decl.status)) throw new Error("Doar ciornele și declarațiile netransmise pot fi șterse.");
    await db.delete(etransportDeclarations).where(and(eq(etransportDeclarations.id, decl.id), inArray(etransportDeclarations.status, ["draft", "error"])));
    revalidate();
    return { id: decl.id };
  }, "Declarația a fost ștearsă");
}

/** Copiază o declarație într-o ciornă nouă (traseu recurent). */
export async function duplicateEtransportAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const src = await db.query.etransportDeclarations.findFirst({
      where: and(eq(etransportDeclarations.id, z.string().parse(id)), eq(etransportDeclarations.companyId, ctx.company.id)),
    });
    if (!src) throw new Error("Declarația nu există.");
    const { id: _id, uit: _uit, uploadId: _u, xml: _x, message: _m, status: _s, createdAt: _c, updatedAt: _up, ...rest } = src;
    const [copy] = await db
      .insert(etransportDeclarations)
      .values({ ...rest, status: "draft", transportDate: todayIso(), createdBy: ctx.user.id })
      .returning({ id: etransportDeclarations.id });
    revalidate();
    return { id: copy.id };
  }, "Ciornă nouă creată din declarația existentă");
}
