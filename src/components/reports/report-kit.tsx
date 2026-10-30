"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";
import * as React from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, toCsv } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Export CSV (separator „;”, BOM pentru Excel cu diacritice)          */
/* ------------------------------------------------------------------ */

export type CsvColumn = { key: string; label: string };
export type CsvExport = { label: string; filename: string; columns: CsvColumn[]; rows: Record<string, unknown>[] };

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: CsvColumn[]) {
  const csv = toCsv(rows, columns);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Buton CSV — un singur export sau meniu cu mai multe secțiuni. */
export function ExportMenu({ exports }: { exports: CsvExport[] }) {
  const available = exports.filter((e) => e.rows.length);
  if (exports.length <= 1) {
    const e = exports[0];
    return (
      <Button variant="outline" size="sm" disabled={!e?.rows.length} onClick={() => e && downloadCsv(e.filename, e.rows, e.columns)}>
        <Download /> CSV
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!available.length}>
          <Download /> CSV
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Exportă în CSV (Excel)</DropdownMenuLabel>
        {exports.map((e) => (
          <DropdownMenuItem key={e.filename} disabled={!e.rows.length} onSelect={() => downloadCsv(e.filename, e.rows, e.columns)}>
            <FileSpreadsheet />
            <span className="flex-1">{e.label}</span>
            <span className="text-xs text-muted-foreground tabular">{e.rows.length}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

const PrintCtx = React.createContext(false);

/** Ține evidența modului de tipărire, ca tabelele să randeze toate rândurile (fără paginare). */
export function PrintProvider({ children }: { children: React.ReactNode }) {
  const [printing, setPrinting] = React.useState(false);
  React.useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return <PrintCtx.Provider value={printing}>{children}</PrintCtx.Provider>;
}

export const usePrinting = () => React.useContext(PrintCtx);

export function PrintButton({ label = "Tipărește" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer /> <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

/**
 * DataTable pe ecran + tabel complet (toate rândurile) la tipărire.
 * Primește aceleași props ca DataTable.
 */
export function ReportTable<T>(props: React.ComponentProps<typeof DataTable<T>> & { printTitle?: string }) {
  const printing = usePrinting();
  const { printTitle, ...rest } = props;
  return (
    <>
      <div className="print:hidden">
        <DataTable<T> {...rest} />
      </div>
      {printing && <PrintTable title={printTitle} rows={rest.rows} columns={rest.columns} getRowId={rest.getRowId} footer={rest.footer} />}
    </>
  );
}

function PrintTable<T>({
  title,
  rows,
  columns,
  getRowId,
  footer,
}: {
  title?: string;
  rows: T[];
  columns: Column<T>[];
  getRowId: (r: T) => string;
  footer?: (rows: T[]) => React.ReactNode;
}) {
  return (
    <div className="hidden print:block">
      {title && <h3 className="mb-2 text-sm font-semibold">{title}</h3>}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-1.5 py-1 font-semibold", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.headerClassName)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={getRowId(r)} className="border-b border-border/60 break-inside-avoid">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-1.5 py-1 align-top", c.align === "right" ? "text-right tabular" : c.align === "center" ? "text-center" : "text-left", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t border-border font-semibold">{footer(rows)}</tfoot>}
      </table>
    </div>
  );
}

/** Rând de total pentru footer-ul tabelelor (TD-uri aliniate cu coloanele). */
export function TotalCell({ children, align = "right", className }: { children?: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-sm first:pl-5 last:pr-5", align === "right" ? "text-right tabular" : "text-left", className)}>{children}</td>;
}
