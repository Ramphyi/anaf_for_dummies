import { Banknote, Building2, Mail, MapPin, Phone, StickyNote, UserRound } from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/page";
import { countyName } from "@/lib/constants";
import type { Partner } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";

function Empty() {
  return <span className="font-normal text-muted-foreground">—</span>;
}

/** Fișa de contact a unui partener (identificare, adresă, contact, plată). */
export function PartnerContact({ partner }: { partner: Partner }) {
  const isRo = partner.country === "RO";
  const fullAddress = [partner.address, partner.city, isRo ? countyName(partner.county) : null, partner.postalCode, isRo ? "România" : partner.country]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeaderRow title="Identificare" icon={<Building2 />} />
        <CardContent className="divide-y divide-border/70">
          <DetailRow label={partner.entityType === "pf" ? "CNP" : "CUI / CIF"}>
            {partner.cui ? <span className="font-mono text-[13px]">{partner.vatPayer && isRo && partner.entityType === "pj" ? `RO${partner.cui}` : partner.cui}</span> : <Empty />}
          </DetailRow>
          {partner.entityType === "pj" && <DetailRow label="Nr. Reg. Comerțului">{partner.regCom ?? <Empty />}</DetailRow>}
          <DetailRow label="Tip">{partner.entityType === "pf" ? "Persoană fizică" : "Persoană juridică"}{!isRo && " · extern"}</DetailRow>
          <DetailRow label="Plătitor de TVA">{partner.vatPayer ? "Da" : "Nu"}</DetailRow>
          <DetailRow label="RO e-Factura">{partner.eInvoiceRegistered ? "Înregistrat în registru" : "Neînregistrat"}</DetailRow>
          <DetailRow label="Adăugat la">{formatDate(partner.createdAt)}</DetailRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Contact" icon={<UserRound />} />
        <CardContent className="divide-y divide-border/70">
          <DetailRow label={<span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> Adresă</span>}>{fullAddress || <Empty />}</DetailRow>
          <DetailRow label={<span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" /> Email</span>}>
            {partner.email ? (
              <a href={`mailto:${partner.email}`} className="text-primary hover:underline">
                {partner.email}
              </a>
            ) : (
              <Empty />
            )}
          </DetailRow>
          <DetailRow label={<span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" /> Telefon</span>}>
            {partner.phone ? (
              <a href={`tel:${partner.phone.replace(/\s/g, "")}`} className="text-primary hover:underline">
                {partner.phone}
              </a>
            ) : (
              <Empty />
            )}
          </DetailRow>
          <DetailRow label="Persoană de contact">{partner.contactPerson ?? <Empty />}</DetailRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Plată" icon={<Banknote />} />
        <CardContent className="divide-y divide-border/70">
          <DetailRow label="IBAN">{partner.iban ? <span className="font-mono text-[13px]">{partner.iban.replace(/(.{4})/g, "$1 ").trim()}</span> : <Empty />}</DetailRow>
          <DetailRow label="Bancă">{partner.bank ?? <Empty />}</DetailRow>
          <DetailRow label="Termen de plată">{partner.paymentTermDays != null ? `${partner.paymentTermDays} zile` : <Empty />}</DetailRow>
          <DetailRow label="Monedă implicită">{partner.defaultCurrency ?? "RON"}</DetailRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Note interne" icon={<StickyNote />} />
        <CardContent>
          {partner.notes ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">{partner.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nicio notă. Adaugă observații interne din „Editează”.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
