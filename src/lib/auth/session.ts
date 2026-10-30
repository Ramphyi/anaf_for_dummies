import "server-only";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { FORBIDDEN_DIGEST } from "@/lib/constants";
import { db } from "@/lib/db";
import { companies, memberships, users, type Company, type Role, type User } from "@/lib/db/schema";

export const SESSION_COOKIE = "afd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 zile

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET lipsește sau e prea scurt");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-0123456789");
  }
  return new TextEncoder().encode(s);
}

type SessionPayload = { uid: string; cid: string };

async function isHttps() {
  if (process.env.APP_URL?.startsWith("https://")) return true;
  return (await headers()).get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function createSession(userId: string, companyId: string) {
  const token = await new SignJWT({ uid: userId, cid: companyId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // „Secure” doar pe HTTPS: pe http://localhost (Docker) Safari nu păstrează cookie-urile Secure.
    secure: await isHttps(),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secret());
    return payload.uid && payload.cid ? { uid: payload.uid, cid: payload.cid } : null;
  } catch {
    return null;
  }
});

export type AppContext = {
  user: User;
  company: Company;
  role: Role;
  teamMemberId: string | null;
  companies: { id: string; name: string; cui: string; role: Role }[];
};

/** Contextul curent (utilizator + firmă activă + rol). Memorat per request. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.uid) });
  if (!user) return null;
  const all = await db
    .select({ id: companies.id, name: companies.name, cui: companies.cui, role: memberships.role, tm: memberships.teamMemberId })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, user.id));
  const active = all.find((c) => c.id === session.cid) ?? all[0];
  if (!active) return null;
  const company = await db.query.companies.findFirst({ where: eq(companies.id, active.id) });
  if (!company) return null;
  return {
    user,
    company,
    role: active.role,
    teamMemberId: active.tm,
    companies: all.map(({ id, name, cui, role }) => ({ id, name, cui, role })),
  };
});

/** Folosit în pagini, acțiuni și route handlers: redirecționează la /login dacă nu există sesiune. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContext();
  // Cookie invalid/expirat (ex. după resetarea bazei) → îl ștergem printr-un route handler.
  if (!ctx) redirect("/api/auth/logout");
  return ctx;
}

/* ------------------------------ Permisiuni ------------------------------ */

export type Permission =
  | "billing" // facturi, încasări, cheltuieli, nomenclatoare, stocuri
  | "anaf" // e-Factura, SPV, e-Transport
  | "reports"
  | "settings"
  | "users"
  | "projects.manage" // proiecte, echipă, planificare
  | "timesheet.approve"
  | "timesheet.own";

const MATRIX: Record<Role, Permission[]> = {
  owner: ["billing", "anaf", "reports", "settings", "users", "projects.manage", "timesheet.approve", "timesheet.own"],
  admin: ["billing", "anaf", "reports", "settings", "users", "projects.manage", "timesheet.approve", "timesheet.own"],
  accountant: ["billing", "anaf", "reports", "timesheet.own"],
  manager: ["reports", "projects.manage", "timesheet.approve", "timesheet.own"],
  employee: ["timesheet.own"],
};

export function can(ctx: Pick<AppContext, "role">, permission: Permission): boolean {
  return MATRIX[ctx.role].includes(permission);
}

export async function requirePermission(permission: Permission): Promise<AppContext> {
  const ctx = await requireContext();
  if (!can(ctx, permission)) throw Object.assign(new Error("Nu ai permisiunea necesară pentru această acțiune."), { digest: FORBIDDEN_DIGEST });
  return ctx;
}

export async function switchCompany(companyId: string) {
  const ctx = await requireContext();
  const m = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, ctx.user.id), eq(memberships.companyId, companyId)),
  });
  if (!m) throw new Error("Nu ai acces la această firmă.");
  await db.update(users).set({ lastCompanyId: companyId }).where(eq(users.id, ctx.user.id));
  await createSession(ctx.user.id, companyId);
}
