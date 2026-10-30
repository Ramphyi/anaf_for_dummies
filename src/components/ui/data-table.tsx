"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { cn, toCsv } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Valoare pentru sortare; dacă lipsește, coloana nu se poate sorta. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Valoare pentru exportul CSV (implicit sortValue). */
  csv?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
};

export type TableFilter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  predicate: (row: T, value: string) => boolean;
};

/**
 * Tabel generic: căutare, filtre rapide (pastile), sortare, paginare, export CSV, rând clickabil.
 * Se folosește dintr-un client component care definește coloanele.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  search,
  searchPlaceholder = "Caută…",
  filters,
  rowHref,
  onRowClick,
  pageSize = 15,
  toolbar,
  empty,
  csvFilename,
  footer,
  defaultSort,
  defaultFilters,
  className,
  dense,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  search?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<T>[];
  rowHref?: (row: T) => string | null;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
  csvFilename?: string;
  footer?: (rows: T[]) => React.ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Valori inițiale pentru filtre (ex. din query string): { status: "overdue" } */
  defaultFilters?: Record<string, string>;
  className?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<Record<string, string>>(defaultFilters ?? {});
  const [sort, setSort] = React.useState(defaultSort ?? null);
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    let out = rows;
    if (q && search) {
      out = out.filter((r) =>
        search(r)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(q),
      );
    }
    for (const f of filters ?? []) {
      const v = active[f.key];
      if (v) out = out.filter((r) => f.predicate(r, v));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = [...out].sort((a, b) => {
          const x = sv(a) ?? "";
          const y = sv(b) ?? "";
          const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ro", { numeric: true });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, search, filters, active, sort, columns]);

  React.useEffect(() => setPage(0), [query, active, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  };

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv || c.sortValue);
    const data = filtered.map((r) => Object.fromEntries(cols.map((c) => [c.key, (c.csv ?? c.sortValue)!(r)])));
    const csv = toCsv(
      data,
      cols.map((c) => ({ key: c.key, label: typeof c.header === "string" ? c.header : c.key })),
    );
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clickable = !!rowHref || !!onRowClick;
  const hasFilters = query || Object.values(active).some(Boolean);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-soft", className)}>
      {(search || filters?.length || toolbar || csvFilename) && (
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
          {search && (
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-9" />
              {query && (
                <button onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {filters?.map((f) => (
            <div key={f.key} className="scrollbar-thin flex items-center gap-1 overflow-x-auto">
              <span className="mr-1 shrink-0 text-xs text-muted-foreground">{f.label}:</span>
              {[{ value: "", label: "Toate" }, ...f.options].map((o) => (
                <button
                  key={o.value}
                  onClick={() => setActive((a) => ({ ...a, [f.key]: o.value }))}
                  className={cn(
                    "h-7 shrink-0 rounded-full px-2.5 text-xs font-medium transition-all",
                    (active[f.key] ?? "") === o.value
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-2 lg:ml-auto">
            {hasFilters && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setQuery("");
                  setActive({});
                }}
              >
                <X /> Resetează
              </Button>
            )}
            {csvFilename && (
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download /> CSV
              </Button>
            )}
            {toolbar}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        (empty ?? <EmptyState compact icon={<Search />} title="Niciun rezultat" description="Modifică filtrele sau termenul de căutare." />)
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-subtle/50">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "h-10 px-3 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase first:pl-5 last:pr-5",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.hideOnMobile && "hidden md:table-cell",
                      c.headerClassName,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={cn("inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground", sort?.key === c.key && "text-foreground")}
                      >
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody key={`${page}-${sort?.key}-${sort?.dir}`}>
              {current.map((row, i) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={getRowId(row)}
                    onClick={() => (href ? router.push(href) : onRowClick?.(row))}
                    style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                    className={cn(
                      "anim-fade-up border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                      clickable && "cursor-pointer",
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 align-middle first:pl-5 last:pr-5",
                          dense ? "py-2" : "py-3",
                          c.align === "right" ? "text-right tabular" : c.align === "center" ? "text-center" : "text-left",
                          c.hideOnMobile && "hidden md:table-cell",
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {footer && <tfoot className="border-t border-border bg-subtle/60 font-medium">{footer(filtered)}</tfoot>}
          </table>
        </div>
      )}

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} din {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft />
            </Button>
            {Array.from({ length: pages }, (_, i) => i)
              .filter((i) => i === 0 || i === pages - 1 || Math.abs(i - page) <= 1)
              .map((i, idx, arr) => (
                <React.Fragment key={i}>
                  {idx > 0 && i - arr[idx - 1] > 1 && <span className="px-1">…</span>}
                  <button
                    onClick={() => setPage(i)}
                    className={cn(
                      "size-7 rounded-md text-xs font-medium transition-colors",
                      i === page ? "bg-foreground text-background" : "hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {i + 1}
                  </button>
                </React.Fragment>
              ))}
            <Button variant="ghost" size="icon-xs" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
