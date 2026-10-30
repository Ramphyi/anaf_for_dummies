"use client";

import { ArrowLeftRight, Boxes, ChevronDown, ClipboardCheck, FileStack, PackageMinus, PackagePlus, Plus, ScrollText, Warehouse } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryDialog } from "./inventory-dialog";
import { StockCardPanel } from "./stock-card";
import { StockDocDialog } from "./stock-doc-dialog";
import { StockDocSheet } from "./stock-doc-sheet";
import { StockDocumentsTable } from "./stock-documents";
import { StockLevelsTable } from "./stock-levels";
import type { LevelRow, NewDocKind, StockCardRow, StockDocRow, SupplierLite, TrackedProductInfo, WarehouseInfo } from "./types";
import { WarehousesPanel } from "./warehouses-panel";

type Tab = "situatie" | "documente" | "fisa" | "gestiuni";

/** Actualizează query string-ul fără reîncărcare (navigare între tab-uri). */
function replaceQuery(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.pathname + url.search);
}

export function StockView({
  tab: initialTab,
  levels,
  documents,
  warehouses,
  products,
  suppliers,
  card,
  cardProductId,
  cardWarehouseId,
  openDocId,
  newDoc,
  newDocSupplierId,
  kpis,
}: {
  tab: Tab;
  levels: LevelRow[];
  documents: StockDocRow[];
  warehouses: WarehouseInfo[];
  products: TrackedProductInfo[];
  suppliers: SupplierLite[];
  card: StockCardRow[] | null;
  cardProductId: string | null;
  cardWarehouseId: string | null;
  openDocId: string | null;
  newDoc: NewDocKind | null;
  newDocSupplierId: string | null;
  kpis: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [docId, setDocId] = React.useState<string | null>(openDocId);
  const [creating, setCreating] = React.useState<NewDocKind | null>(newDoc);
  // păstrăm tipul ultimului document ca dialogul să-și termine animația de închidere
  const [docKind, setDocKind] = React.useState<Exclude<NewDocKind, "inventory">>(newDoc && newDoc !== "inventory" ? newDoc : "nir");

  React.useEffect(() => setTab(initialTab), [initialTab]);
  React.useEffect(() => setDocId(openDocId), [openDocId]);

  const changeTab = (t: string) => {
    setTab(t as Tab);
    replaceQuery({ tab: t, doc: null, nou: null });
  };
  const openDoc = (id: string | null) => {
    setDocId(id);
    replaceQuery({ doc: id });
  };
  const startNew = (k: NewDocKind | null) => {
    if (k && k !== "inventory") setDocKind(k);
    setCreating(k);
    if (!k) replaceQuery({ nou: null, furnizor: null });
  };

  const newItems: { kind: NewDocKind; label: string; hint: string; icon: React.ReactNode }[] = [
    { kind: "nir", label: "NIR — recepție marfă", hint: "Intrare de la furnizor", icon: <PackagePlus /> },
    { kind: "consumption", label: "Bon de consum", hint: "Ieșire pentru uz intern", icon: <PackageMinus /> },
    { kind: "transfer", label: "Transfer între gestiuni", hint: "Mută stoc dintr-o gestiune în alta", icon: <ArrowLeftRight /> },
    { kind: "inventory", label: "Inventar", hint: "Ajustează la stocul faptic", icon: <ClipboardCheck /> },
  ];

  return (
    <>
      <PageHeader
        title="Stocuri & gestiuni"
        description="Situația stocurilor, documente de gestiune, fișa magaziei și depozite."
        icon={<Boxes />}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Document nou <ChevronDown className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              <DropdownMenuLabel>Creează un document de stoc</DropdownMenuLabel>
              {newItems.map((it, i) => (
                <React.Fragment key={it.kind}>
                  {i === 3 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => startNew(it.kind)} className="items-start py-2">
                    <span className="mt-0.5">{it.icon}</span>
                    <span>
                      <span className="block font-medium">{it.label}</span>
                      <span className="block text-xs text-muted-foreground">{it.hint}</span>
                    </span>
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {kpis}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="situatie">
            <Boxes /> Situație stocuri
          </TabsTrigger>
          <TabsTrigger value="documente">
            <FileStack /> Documente
          </TabsTrigger>
          <TabsTrigger value="fisa">
            <ScrollText /> Fișa magaziei
          </TabsTrigger>
          <TabsTrigger value="gestiuni">
            <Warehouse /> Gestiuni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="situatie">
          <StockLevelsTable rows={levels} warehouses={warehouses} onNew={startNew} />
        </TabsContent>
        <TabsContent value="documente">
          <StockDocumentsTable rows={documents} onOpen={openDoc} onNew={startNew} />
        </TabsContent>
        <TabsContent value="fisa">
          <StockCardPanel rows={card} products={products} warehouses={warehouses} productId={cardProductId} warehouseId={cardWarehouseId} onOpenDoc={openDoc} />
        </TabsContent>
        <TabsContent value="gestiuni">
          <WarehousesPanel warehouses={warehouses} />
        </TabsContent>
      </Tabs>

      <StockDocSheet docId={docId} onClose={() => openDoc(null)} />
      <StockDocDialog
        kind={docKind}
        open={!!creating && creating !== "inventory"}
        onOpenChange={(o) => !o && startNew(null)}
        products={products.filter((p) => p.active)}
        warehouses={warehouses}
        suppliers={suppliers}
        levels={levels}
        defaultSupplierId={docKind === "nir" ? newDocSupplierId : null}
      />
      <InventoryDialog open={creating === "inventory"} onOpenChange={(o) => !o && startNew(null)} products={products} warehouses={warehouses} levels={levels} />
    </>
  );
}
