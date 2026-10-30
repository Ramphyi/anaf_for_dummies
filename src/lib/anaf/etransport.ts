import { COUNTIES } from "@/lib/constants";
import type { Company, EtransportDeclaration } from "@/lib/db/schema";
import { normalizeCui } from "@/lib/utils";

/** Coduri e-Transport (nomenclatoare ANAF, schema v2). */
export const ETRANSPORT_OPERATIONS: Record<string, string> = {
  "10": "Achiziție intracomunitară (AIC)",
  "12": "Operațiuni în sistem lohn (UE) — intrare",
  "14": "Stocuri la dispoziția clientului (Call-off stock) — intrare",
  "20": "Livrare intracomunitară (LIC)",
  "22": "Operațiuni în sistem lohn (UE) — ieșire",
  "24": "Stocuri la dispoziția clientului (Call-off stock) — ieșire",
  "30": "Transport pe teritoriul național",
  "40": "Export",
  "50": "Import",
  "60": "Tranzacție intracomunitară — intrare pentru depozitare",
  "70": "Tranzacție intracomunitară — ieșire după depozitare",
};

export const ETRANSPORT_PURPOSES: Record<string, string> = {
  "101": "Comercializare",
  "201": "Producție",
  "301": "Gratuități",
  "401": "Echipament comercial",
  "501": "Mijloace fixe",
  "601": "Consum propriu",
  "703": "Operațiuni de livrare cu instalare",
  "704": "Transfer între gestiuni",
  "705": "Bunuri puse la dispoziția clientului",
  "801": "Leasing financiar/operațional",
  "802": "Bunuri în garanție",
  "901": "Operațiuni scutite",
  "1001": "Investiție în curs",
  "1101": "Donații, ajutoare",
  "9901": "Altele",
};

export const ETRANSPORT_DOC_TYPES: Record<string, string> = {
  "10": "CMR",
  "20": "Factură",
  "30": "Aviz de însoțire a mărfii",
  "9999": "Altele",
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const countyCode = (iso: string | null) => COUNTIES.find((c) => c.code === iso)?.anaf ?? 40;

export function buildEtransportXml(
  company: Pick<Company, "cui">,
  d: Pick<
    EtransportDeclaration,
    | "id"
    | "operationType"
    | "partnerName"
    | "vehicleNumber"
    | "trailer1"
    | "carrierName"
    | "carrierCui"
    | "transportDate"
    | "startCounty"
    | "startCity"
    | "startAddress"
    | "endCounty"
    | "endCity"
    | "endAddress"
    | "documentNumber"
    | "items"
  > & { partnerCui?: string | null; partnerCountry?: string | null },
) {
  const cui = normalizeCui(company.cui);
  const items = d.items
    .map(
      (it) =>
        `<bunuriTransportate codScopOperatiune="${esc(it.purposeCode || "101")}" codTarifar="${esc(it.ncCode)}" denumireMarfa="${esc(it.name.slice(0, 200))}" cantitate="${it.quantity}" codUnitateMasura="${esc(it.unitCode || "H87")}" greutateNeta="${it.netWeight}" greutateBruta="${it.grossWeight}" valoareLeiFaraTva="${it.valueRon.toFixed(2)}"/>`,
    )
    .join("");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<eTransport xmlns="mfp:anaf:dgti:eTransport:declaratie:v2" codDeclarant="${cui}" refDeclarant="${esc(d.id.slice(0, 8))}">`,
    `<notificare codTipOperatiune="${esc(d.operationType)}">`,
    items,
    `<partenerComercial codTara="${esc(d.partnerCountry || "RO")}"${d.partnerCui ? ` cod="${esc(d.partnerCui)}"` : ""} denumire="${esc(d.partnerName ?? "")}"/>`,
    `<dateTransport nrVehicul="${esc((d.vehicleNumber ?? "").replace(/\s/g, "").toUpperCase())}"${d.trailer1 ? ` nrRemorca1="${esc(d.trailer1.replace(/\s/g, "").toUpperCase())}"` : ""} codTaraOrgTransport="RO"${d.carrierCui ? ` codOrgTransport="${esc(normalizeCui(d.carrierCui))}"` : ""} denumireOrgTransport="${esc(d.carrierName ?? "")}" dataTransport="${d.transportDate}"/>`,
    `<locStartTraseuRutier><locatie codJudet="${countyCode(d.startCounty)}" denumireLocalitate="${esc(d.startCity)}" denumireStrada="${esc(d.startAddress)}"/></locStartTraseuRutier>`,
    `<locFinalTraseuRutier><locatie codJudet="${countyCode(d.endCounty)}" denumireLocalitate="${esc(d.endCity)}" denumireStrada="${esc(d.endAddress)}"/></locFinalTraseuRutier>`,
    d.documentNumber ? `<documenteTransport tipDocument="20" numarDocument="${esc(d.documentNumber)}" dataDocument="${d.transportDate}"/>` : "",
    `</notificare>`,
    `</eTransport>`,
  ].join("");
}
