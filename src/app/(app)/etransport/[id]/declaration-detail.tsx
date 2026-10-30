"use client";

import {
  CalendarClock,
  CircleCheck,
  Copy,
  FilePen,
  FileText,
  Hourglass,
  MapPin,
  MoreHorizontal,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/anaf/copy-button";
import { ETRANSPORT_STATUS, etransportValidity } from "@/components/anaf/utils";
import { XmlViewer } from "@/components/anaf/xml-viewer";
import { EASE_OUT, FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailRow } from "@/components/ui/page";
import { useAction } from "@/hooks/use-action";
import { ETRANSPORT_OPERATIONS, ETRANSPORT_PURPOSES } from "@/lib/anaf/etransport";
import { countyName, UNITS } from "@/lib/constants";
import type { EtransportDeclaration } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { cn, sum } from "@/lib/utils";
import { declareEtransportAction, deleteEtransportAction, duplicateEtransportAction, refreshEtransportStatusAction } from "../actions";
import { formatUit } from "../etransport-list";

type Decl = Omit<EtransportDeclaration, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

const editable = (status: string) => ["draft", "error", "nok"].includes(status);

/** Acțiunile din antet: editare, duplicare, ștergere. */
export function DeclarationActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <>
      {editable(status) && (
        <Button variant="outline" asChild>
          <Link href={`/etransport/${id}/editeaza`}>
            <FilePen /> Editează
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Mai multe acțiuni" loading={pending}>
            {!pending && <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => run(() => duplicateEtransportAction(id), { onSuccess: (r) => router.push(`/etransport/${r.id}/editeaza`) })}>
            <Copy /> Duplică (traseu recurent)
          </DropdownMenuItem>
          {["draft", "error"].includes(status) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
                <Trash2 /> Șterge declarația
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Ștergi declarația?"
        description="Declarația nu a fost confirmată de ANAF și va fi ștearsă definitiv."
        confirmLabel="Șterge"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) =>
            run(() => deleteEtransportAction(id), {
              onSuccess: () => {
                resolve();
                router.push("/etransport");
              },
              onError: () => resolve(),
            }),
          )
        }
      />
    </>
  );
}

function UitHero({ decl, today }: { decl: Decl; today: string }) {
  const status = useAction();
  const declare = useAction();
  const v = etransportValidity(decl.transportDate, decl.operationType, today);
  const live = decl.uit && ["ok", "pending"].includes(decl.status);
  const barColor = !live ? "var(--muted-foreground)" : v.expired ? "var(--muted-foreground)" : v.remaining <= 1 ? "var(--warning)" : "var(--success)";

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
      <div className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={decl.status} map={ETRANSPORT_STATUS} pulse={decl.status === "pending"} />
            <Badge tone="neutral">Operațiune {decl.operationType}</Badge>
          </div>
          <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Cod unic de identificare (UIT)</p>
          {decl.uit ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <motion.p
                initial={{ opacity: 0, letterSpacing: "0.4em" }}
                animate={{ opacity: 1, letterSpacing: "0.12em" }}
                transition={{ duration: 0.7, ease: EASE_OUT }}
                className="font-mono text-3xl font-bold break-all text-foreground sm:text-4xl"
              >
                {formatUit(decl.uit)}
              </motion.p>
              <CopyButton value={decl.uit} variant="outline" size="sm" label="Copiază" toastMessage={`UIT ${decl.uit} copiat`} />
            </div>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">Netransmisă — fără UIT</p>
          )}
          <p className="mt-3 text-[13px] text-muted-foreground">
            {decl.uploadId ? (
              <>
                Index încărcare <span className="font-mono text-foreground">{decl.uploadId}</span> · actualizată {formatDateTime(decl.updatedAt)}
              </>
            ) : (
              "Completează declarația și transmite-o pentru a primi codul UIT."
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {decl.uploadId && (
              <Button
                variant="outline"
                loading={status.pending}
                onClick={() =>
                  status.run(() => refreshEtransportStatusAction(decl.id), {
                    onSuccess: (r) =>
                      r.state === "ok"
                        ? toast.success("Declarația a fost confirmată de ANAF")
                        : r.state === "pending"
                          ? toast.info("Declarația este încă în prelucrare la ANAF")
                          : toast.error(`ANAF: ${r.message ?? "declarație respinsă"}`),
                  })
                }
              >
                {!status.pending && <RefreshCw />} Verifică statusul
              </Button>
            )}
            {editable(decl.status) && (
              <Button
                variant="gradient"
                loading={declare.pending}
                onClick={() =>
                  declare.run(() => declareEtransportAction(decl.id), {
                    onSuccess: (r) => toast.success("Transport declarat la ANAF", { description: r.uit ? `Cod UIT: ${r.uit}` : undefined }),
                  })
                }
              >
                {!declare.pending && <Send />} {decl.status === "draft" ? "Declară la ANAF" : "Declară din nou"}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-primary" /> Valabilitate UIT
          </p>
          <p className="mt-3 text-2xl font-semibold tabular">
            {!live ? "—" : v.expired ? "Expirat" : v.notStarted ? `din ${formatDate(v.start)}` : `${v.remaining + 1} ${v.remaining === 0 ? "zi rămasă" : "zile rămase"}`}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: barColor }}
              initial={{ width: 0 }}
              animate={{ width: live ? `${v.expired ? 100 : v.progress}%` : "0%" }}
              transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
            <span>{formatDate(v.start)}</span>
            <span>{formatDate(v.end)}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {decl.operationType === "30"
              ? "Pentru transportul pe teritoriul național, UIT-ul este valabil 5 zile calendaristice de la data transportului declarată."
              : "Pentru operațiunile intracomunitare și import, UIT-ul este valabil 15 zile calendaristice de la data transportului declarată."}
          </p>
        </div>
      </div>
    </Card>
  );
}

