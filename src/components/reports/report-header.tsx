import * as React from "react";
import { PageHeader } from "@/components/ui/page";
import { formatDateTime } from "@/lib/format";
import { PeriodPicker } from "./period-picker";
import { PrintButton } from "./report-kit";
import type { Period } from "@/lib/reports/period";

/**
 * Antetul unui raport: titlu + breadcrumbs, selector de perioadă, export, tipărire.
 * La tipărire apare un antet cu firma, perioada și momentul generării.
 */
export function ReportHeader({
  title,
  description,
  icon,
  period,
  actions,
  company,
  printNote,
  hidePeriod,
}: {
  title: string;
  description?: React.ReactNode;
  icon: React.ReactNode;
  period?: Period;
  actions?: React.ReactNode;
  company: { name: string; cui: string };
  printNote?: React.ReactNode;
  hidePeriod?: boolean;
}) {
  return (
    <>
      <div className="mb-4 hidden border-b border-border pb-3 print:block">
        <div className="flex items-end justify-between gap-4 text-xs">
          <div>
            <div className="text-sm font-semibold">{company.name}</div>
            <div className="text-muted-foreground">CUI {company.cui}</div>
          </div>
          <div className="text-right text-muted-foreground">
            {period && <div className="font-medium text-foreground">Perioada: {period.label.split(" · ").at(-1)}</div>}
            {printNote && <div>{printNote}</div>}
            <div>Generat la {formatDateTime(new Date())} · AND · ANAF for Dummies</div>
          </div>
        </div>
      </div>
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        breadcrumbs={[{ label: "Rapoarte", href: "/rapoarte" }, { label: title }]}
        className="print:mb-4"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end lg:flex-nowrap print:hidden">
            {period && !hidePeriod && <PeriodPicker from={period.from} to={period.to} preset={period.preset} />}
            {actions}
            <PrintButton />
          </div>
        }
      />
    </>
  );
}
