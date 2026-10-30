import type { StockDocType } from "@/lib/db/schema";

export type WarehouseInfo = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isDefault: boolean;
  productCount: number;
  value: number;
  docCount: number;
};

export type TrackedProductInfo = { id: string; name: string; code: string | null; unit: string; purchasePrice: number | null; active: boolean };

export type LevelRow = {
  key: string;
  productId: string;
  productName: string;
  productCode: string | null;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  avgCost: number;
  value: number;
};

export type StockDocRow = {
  id: string;
  type: StockDocType;
  number: string;
  date: string;
  warehouseName: string;
  targetWarehouseName: string | null;
  partnerName: string | null;
  purchaseInvoiceId: string | null;
  documentId: string | null;
  lines: number;
  value: number;
  notes: string | null;
};

export type StockCardRow = {
  id: string;
  date: string;
  docId: string;
  docType: StockDocType;
  docNumber: string;
  notes: string | null;
  warehouseName: string;
  in: number;
  out: number;
  unitCost: number;
  balance: number;
  avgCost: number;
};

export type SupplierLite = { id: string; name: string; cui: string | null };

export type NewDocKind = "nir" | "consumption" | "transfer" | "inventory";
