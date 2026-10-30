"use client";

import {
  BadgeCheck,
  Ban,
  Building2,
  CircleCheck,
  CircleSlash,
  FileCheck2,
  Landmark,
  Loader2,
  Percent,
  Search,
  Split,
  Truck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { CopyButton } from "@/components/anaf/copy-button";
import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailRow, EmptyState } from "@/components/ui/page";
import { useAction } from "@/hooks/use-action";
import { countyName } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { savePartnerAction } from "@/lib/partners/actions";
import { cn, isValidCui, normalizeCui } from "@/lib/utils";
import { lookupCuiAction, type CuiResult } from "./actions";

const EXAMPLES = [
  { cui: "14399840", label: "Dante International (eMAG)" },
  { cui: "1590082", label: "Dedeman" },
  { cui: "13548146", label: "BCR" },
];

function Flag({ ok, warn, label, onLabel, offLabel, icon }: { ok: boolean; warn?: boolean; label: string; onLabel: string; offLabel: string; icon: React.ReactNode }) {
  const tone = ok ? (warn ? "warning" : "success") : "neutral";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        tone === "success" && "border-success/25 bg-success-soft/50",
        tone === "warning" && "border-warning/25 bg-warning-soft/50",
        tone === "neutral" && "border-border bg-subtle/60",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]",
          tone === "success" && "bg-success text-white",
          tone === "warning" && "bg-warning text-white",
          tone === "neutral" && "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{ok ? onLabel : offLabel}</p>
      </div>
    </div>
  );
}

