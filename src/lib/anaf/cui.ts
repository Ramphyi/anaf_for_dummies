import "server-only";
import { countyFromName } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { normalizeCui } from "@/lib/utils";

/**
 * Interogare publică ANAF — „Registrul contribuabililor plătitori de TVA” (fără autentificare).
 * Documentație: https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
 */
const TVA_ENDPOINTS = [
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva",
  "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva",
];

export type CompanyLookup = {
  cui: string;
  name: string;
  regCom: string | null;
  address: string | null;
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  phone: string | null;
  caen: string | null;
  vatPayer: boolean;
  vatOnCollection: boolean;
  splitVat: boolean;
  inactive: boolean;
  eInvoiceRegistered: boolean;
  registrationStatus: string | null;
  registrationDate: string | null;
  legalForm: string | null;
  fiscalOffice: string | null;
  iban: string | null;
  raw: unknown;
};

type AnafFound = {
  date_generale: Record<string, string | boolean | null>;
  inregistrare_scop_Tva?: { scpTVA?: boolean };
  inregistrare_RTVAI?: { statusTvaIncasare?: boolean };
  stare_inactiv?: { statusInactivi?: boolean };
  inregistrare_SplitTVA?: { statusSplitTVA?: boolean };
  adresa_sediu_social?: Record<string, string | null>;
};

export async function lookupCompany(rawCui: string, date = todayIso()): Promise<CompanyLookup | null> {
  const cui = normalizeCui(rawCui);
  if (!cui) throw new Error("CUI invalid.");
  let lastError: unknown;
  for (const url of TVA_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ cui: Number(cui), data: date }]),
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`ANAF a răspuns cu ${res.status}`);
      const json = (await res.json()) as { found?: AnafFound[]; notFound?: unknown[] };
      const f = json.found?.[0];
      if (!f) return null;
      const g = f.date_generale;
      const sediu = f.adresa_sediu_social ?? {};
      const street = [sediu.sdenumire_Strada, sediu.snumar_Strada ? `nr. ${sediu.snumar_Strada}` : null, sediu.sdetalii_Adresa]
        .filter(Boolean)
        .join(", ");
      const countyRaw = (sediu.sdenumire_Judet as string) ?? null;
      let city = (sediu.sdenumire_Localitate as string) ?? null;
      const county = (sediu.scod_JudetAuto as string) || countyFromName(countyRaw);
      if (county === "B" && city && /sector/i.test(city)) city = city.replace(/^.*?(sector\s*\d).*$/i, "Sector $1").replace(/sector sector/i, "Sector");
      return {
        cui,
        name: String(g.denumire ?? "").trim(),
        regCom: (g.nrRegCom as string) || null,
        address: (g.adresa as string) || null,
        street: street || (g.adresa as string) || null,
        city: city ? titleCase(city) : null,
        county,
        postalCode: (sediu.scod_Postal as string) || (g.codPostal as string) || null,
        phone: (g.telefon as string) || null,
        caen: (g.cod_CAEN as string) || null,
        vatPayer: !!f.inregistrare_scop_Tva?.scpTVA,
        vatOnCollection: !!f.inregistrare_RTVAI?.statusTvaIncasare,
        splitVat: !!f.inregistrare_SplitTVA?.statusSplitTVA,
        inactive: !!f.stare_inactiv?.statusInactivi,
        eInvoiceRegistered: !!g.statusRO_e_Factura,
        registrationStatus: (g.stare_inregistrare as string) || null,
        registrationDate: (g.data_inregistrare as string) || null,
        legalForm: (g.forma_juridica as string) || null,
        fiscalOffice: (g.organFiscalCompetent as string) || null,
        iban: (g.iban as string) || null,
        raw: f,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Serviciul ANAF de interogare CUI nu răspunde momentan${lastError instanceof Error ? ` (${lastError.message})` : ""}. Încearcă din nou.`,
  );
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
