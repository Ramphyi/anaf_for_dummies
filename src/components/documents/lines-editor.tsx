"use client";

import { BookOpen, Copy, GripVertical, MoreHorizontal, Package, Plus, Sparkles, TextQuote, Trash2 } from "lucide-react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, Tooltip } from "@/components/ui/popover";
import { UNITS, VAT_CATEGORY_LABELS, VAT_RATES } from "@/lib/constants";
import type { VatCategory } from "@/lib/db/schema";
import { computeLine, priceWithoutVat } from "@/lib/documents/totals";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn, round } from "@/lib/utils";
import { parseNum, type LineValue, type ProductOption } from "./shared";

export type EditorLine = {
  key: string;
  productId: string | null;
  name: string;
  description: string;
  showDescription: boolean;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  vatRate: number;
  vatCategory: VatCategory;
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const numStr = (n: number) => (n ? String(n).replace(".", ",") : "");

export function toEditorLine(l: LineValue): EditorLine {
  return {
    key: newKey(),
    productId: l.productId,
    name: l.name,
    description: l.description ?? "",
    showDescription: !!l.description,
    unit: l.unit,
    quantity: String(l.quantity).replace(".", ","),
    unitPrice: numStr(l.unitPrice),
    discountPercent: numStr(l.discountPercent),
    vatRate: l.vatRate,
    vatCategory: l.vatCategory,
  };
}

export function fromEditorLine(l: EditorLine): LineValue {
  return {
    productId: l.productId,
    name: l.name.trim(),
    description: l.showDescription && l.description.trim() ? l.description.trim() : null,
    unit: l.unit,
    quantity: parseNum(l.quantity),
    unitPrice: parseNum(l.unitPrice),
    discountPercent: parseNum(l.discountPercent),
    vatRate: l.vatCategory === "S" ? l.vatRate : 0,
    vatCategory: l.vatCategory,
  };
}

export function blankLine(vat: { rate: number; category: VatCategory }, unit = "buc"): EditorLine {
  return {
    key: newKey(),
    productId: null,
    name: "",
    description: "",
    showDescription: false,
    unit,
    quantity: "1",
    unitPrice: "",
    discountPercent: "",
    vatRate: vat.category === "S" ? vat.rate : 0,
    vatCategory: vat.category,
  };
}

/** Rânduri non-goale (pentru salvare). */
export function meaningfulLines(lines: EditorLine[]) {
  return lines.filter((l) => l.name.trim() || parseNum(l.unitPrice) !== 0);
}

/* ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Câmp text cu sugestii din catalogul de produse (textul liber rămâne permis). */
function ProductInput({
  value,
  onChange,
  onPick,
  products,
  currency,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: ProductOption) => void;
  products: ProductOption[];
  currency: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const matches = React.useMemo(() => {
    const q = norm(value.trim());
    const list = !q || showAll ? products : products.filter((p) => norm(`${p.name} ${p.code ?? ""}`).includes(q));
    return list.slice(0, showAll ? 50 : 8);
  }, [value, products, showAll]);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const pick = (p: ProductOption) => {
    onPick(p);
    setOpen(false);
    setShowAll(false);
  };

  const visible = open && matches.length > 0;

  return (
    <Popover open={visible} onOpenChange={(o) => !o && setOpen(false)}>
      <PopoverAnchor asChild>
        <div ref={wrapRef} className="relative">
          <Input
            ref={inputRef}
            value={value}
            placeholder="Produs sau serviciu…"
            aria-invalid={invalid || undefined}
            autoComplete="off"
            className="pr-9"
            onChange={(e) => {
              onChange(e.target.value);
              setShowAll(false);
              setOpen(true);
              setHi(0);
            }}
            onFocus={() => !value && products.length > 0 && setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!visible) {
                if (e.key === "ArrowDown" && products.length) {
                  e.preventDefault();
                  setOpen(true);
                }
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(matches.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (matches[hi]) pick(matches[hi]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {products.length > 0 && (
            <Tooltip content="Alege din catalog">
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowAll(true);
                  setHi(0);
                  setOpen((o) => !o || !showAll);
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BookOpen className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="scrollbar-thin max-h-80 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-y-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (wrapRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Catalog produse & servicii</div>
        {matches.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHi(i)}
            onClick={() => pick(p)}
            className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", i === hi && "bg-muted")}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground">
              {p.type === "product" ? <Package className="size-3.5" /> : <Sparkles className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.code ? `${p.code} · ` : ""}
                {formatMoney(p.price, p.currency)} / {p.unit}
                {p.priceIncludesVat ? " (cu TVA)" : ""}
              </span>
            </span>
            {p.currency !== currency && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{p.currency}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const OTHER_CATEGORIES: { value: VatCategory; short: string }[] = [
  { value: "Z", short: "Z · 0%" },
  { value: "E", short: "E · scutit" },
  { value: "AE", short: "AE · inversă" },
  { value: "K", short: "K · intracom." },
  { value: "G", short: "G · export" },
  { value: "O", short: "O · fără TVA" },
];

export function VatSelect({
  rate,
  category,
  onChange,
  className,
}: {
  rate: number;
  category: VatCategory;
  onChange: (rate: number, category: VatCategory) => void;
  className?: string;
}) {
  const value = category === "S" ? `S:${rate}` : category;
  const rates: number[] = VAT_RATES.map((r) => r.value);
  if (category === "S" && !rates.includes(rate)) rates.push(rate);
  return (
    <Tooltip content={VAT_CATEGORY_LABELS[category]}>
      <div className={className}>
        <NativeSelect
          value={value}
          className="tabular px-2 pr-7"
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("S:")) onChange(Number(v.slice(2)), "S");
            else onChange(0, v as VatCategory);
          }}
        >
          <optgroup label="Cotă TVA (S)">
            {rates.map((r) => (
              <option key={r} value={`S:${r}`}>
                {r}%{[19, 9, 5].includes(r) ? " (vechi)" : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="Alt regim TVA">
            {OTHER_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.short}
              </option>
            ))}
          </optgroup>
        </NativeSelect>
      </div>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */

const GRID = "@min-[660px]:grid-cols-[16px_minmax(0,1fr)_58px_74px_90px_52px_86px_94px_28px] @min-[660px]:gap-x-1.5 @min-[660px]:gap-y-0";

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11px] font-medium text-muted-foreground @min-[660px]:hidden">{children}</span>;
}

function LineRow({
  line,
  index,
  update,
  onDuplicate,
  onRemove,
  canRemove,
  products,
  currency,
  convertPrice,
  autoFocus,
  errors,
}: {
  line: EditorLine;
  index: number;
  update: (patch: Partial<EditorLine>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
  products: ProductOption[];
  currency: string;
  convertPrice: (p: ProductOption) => number;
  autoFocus: boolean;
  errors?: Record<string, string>;
}) {
  const controls = useDragControls();
  const t = computeLine(fromEditorLine(line));
  const err = (f: string) => !!errors?.[`lines.${index}.${f}`];

  const actions = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Acțiuni linie">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuItem onSelect={() => update({ showDescription: !line.showDescription })}>
          <TextQuote /> {line.showDescription ? "Ascunde descrierea" : "Adaugă descriere"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplică linia
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} disabled={!canRemove} destructive>
          <Trash2 /> Șterge linia
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Reorder.Item
      value={line}
      dragListener={false}
      dragControls={controls}
      layout="position"
      initial={{ opacity: 0, y: -8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      whileDrag={{ scale: 1.01, boxShadow: "0 16px 40px -12px rgb(0 0 0 / 0.25)", zIndex: 10 }}
      className="relative list-none rounded-xl border border-border bg-card p-3 @min-[660px]:rounded-lg @min-[660px]:border-transparent @min-[660px]:px-2 @min-[660px]:py-2 @min-[660px]:hover:bg-muted/40"
    >
      <div className={cn("grid grid-cols-6 gap-2", GRID)}>
        <div className="hidden items-start pt-2.5 @min-[660px]:flex">
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
            aria-label="Mută linia"
          >
            <GripVertical className="size-4" />
          </button>
        </div>

        <div className="col-span-6 min-w-0 @min-[660px]:col-span-1">
          <div className="flex items-start gap-1.5">
            <span className="mt-2 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[10.5px] font-semibold text-muted-foreground @min-[660px]:hidden">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <ProductInput
                value={line.name}
                onChange={(name) => update({ name, productId: null })}
                onPick={(p) =>
                  update({
                    productId: p.id,
                    name: p.name,
                    unit: p.unit,
                    unitPrice: numStr(convertPrice(p)),
                    description: p.description ?? line.description,
                    showDescription: line.showDescription || !!p.description,
                    ...(p.vatCategory === "S" && line.vatCategory !== "S" ? {} : { vatRate: p.vatRate, vatCategory: p.vatCategory }),
                  })
                }
                products={products}
                currency={currency}
                autoFocus={autoFocus}
                invalid={err("name")}
              />
            </div>
            <div className="flex shrink-0 items-center @min-[660px]:hidden">{actions}</div>
          </div>
          <AnimatePresence initial={false}>
            {line.showDescription && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <Textarea
                  value={line.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Descriere afișată sub denumire (opțional)"
                  className="mt-2 min-h-14 text-[13px]"
                  rows={2}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <label className="col-span-2 @min-[660px]:col-span-1">
          <MobileLabel>Cantitate</MobileLabel>
          <Input
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
            className="tabular text-right"
            aria-invalid={err("quantity") || undefined}
          />
        </label>
        <label className="col-span-2 @min-[660px]:col-span-1">
          <MobileLabel>UM</MobileLabel>
          <NativeSelect value={line.unit} onChange={(e) => update({ unit: e.target.value })} className="px-2 pr-7">
            {!UNITS.some((u) => u.value === line.unit) && <option value={line.unit}>{line.unit}</option>}
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="col-span-2 @min-[660px]:col-span-1">
          <MobileLabel>Preț unitar (fără TVA)</MobileLabel>
          <Input
            inputMode="decimal"
            value={line.unitPrice}
            placeholder="0,00"
            onChange={(e) => update({ unitPrice: e.target.value })}
            className="tabular text-right"
            aria-invalid={err("unitPrice") || undefined}
          />
        </label>
        <label className="col-span-2 @min-[660px]:col-span-1">
          <MobileLabel>Discount %</MobileLabel>
          <Input
            inputMode="decimal"
            value={line.discountPercent}
            placeholder="0"
            onChange={(e) => update({ discountPercent: e.target.value })}
            className="tabular text-right"
            aria-invalid={err("discountPercent") || undefined}
          />
        </label>
        <div className="col-span-2 @min-[660px]:col-span-1">
          <MobileLabel>TVA</MobileLabel>
          <VatSelect rate={line.vatRate} category={line.vatCategory} onChange={(vatRate, vatCategory) => update({ vatRate, vatCategory })} />
        </div>
        <div className="col-span-2 flex flex-col items-end justify-start @min-[660px]:col-span-1 @min-[660px]:pt-1">
          <MobileLabel>Valoare</MobileLabel>
          <span className={cn("text-sm font-semibold tabular", t.netAmount < 0 && "text-danger")}>{formatNumber(t.netAmount, true)}</span>
          <span className="text-[11px] text-muted-foreground tabular">
            {t.discountAmount ? `−${formatNumber(t.discountAmount, true)} disc. · ` : ""}
            {line.vatCategory === "S" ? `TVA ${formatNumber(t.vatAmount, true)}` : line.vatCategory}
          </span>
        </div>
        <div className="hidden items-start justify-end gap-0.5 pt-1 @min-[660px]:flex">{actions}</div>
      </div>
    </Reorder.Item>
  );
}

/** Editorul de linii (produse/servicii) — partajat de facturi, proforme, avize și recurente. */
export function LinesEditor({
  lines,
  onChange,
  products,
  currency,
  exchangeRate,
  rates,
  defaultVat,
  errors,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  products: ProductOption[];
  currency: string;
  exchangeRate: number;
  /** Cursuri BNR cunoscute (RON per unitate) pentru conversia prețurilor din catalog. */
  rates?: Record<string, number>;
  defaultVat: { rate: number; category: VatCategory };
  errors?: Record<string, string>;
}) {
  const [focusKey, setFocusKey] = React.useState<string | null>(null);

  const convertPrice = React.useCallback(
    (p: ProductOption) => {
      let price = p.priceIncludesVat && p.vatCategory === "S" ? priceWithoutVat(p.price, p.vatRate) : p.price;
      if (p.currency !== currency) {
        const fromRon = p.currency === "RON" ? 1 : rates?.[p.currency];
        const toRon = currency === "RON" ? 1 : exchangeRate || rates?.[currency];
        if (fromRon && toRon) price = (price * fromRon) / toRon;
      }
      return round(price, 4);
    },
    [currency, exchangeRate, rates],
  );

  const update = (key: string, patch: Partial<EditorLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = () => {
    const l = blankLine(defaultVat, lines.at(-1)?.unit ?? "buc");
    setFocusKey(l.key);
    onChange([...lines, l]);
  };
  const duplicate = (i: number) => {
    const copy = { ...lines[i], key: newKey() };
    onChange([...lines.slice(0, i + 1), copy, ...lines.slice(i + 1)]);
  };
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  return (
    <div className="@container">
      <div className={cn("hidden px-2 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase @min-[660px]:grid", GRID)}>
        <span />
        <span>Produs / serviciu</span>
        <span className="text-right">Cant.</span>
        <span>UM</span>
        <span className="text-right">Preț unitar</span>
        <span className="text-right">Disc. %</span>
        <span>TVA</span>
        <span className="text-right">Valoare</span>
        <span />
      </div>
      <Reorder.Group axis="y" values={lines} onReorder={onChange} className="space-y-2 @min-[660px]:space-y-0.5">
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <LineRow
              key={line.key}
              line={line}
              index={i}
              update={(patch) => update(line.key, patch)}
              onDuplicate={() => duplicate(i)}
              onRemove={() => remove(line.key)}
              canRemove={lines.length > 1}
              products={products}
              currency={currency}
              convertPrice={convertPrice}
              autoFocus={focusKey === line.key}
              errors={errors}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <div className="mt-3 flex flex-wrap items-center gap-2 px-0 @min-[660px]:px-2">
        <Button type="button" variant="soft" size="sm" onClick={add}>
          <Plus /> Adaugă linie
        </Button>
        <span className="text-xs text-muted-foreground">Prețurile unitare sunt fără TVA. Tastează pentru a căuta în catalog sau introdu text liber.</span>
      </div>
    </div>
  );
}