export function CuiTool({ initialCui }: { initialCui: string | null }) {
  const router = useRouter();
  const [cui, setCui] = React.useState(initialCui ?? "");
  const [result, setResult] = React.useState<CuiResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<{ cui: string; name: string }[]>([]);
  const [looking, startLooking] = React.useTransition();
  const save = useAction();
  const ran = React.useRef(false);

  const clean = normalizeCui(cui);
  const valid = clean.length >= 2 && isValidCui(clean);

  const lookup = React.useCallback((value: string) => {
    setError(null);
    startLooking(async () => {
      const r = await lookupCuiAction(value);
      if (r.ok) {
        setResult(r.data);
        setRecent((list) => [{ cui: r.data.company.cui, name: r.data.company.name }, ...list.filter((x) => x.cui !== r.data.company.cui)].slice(0, 5));
      } else {
        setResult(null);
        setError(r.error);
      }
    });
  }, []);

  React.useEffect(() => {
    if (initialCui && !ran.current) {
      ran.current = true;
      lookup(initialCui);
    }
  }, [initialCui, lookup]);

  const addPartner = (kind: "client" | "supplier") => {
    if (!result) return;
    const c = result.company;
    save.run(
      () =>
        savePartnerAction({
          kind,
          entityType: "pj",
          name: c.name,
          cui: c.cui,
          regCom: c.regCom,
          vatPayer: c.vatPayer,
          address: c.street ?? c.address,
          city: c.city,
          county: c.county,
          country: "RO",
          postalCode: c.postalCode,
          phone: c.phone,
          iban: c.iban,
          eInvoiceRegistered: c.eInvoiceRegistered,
        }),
      {
        success: () => (kind === "client" ? `${c.name} a fost adăugat la clienți` : `${c.name} a fost adăugat la furnizori`),
        onSuccess: (p) => {
          setResult((r) => (r ? { ...r, existing: { id: p.id, name: p.name, kind: p.kind } } : r));
          router.refresh();
        },
      },
    );
  };

  const c = result?.company;
  const existingKind = result?.existing?.kind;
  const isClient = existingKind === "client" || existingKind === "both";
  const isSupplier = existingKind === "supplier" || existingKind === "both";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl" />
          <CardContent className="relative p-5 sm:p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (clean) lookup(clean);
              }}
              className="space-y-3"
            >
              <label htmlFor="cui" className="text-sm font-semibold">
                Verifică o firmă în registrul ANAF
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cui"
                    value={cui}
                    onChange={(e) => setCui(e.target.value)}
                    placeholder="CUI / CIF, cu sau fără RO — ex. RO14399840"
                    className="h-12 pr-28 pl-11 font-mono text-base"
                    autoComplete="off"
                    inputMode="text"
                    aria-invalid={clean.length > 2 && !valid ? true : undefined}
                  />
                  <AnimatePresence>
                    {clean.length >= 2 && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={cn(
                          "absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          valid ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground",
                        )}
                      >
                        {valid ? <CircleCheck className="size-3" /> : <CircleSlash className="size-3" />}
                        {valid ? "cifră control OK" : "CUI invalid"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <Button type="submit" size="lg" variant="gradient" disabled={!clean || looking}>
                  {looking ? <Loader2 className="animate-spin" /> : <Search />} Verifică la ANAF
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>Exemple:</span>
                {EXAMPLES.map((e) => (
                  <button
                    key={e.cui}
                    type="button"
                    onClick={() => {
                      setCui(e.cui);
                      lookup(e.cui);
                    }}
                    className="rounded-full bg-muted px-2.5 py-1 font-medium transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </form>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {looking ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="p-6">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin text-primary" /> Interoghez registrul contribuabililor ANAF…
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              </Card>
            </motion.div>
          ) : error ? (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card>
                <EmptyState
                  compact
                  icon={<TriangleAlert />}
                  title="Verificarea nu a reușit"
                  description={error}
                  action={
                    valid ? (
                      <Button variant="outline" onClick={() => lookup(clean)}>
                        Reîncearcă
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            </motion.div>
          ) : c ? (
            <motion.div key={c.cui} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
              <Card className="overflow-hidden">
                <div className={cn("relative border-b border-border p-5 sm:p-6", c.inactive ? "bg-danger-soft/40" : "bg-gradient-to-br from-primary-soft/60 to-transparent")}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-card text-primary shadow-soft">
                        <Building2 className="size-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-semibold tracking-tight break-words">{c.name}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-mono text-foreground">{c.vatPayer ? `RO${c.cui}` : c.cui}</span>
                          <CopyButton value={c.vatPayer ? `RO${c.cui}` : c.cui} tooltip="Copiază CIF" toastMessage="CIF copiat" />
                          {c.regCom && <span>· {c.regCom}</span>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {c.inactive ? (
                            <Badge tone="danger" dot pulse>
                              Contribuabil INACTIV
                            </Badge>
                          ) : (
                            <Badge tone="success" dot>
                              Activ
                            </Badge>
                          )}
                          <Badge tone={c.vatPayer ? "success" : "neutral"}>{c.vatPayer ? "Plătitor TVA" : "Neplătitor TVA"}</Badge>
                          {c.vatOnCollection && <Badge tone="warning">TVA la încasare</Badge>}
                          {c.splitVat && <Badge tone="warning">Split TVA</Badge>}
                          <Badge tone={c.eInvoiceRegistered ? "brand" : "neutral"}>{c.eInvoiceRegistered ? "Registrul RO e-Factura" : "Neînscris RO e-Factura"}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                      {isClient ? (
                        <Button variant="outline" onClick={() => router.push("/clienti")}>
                          <BadgeCheck className="text-success" /> Este client
                        </Button>
                      ) : (
                        <Button onClick={() => addPartner("client")} loading={save.pending} disabled={save.pending}>
                          {!save.pending && <UserPlus />} Adaugă ca client
                        </Button>
                      )}
                      {isSupplier ? (
                        <Button variant="outline" onClick={() => router.push("/furnizori")}>
                          <BadgeCheck className="text-success" /> Este furnizor
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => addPartner("supplier")} disabled={save.pending}>
                          <Truck /> Adaugă ca furnizor
                        </Button>
                      )}
                    </div>
                  </div>
                  {c.inactive && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-foreground">
                      <Ban className="mt-0.5 size-4 shrink-0" />
                      Firma este declarată inactivă fiscal: TVA-ul din facturile emise de aceasta nu este deductibil, iar cheltuielile nu sunt deductibile la calculul
                      impozitului pe profit.
                    </p>
                  )}
                </div>

                <CardContent className="space-y-6 p-5 sm:p-6">
                  <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StaggerItem>
                      <Flag ok={c.vatPayer} label="Scop TVA (art. 316)" onLabel="Înregistrat" offLabel="Neînregistrat" icon={<Percent />} />
                    </StaggerItem>
                    <StaggerItem>
                      <Flag ok={c.vatOnCollection} warn label="TVA la încasare" onLabel="Aplică" offLabel="Nu aplică" icon={<Landmark />} />
                    </StaggerItem>
                    <StaggerItem>
                      <Flag ok={c.splitVat} warn label="Split TVA" onLabel="Da" offLabel="Nu" icon={<Split />} />
                    </StaggerItem>
                    <StaggerItem>
                      <Flag ok={c.eInvoiceRegistered} label="RO e-Factura" onLabel="Înscris în registru" offLabel="Neînscris" icon={<FileCheck2 />} />
                    </StaggerItem>
                  </Stagger>

                  <div className="grid gap-x-8 sm:grid-cols-2">
                    <div className="divide-y divide-border">
                      <DetailRow label="Adresă sediu">{c.address ?? "—"}</DetailRow>
                      <DetailRow label="Localitate / județ">{[c.city, c.county ? countyName(c.county) : null].filter(Boolean).join(", ") || "—"}</DetailRow>
                      <DetailRow label="Cod poștal">{c.postalCode ?? "—"}</DetailRow>
                      <DetailRow label="Telefon">{c.phone ?? "—"}</DetailRow>
                      <DetailRow label="IBAN">{c.iban ? <span className="font-mono text-xs">{c.iban}</span> : "—"}</DetailRow>
                    </div>
                    <div className="divide-y divide-border">
                      <DetailRow label="Cod CAEN">{c.caen ?? "—"}</DetailRow>
                      <DetailRow label="Formă juridică">{c.legalForm ?? "—"}</DetailRow>
                      <DetailRow label="Stare înregistrare">{c.registrationStatus ?? "—"}</DetailRow>
                      <DetailRow label="Data înregistrării">{c.registrationDate ? formatDate(c.registrationDate) : "—"}</DetailRow>
                      <DetailRow label="Organ fiscal">{c.fiscalOffice ?? "—"}</DetailRow>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sursa: ANAF — Registrul contribuabililor plătitori de TVA (serviciu public), interogat la {formatDateTime(result.checkedAt)}.
                    {result.existing && ` În nomenclator: ${result.existing.name}.`}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card>
                <EmptyState
                  icon={<Building2 />}
                  title="Introdu un CUI pentru a vedea fișa firmei"
                  description="Denumire, adresă, Reg. Com., CAEN, statusul TVA, TVA la încasare, split TVA, inactivitate și înscrierea în registrul RO e-Factura — direct de la ANAF."
                />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">De ce verifici partenerii?</p>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              {[
                "Facturile de la contribuabili inactivi nu dau drept de deducere a TVA.",
                "Pentru clienții cu TVA la încasare, exigibilitatea TVA apare la plată.",
                "Statusul e-Factura arată dacă partenerul primește facturile prin SPV.",
                "Datele corecte (CUI, adresă, județ) evită respingerea facturilor în e-Factura.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {recent.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="mb-2 text-sm font-semibold">Verificări recente</p>
              <ul className="space-y-1">
                {recent.map((r) => (
                  <li key={r.cui}>
                    <button
                      type="button"
                      onClick={() => {
                        setCui(r.cui);
                        lookup(r.cui);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.cui}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