function RouteCard({ decl }: { decl: Decl }) {
  const place = (county: string | null, city: string | null, address: string | null) => (
    <>
      <p className="font-semibold">{city || "—"}</p>
      <p className="text-[13px] text-muted-foreground">{[address, county ? countyName(county) : null].filter(Boolean).join(", ") || "—"}</p>
    </>
  );
  return (
    <Card>
      <CardHeaderRow icon={<MapPin />} title="Traseu" />
      <CardContent>
        <ol className="relative space-y-6 pl-8">
          <div className="absolute top-2 bottom-2 left-[11px] w-0.5 overflow-hidden rounded-full bg-border">
            <motion.div
              className="w-full bg-gradient-to-b from-primary to-success"
              initial={{ height: 0 }}
              animate={{ height: "100%" }}
              transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
            />
          </div>
          <li className="relative">
            <span className="absolute top-0.5 -left-8 grid size-6 place-items-center rounded-full bg-primary text-white ring-4 ring-card">
              <span className="size-2 rounded-full bg-white" />
            </span>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Plecare</p>
            {place(decl.startCounty, decl.startCity, decl.startAddress)}
          </li>
          <li className="relative">
            <span className="absolute top-0.5 -left-8 grid size-6 place-items-center rounded-full bg-success text-white ring-4 ring-card">
              <MapPin className="size-3.5" />
            </span>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Destinație</p>
            {place(decl.endCounty, decl.endCity, decl.endAddress)}
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

export function DeclarationDetail({
  decl,
  partnerCui,
  documentHref,
  xmlIsPreview,
  today,
}: {
  decl: Decl;
  partnerCui: string | null;
  documentHref: string | null;
  xmlIsPreview: boolean;
  today: string;
}) {
  const unitLabel = (code: string) => UNITS.find((u) => u.code === code)?.label ?? code;
  const totals = { net: sum(decl.items, (i) => i.netWeight), gross: sum(decl.items, (i) => i.grossWeight), value: sum(decl.items, (i) => i.valueRon) };

  return (
    <div className="space-y-6">
      <FadeIn>
        <UitHero decl={decl} today={today} />
      </FadeIn>

      {decl.message && ["error", "nok"].includes(decl.status) && (
        <FadeIn delay={0.1}>
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft/60 p-4">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="font-semibold text-danger-soft-foreground">Mesaj ANAF</p>
              <p className="mt-1 text-sm break-words whitespace-pre-line text-danger-soft-foreground">{decl.message}</p>
            </div>
          </div>
        </FadeIn>
      )}

      <Stagger className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StaggerItem>
          <RouteCard decl={decl} />
        </StaggerItem>
        <StaggerItem>
          <Card className="h-full">
            <CardHeaderRow icon={<Truck />} title="Transport" />
            <CardContent className="divide-y divide-border">
              <DetailRow label="Data transportului">{formatDate(decl.transportDate)}</DetailRow>
              <DetailRow label="Vehicul">
                {decl.vehicleNumber ? <span className="font-mono">{decl.vehicleNumber}</span> : "—"}
                {decl.trailer1 && <span className="block font-mono text-xs text-muted-foreground">remorcă {decl.trailer1}</span>}
              </DetailRow>
              <DetailRow label="Transportator">
                {decl.carrierName ?? "—"}
                {decl.carrierCui && <span className="block font-mono text-xs text-muted-foreground">{decl.carrierCui}</span>}
              </DetailRow>
              <DetailRow label="Operațiune">{ETRANSPORT_OPERATIONS[decl.operationType] ?? decl.operationType}</DetailRow>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="h-full">
            <CardHeaderRow icon={<FileText />} title="Partener și document" />
            <CardContent className="divide-y divide-border">
              <DetailRow label="Partener">
                {decl.partnerName ?? "—"}
                {partnerCui && <span className="block font-mono text-xs text-muted-foreground">{partnerCui}</span>}
              </DetailRow>
              <DetailRow label="Document">
                {documentHref ? (
                  <Link href={documentHref} className="text-primary hover:underline">
                    {decl.documentNumber ?? "deschide"}
                  </Link>
                ) : (
                  (decl.documentNumber ?? "—")
                )}
              </DetailRow>
              <DetailRow label="Creată">{formatDateTime(decl.createdAt)}</DetailRow>
              <DetailRow label="Status">
                <span className="inline-flex items-center gap-1.5">
                  {decl.status === "ok" ? <CircleCheck className="size-4 text-success" /> : decl.status === "pending" ? <Hourglass className="size-4 text-warning" /> : <ShieldCheck className="size-4 text-muted-foreground" />}
                  {ETRANSPORT_STATUS[decl.status]?.label ?? decl.status}
                </span>
              </DetailRow>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>

      <Card className="overflow-hidden">
        <CardHeaderRow icon={<Package />} title="Bunuri transportate" description={`${decl.items.length} ${decl.items.length === 1 ? "articol" : "articole"}`} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-subtle/60 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-2 text-left">Denumire</th>
                <th className="px-3 py-2 text-left">Cod NC</th>
                <th className="px-3 py-2 text-right">Cantitate</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">Netă</th>
                <th className="px-3 py-2 text-right">Brută</th>
                <th className="px-3 py-2 text-right">Valoare</th>
                <th className="hidden px-5 py-2 text-left lg:table-cell">Scop</th>
              </tr>
            </thead>
            <tbody>
              {decl.items.map((it, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{it.name || "—"}</td>
                  <td className="px-3 py-3 font-mono text-xs">{it.ncCode || <span className={cn("text-danger")}>lipsă</span>}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular">
                    {formatNumber(it.quantity)} <span className="text-muted-foreground">{unitLabel(it.unitCode)}</span>
                  </td>
                  <td className="hidden px-3 py-3 text-right whitespace-nowrap tabular md:table-cell">{formatNumber(it.netWeight)} kg</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular">{formatNumber(it.grossWeight)} kg</td>
                  <td className="px-3 py-3 text-right font-medium whitespace-nowrap tabular">{formatMoney(it.valueRon)}</td>
                  <td className="hidden px-5 py-3 text-[13px] text-muted-foreground lg:table-cell">{ETRANSPORT_PURPOSES[it.purposeCode] ?? it.purposeCode}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-subtle/60 font-semibold">
                <td className="px-5 py-3" colSpan={3}>
                  Total
                </td>
                <td className="hidden px-3 py-3 text-right tabular md:table-cell">{formatNumber(totals.net)} kg</td>
                <td className="px-3 py-3 text-right tabular">{formatNumber(totals.gross)} kg</td>
                <td className="px-3 py-3 text-right tabular">{formatMoney(totals.value)}</td>
                <td className="hidden lg:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {decl.xml && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            XML declarație
            {xmlIsPreview && <Badge tone="info">{decl.status === "draft" ? "Previzualizare — netransmis" : "Reconstituit din datele declarației"}</Badge>}
          </p>
          <XmlViewer xml={decl.xml} filename={`etransport_${decl.uit ?? decl.id.slice(0, 8)}.xml`} maxHeight="max-h-96" />
        </div>
      )}
    </div>
  );
}
