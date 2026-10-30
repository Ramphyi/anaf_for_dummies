"use client";

import { Archive, ArchiveRestore, Boxes, Copy, MoreHorizontal, Package, Pencil, Plus, ScrollText, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { UNITS } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";
import { setProductActiveAction } from "@/lib/products/actions";
import { STOCK_STATE_LABELS, stockState } from "@/lib/products/schema";
import { cn, round2 } from "@/lib/utils";
import { ProductDialog, type ProductLike } from "./product-dialog";

export type ProductRow = ProductLike & {
  stock: number | null; // null = fără gestiune de stoc
  stockValue: number;
  stockByWarehouse: { name: string; quantity: number }[];
};

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** Sincronizează URL-ul (?nou=1 / ?id=…) fără reîncărcarea paginii. */
function setUrl(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.pathname + url.search);
}

export function ProductsView({
  rows,
  initial,
  kpis,
}: {
  rows: ProductRow[];
  initial: { mode: "new" } | { mode: "edit"; id: string } | null;
  kpis?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [product, setProduct] = React.useState<ProductLike | null>(null);
  const [template, setTemplate] = React.useState<ProductLike | null>(null);
  const { run } = useAction();
  const categories = React.useMemo(() => [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ro")), [rows]);

  const openNew = React.useCallback((tpl?: ProductLike) => {
    setProduct(null);
    setTemplate(tpl ?? null);
    setOpen(true);
    setUrl({ nou: "1", id: null });
  }, []);
  const openEdit = React.useCallback((p: ProductLike) => {
    setTemplate(null);
    setProduct(p);
    setOpen(true);
    setUrl({ id: p.id, nou: null });
  }, []);
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setUrl({ id: null, nou: null });
  };

  // deschidere din URL: ?nou=1 sau ?id=<produs> (ex. din căutarea globală)
  const initialKey = initial ? (initial.mode === "new" ? "new" : initial.id) : "";
  React.useEffect(() => {
    if (!initial) return;
    if (initial.mode === "new") openNew();
    else {
      const p = rows.find((r) => r.id === initial.id);
      if (p) openEdit(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const columns: Column<ProductRow>[] = [
    {
      key: "code",
      header: "Cod",
      hideOnMobile: true,
      sortValue: (r) => r.code ?? "",
      cell: (r) => (r.code ? <span className="font-mono text-[12.5px] text-muted-foreground">{r.code}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "name",
      header: "Denumire",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4", r.type === "product" ? "bg-primary-soft text-primary-soft-foreground" : "bg-info-soft text-info-soft-foreground")}>
            {r.type === "product" ? <Package /> : <Wrench />}
          </span>
          <div className="min-w-0">
            <div className={cn("max-w-[18rem] truncate font-medium", !r.active && "text-muted-foreground line-through decoration-muted-foreground/40")}>{r.name}</div>
            <div className="max-w-[18rem] truncate text-xs text-muted-foreground">{r.description || (r.type === "product" ? "Produs" : "Serviciu")}</div>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Tip", cell: () => null, csv: (r) => (r.type === "product" ? "Produs" : "Serviciu"), className: "hidden", headerClassName: "hidden" },
    { key: "unit", header: "UM", hideOnMobile: true, sortValue: (r) => r.unit, cell: (r) => unitLabel(r.unit) },
    {
      key: "price",
      header: "Preț",
      align: "right",
      sortValue: (r) => r.price,
      csv: (r) => r.price,
      cell: (r) => {
        const rate = r.vatCategory === "S" ? r.vatRate : 0;
        return (
          <div>
            <div className="font-medium">{formatMoney(r.price, r.currency)}</div>
            <div className="text-xs text-muted-foreground">{formatMoney(round2(r.price * (1 + rate / 100)), r.currency)} cu TVA</div>
          </div>
        );
      },
    },
    {
      key: "vat",
      header: "TVA",
      align: "center",
      hideOnMobile: true,
      sortValue: (r) => (r.vatCategory === "S" ? r.vatRate : -1),
      csv: (r) => (r.vatCategory === "S" ? `${r.vatRate}%` : r.vatCategory),
      cell: (r) => (r.vatCategory === "S" ? <span className="tabular">{r.vatRate}%</span> : <Badge>{r.vatCategory}</Badge>),
    },
    {
      key: "stock",
      header: "Stoc",
      align: "right",
      sortValue: (r) => (r.stock == null ? Number.NEGATIVE_INFINITY : r.stock),
      csv: (r) => r.stock ?? "",
      cell: (r) => {
        if (r.stock == null) return <span className="text-xs text-muted-foreground">{r.type === "service" ? "n/a" : "neurmărit"}</span>;
        const st = stockState(r.stock);
        const tip = r.stockByWarehouse.length ? (
          <div className="space-y-0.5">
            {r.stockByWarehouse.map((w) => (
              <div key={w.name} className="flex justify-between gap-4">
                <span>{w.name}</span>
                <span className="tabular">{formatNumber(w.quantity)}</span>
              </div>
            ))}
          </div>
        ) : (
          "Nicio mișcare de stoc"
        );
        return (
          <Tooltip content={tip}>
            <div className="inline-flex flex-col items-end">
              <span className={cn("font-medium tabular", st === "negative" && "text-danger", st === "low" && "text-warning", st === "out" && "text-muted-foreground")}>
                {formatNumber(r.stock)} {unitLabel(r.unit)}
              </span>
              {st !== "ok" ? (
                <Badge tone={STOCK_STATE_LABELS[st].tone} className="mt-0.5 px-1.5 text-[10.5px] leading-4">
                  {STOCK_STATE_LABELS[st].label}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{formatMoney(r.stockValue, "RON", { compact: true })}</span>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    { key: "category", header: "Categorie", hideOnMobile: true, sortValue: (r) => r.category ?? "", cell: (r) => (r.category ? <Badge>{r.category}</Badge> : <span className="text-muted-foreground">—</span>) },
    {
      key: "active",
      header: "Stare",
      hideOnMobile: true,
      sortValue: (r) => (r.active ? 1 : 0),
      csv: (r) => (r.active ? "Activ" : "Inactiv"),
      cell: (r) => (r.active ? <Badge tone="success" dot>Activ</Badge> : <Badge dot>Inactiv</Badge>),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Acțiuni">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => openEdit(r)}>
                <Pencil /> Editează
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openNew({ ...r, code: r.code ? `${r.code}-2` : null, name: `${r.name} (copie)` })}>
                <Copy /> Duplică
              </DropdownMenuItem>
              {r.trackStock && (
                <DropdownMenuItem asChild>
                  <Link href={`/stocuri?tab=fisa&produs=${r.id}`}>
                    <ScrollText /> Fișa magaziei
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {r.active ? (
                <DropdownMenuItem onSelect={() => run(() => setProductActiveAction(r.id, false), { refresh: true })}>
                  <Archive /> Dezactivează
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => run(() => setProductActiveAction(r.id, true), { refresh: true })}>
                  <ArchiveRestore /> Activează
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Produse & servicii"
        description="Nomenclatorul de articole: prețuri, cote TVA, coduri NC și stocuri."
        icon={<Package />}
        actions={
          <Button onClick={() => openNew()}>
            <Plus /> Produs nou
          </Button>
        }
      />
      {kpis}
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={openEdit}
        search={(r) => [r.code, r.name, r.description, r.category, r.barcode, r.ncCode].filter(Boolean).join(" ")}
        searchPlaceholder="Caută după cod, denumire, cod de bare…"
        filters={[
          {
            key: "type",
            label: "Tip",
            options: [
              { value: "product", label: "Produse" },
              { value: "service", label: "Servicii" },
            ],
            predicate: (r, v) => r.type === v,
          },
          ...(categories.length > 1 && categories.length <= 6
            ? [{ key: "category", label: "Categorie", options: categories.map((c) => ({ value: c, label: c })), predicate: (r: ProductRow, v: string) => r.category === v }]
            : []),
          {
            key: "state",
            label: "Stare",
            options: [
              { value: "alert", label: "Alerte stoc" },
              { value: "inactive", label: "Inactive" },
            ],
            predicate: (r, v) => (v === "inactive" ? !r.active : r.stock != null && stockState(r.stock) !== "ok"),
          },
        ]}
        csvFilename="produse"
        defaultSort={{ key: "name", dir: "asc" }}
        rowClassName={(r) => (!r.active ? "opacity-70" : undefined)}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Boxes />}
              title="Nomenclatorul e gol"
              description="Adaugă produsele și serviciile pe care le vinzi — le vei alege apoi rapid pe facturi."
              action={
                <Button onClick={() => openNew()}>
                  <Plus /> Produs nou
                </Button>
              }
            />
          ) : undefined
        }
      />
      <ProductDialog
        open={open}
        onOpenChange={onOpenChange}
        product={product}
        template={template}
        categories={categories}
        onSaved={() => router.refresh()}
        onDeleted={() => router.refresh()}
      />
    </>
  );
}
