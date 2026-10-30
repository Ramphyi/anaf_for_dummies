import { Archive, BadgeCheck, Globe2, ShieldCheck } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { countyName } from "@/lib/constants";
import type { Partner } from "@/lib/db/schema";
import { initials } from "@/lib/utils";

/** Inițialele partenerului, pentru caseta de icon din PageHeader. */
export function PartnerInitials({ name }: { name: string }) {
  return <span className="text-sm font-semibold tracking-tight">{initials(name)}</span>;
}

/** Linia de sub numele partenerului: CUI, localitate și insigne de status. */
export function PartnerSubtitle({ partner }: { partner: Partner }) {
  const isRo = partner.country === "RO";
  const id = partner.cui
    ? partner.entityType === "pf"
      ? `CNP ${partner.cui}`
      : `CUI ${partner.vatPayer && isRo ? "RO" : ""}${partner.cui}`
    : partner.entityType === "pf"
      ? "Persoană fizică"
      : "Fără CUI";
  const place = [partner.city, isRo ? countyName(partner.county) : partner.country].filter(Boolean).join(", ");
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className={partner.cui ? "font-mono text-[12.5px] text-foreground/80" : "text-foreground/80"}>{id}</span>
      {place && <span className="text-muted-foreground">· {place}</span>}
      {partner.vatPayer && (
        <Badge tone="success">
          <BadgeCheck className="size-3" /> Plătitor TVA
        </Badge>
      )}
      {partner.eInvoiceRegistered && (
        <Badge tone="brand">
          <ShieldCheck className="size-3" /> RO e-Factura
        </Badge>
      )}
      {!isRo && (
        <Badge tone="info">
          <Globe2 className="size-3" /> Extern
        </Badge>
      )}
      {!partner.active && (
        <Badge tone="danger">
          <Archive className="size-3" /> Inactiv · arhivat
        </Badge>
      )}
    </span>
  );
}
