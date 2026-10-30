"use client";

import { ArrowRight, CircleCheck, FilePen, Plus, ShieldCheck, TriangleAlert, Truck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { CopyButton } from "@/components/anaf/copy-button";
import { ETRANSPORT_STATUS, etransportValidity } from "@/components/anaf/utils";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { ETRANSPORT_OPERATIONS } from "@/lib/anaf/etransport";
import { countyName } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export type DeclarationRow = {
  id: string;
  status: string;
  operationType: string;
  uit: string | null;
  partnerName: string | null;
  vehicleNumber: string | null;
  trailer1: string | null;
  transportDate: string;
  startCounty: string | null;
  startCity: string | null;
  endCounty: string | null;
  endCity: string | null;
  documentNumber: string | null;
  message: string | null;
  itemsCount: number;
  valueRon: number;
  grossWeight: number;
};

export function formatUit(uit: string) {
  return uit.replace(/(.{4})(?=.)/g, "$1 ");
}

function Place({ city, county }: { city: string | null; county: string | null }) {
  return (
    <span className="min-w-0 truncate">
      {city || "—"}
      {county && <span className="text-muted-foreground"> ({county === "B" ? "B" : countyName(county)})</span>}
    </span>
  );
}

export function EtransportList({ rows, today }: { rows: DeclarationRow[]; today: string }) {
  const stats = React.useMemo(() => {
    const active = rows.filter((r) => ["ok", "pending"].includes(r.status) && !etransportValidity(r.transportDate, r.operationType, today).expired);
    return {
      total: rows.length,
      active: active.length,
      drafts: rows.filter((r) => r.status === "draft").length,
      errors: rows.filter((r) => r.status === "nok" || r.status === "error").length,
      value: rows.filter((r) => r.status === "ok").reduce((s, r) => s + r.valueRon, 0),
    };
  }, [rows, today]);

  const columns: Column<DeclarationRow>[] = [
    {
      key: "uit",
      header: "Cod UIT",
      sortValue: (r) => r.uit ?? "",
      csv: (r) => r.uit ?? "",
      cell: (r) =>
        r.uit ? (
          <div className="flex items-center gap-1">
            <span className="rounded-lg border border-primary/20 bg-primary-soft/50 px-2 py-1 font-mono text-[13px] font-semibold tracking-wider whitespace-nowrap text-primary-soft-foreground">
              {formatUit(r.uit)}
            </span>
            <CopyButton value={r.uit} tooltip="Copiază UIT" toastMessage={`UIT ${r.uit} copiat`} />
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FilePen className="size-3.5" /> fără UIT (ciornă)
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      csv: (r) => ETRANSPORT_STATUS[r.status]?.label ?? r.status,
      cell: (r) => {
        const v = etransportValidity(r.transportDate, r.operationType, today);
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={r.status} map={ETRANSPORT_STATUS} pulse={r.status === "pending"} />
            {r.uit && ["ok", "pending"].includes(r.status) && (
              <span className={v.expired ? "text-[11px] text-muted-foreground" : "text-[11px] text-success-soft-foreground"}>
                {v.expired ? "UIT expirat" : v.notStarted ? `valabil din ${formatDate(v.start)}` : `valabil încă ${v.remaining + 1} ${v.remaining === 0 ? "zi" : "zile"}`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "date",
      header: "Data transport",
      sortValue: (r) => r.transportDate,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.transportDate)}</span>,
    },
    {
      key: "partner",
      header: "Partener",
      sortValue: (r) => r.partnerName ?? "",
      cell: (r) => (
        <div className="max-w-52 min-w-0">
          <p className="truncate font-medium">{r.partnerName ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{ETRANSPORT_OPERATIONS[r.operationType] ?? r.operationType}</p>
        </div>
      ),
    },
    {
      key: "route",
      header: "Traseu și vehicul",
      hideOnMobile: true,
      sortValue: (r) => r.vehicleNumber ?? "",
      csv: (r) => `${r.startCity ?? ""} → ${r.endCity ?? ""} (${r.vehicleNumber ?? ""})`,
      cell: (r) => (
        <div className="max-w-64 space-y-1">
          <div className="flex items-center gap-1.5 text-[13px]">
            <Place city={r.startCity} county={r.startCounty} />
            <ArrowRight className="size-3.5 shrink-0 text-primary" />
            <Place city={r.endCity} county={r.endCounty} />
          </div>
          {r.vehicleNumber && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold">
              <span className="h-2.5 w-1 rounded-sm bg-info" />
              {r.vehicleNumber}
              {r.trailer1 && <span className="font-normal text-muted-foreground">+ {r.trailer1}</span>}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "value",
      header: "Valoare",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.valueRon,
      cell: (r) => (
        <div>
          <p className="font-medium whitespace-nowrap">{formatMoney(r.valueRon)}</p>
          <p className="text-[11px] whitespace-nowrap text-muted-foreground">
            {r.itemsCount} {r.itemsCount === 1 ? "articol" : "articole"} · {formatNumber(r.grossWeight)} kg
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Declarații" value={stats.total} format="number" icon={<Truck />} hint={`${formatMoney(stats.value).replace(/,\d{2}(?=\s)/, "")} marfă confirmată`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="UIT-uri valabile acum" value={stats.active} format="number" tone="success" icon={<ShieldCheck />} hint="transporturi în desfășurare" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ciorne" value={stats.drafts} format="number" tone="info" icon={<FilePen />} hint="de completat și declarat" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Respinse / erori"
            value={stats.errors}
            format="number"
            tone={stats.errors ? "danger" : "success"}
            icon={stats.errors ? <TriangleAlert /> : <CircleCheck />}
            hint={stats.errors ? "corectează și declară din nou" : "nicio declarație respinsă"}
          />
        </StaggerItem>
      </Stagger>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        rowHref={(r) => `/etransport/${r.id}`}
        search={(r) => `${r.uit ?? ""} ${r.partnerName ?? ""} ${r.vehicleNumber ?? ""} ${r.startCity ?? ""} ${r.endCity ?? ""} ${r.documentNumber ?? ""}`}
        searchPlaceholder="Caută UIT, partener, vehicul, localitate…"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "draft", label: "Ciorne" },
              { value: "pending", label: "În prelucrare" },
              { value: "ok", label: "Confirmate" },
              { value: "err", label: "Respinse / erori" },
            ],
            predicate: (r, v) => (v === "err" ? ["nok", "error"].includes(r.status) : r.status === v),
          },
        ]}
        csvFilename="etransport-declaratii"
        defaultSort={{ key: "date", dir: "desc" }}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Truck />}
              title="Nicio declarație e-Transport"
              description="Declară transporturile de bunuri cu risc fiscal ridicat și primește codul UIT în câteva secunde. Poți porni direct dintr-o factură sau un aviz."
              action={
                <Button asChild>
                  <Link href="/etransport/nou">
                    <Plus /> Declarație nouă
                  </Link>
                </Button>
              }
            />
          ) : undefined
        }
      />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Badge tone="info">Info</Badge>
        Codul UIT este valabil 5 zile calendaristice de la data transportului declarată pentru transporturile naționale și 15 zile pentru operațiunile
        intracomunitare și import. Transportatorul trebuie să aibă UIT-ul la bord pe toată durata transportului.
      </p>
    </div>
  );
}
