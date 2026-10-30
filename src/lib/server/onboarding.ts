import "server-only";
import type { DbOrTx } from "@/lib/db";
import { anafConnections, companies, documentSeries, memberships, teamMembers, warehouses, type Role } from "@/lib/db/schema";
import { normalizeCui } from "@/lib/utils";

export type NewCompanyInput = {
  name: string;
  cui: string;
  regCom?: string | null;
  vatPayer?: boolean;
  vatOnCollection?: boolean;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  postalCode?: string | null;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  bank?: string | null;
};

/** Creează o firmă cu serii implicite, gestiune, conexiune ANAF (simulare) și membrul de echipă al proprietarului. */
export async function createCompanyWithDefaults(
  tx: DbOrTx,
  owner: { userId: string; name: string; email: string; role?: Role },
  input: NewCompanyInput,
) {
  const [company] = await tx
    .insert(companies)
    .values({
      name: input.name.trim(),
      cui: normalizeCui(input.cui),
      regCom: input.regCom ?? null,
      vatPayer: input.vatPayer ?? true,
      vatOnCollection: input.vatOnCollection ?? false,
      address: input.address ?? null,
      city: input.city ?? null,
      county: input.county ?? null,
      postalCode: input.postalCode ?? null,
      email: input.email ?? owner.email,
      phone: input.phone ?? null,
      iban: input.iban ?? null,
      bank: input.bank ?? null,
    })
    .returning();

  await tx.insert(documentSeries).values([
    { companyId: company.id, type: "invoice", prefix: "FCT", isDefault: true },
    { companyId: company.id, type: "proforma", prefix: "PRF", isDefault: true },
    { companyId: company.id, type: "notice", prefix: "AVZ", isDefault: true },
    { companyId: company.id, type: "receipt", prefix: "CHT", isDefault: true },
  ]);
  await tx.insert(warehouses).values({ companyId: company.id, name: "Depozit principal", code: "DEP1", isDefault: true });
  await tx.insert(anafConnections).values({ companyId: company.id, environment: "simulation" });
  const [member] = await tx
    .insert(teamMembers)
    .values({ companyId: company.id, userId: owner.userId, name: owner.name, email: owner.email, position: "Administrator", department: "Management", seniority: "lead" })
    .returning();
  await tx.insert(memberships).values({ userId: owner.userId, companyId: company.id, role: owner.role ?? "owner", teamMemberId: member.id });
  return company;
}
