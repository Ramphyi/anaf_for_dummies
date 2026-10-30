"use client";

import { MapPin, MoreHorizontal, Pencil, Plus, Star, Trash2, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { deleteWarehouseAction, saveWarehouseAction } from "@/app/(app)/stocuri/actions";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { formatMoney } from "@/lib/format";
import type { WarehouseInfo } from "./types";

type Form = { id?: string | null; name: string; code: string; address: string; isDefault: boolean };

export function WarehousesPanel({ warehouses }: { warehouses: WarehouseInfo[] }) {
  const router = useRouter();
  const [editing, setEditingState] = React.useState<Form>({ name: "", code: "", address: "", isDefault: false });
  const [open, setOpen] = React.useState(false);
  const setEditing = (f: Form | null) => {
    if (f) {
      setEditingState(f);
      setOpen(true);
    } else setOpen(false);
  };
  const [removing, setRemoving] = React.useState<WarehouseInfo | null>(null);
  const { run, pending } = useAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveWarehouseAction(editing), { onSuccess: () => setEditing(null), refresh: true });
  };

  return (
    <>
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((w) => (
          <StaggerItem key={w.id}>
            <Card className="group relative h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <Warehouse className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{w.name}</span>
                      {w.isDefault && (
                        <Badge tone="brand">
                          <Star className="size-3 fill-current" /> Implicită
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{w.code ? `Cod ${w.code}` : "Fără cod"}</div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="Acțiuni gestiune">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditing({ id: w.id, name: w.name, code: w.code ?? "", address: w.address ?? "", isDefault: w.isDefault })}>
                      <Pencil /> Editează
                    </DropdownMenuItem>
                    {!w.isDefault && (
                      <DropdownMenuItem
                        onSelect={() => run(() => saveWarehouseAction({ id: w.id, name: w.name, code: w.code, address: w.address, isDefault: true }), { refresh: true, success: `${w.name} este acum gestiunea implicită` })}
                      >
                        <Star /> Setează ca implicită
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setRemoving(w)}>
                      <Trash2 /> Șterge
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {w.address && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{w.address}</span>
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Valoare</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{formatMoney(w.value, "RON", { compact: true })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Produse</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{w.productCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Documente</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{w.docCount}</div>
                </div>
              </div>
            </Card>
          </StaggerItem>
        ))}
        <StaggerItem>
          <button
            type="button"
            onClick={() => setEditing({ name: "", code: "", address: "", isDefault: false })}
            className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/30 hover:text-primary"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-muted">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-medium">Gestiune nouă</span>
            <span className="text-xs">depozit, magazin, punct de lucru</span>
          </button>
        </StaggerItem>
      </Stagger>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{editing.id ? `Editează ${editing.name}` : "Gestiune nouă"}</DialogTitle>
              <DialogDescription>Fiecare gestiune are stocul ei; transferurile mută marfa între ele.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Denumire" required>
                  <Input value={editing.name} onChange={(e) => setEditingState({ ...editing, name: e.target.value })} autoFocus required placeholder="ex. Depozit Cluj" />
                </Field>
                <Field label="Cod">
                  <Input value={editing.code} onChange={(e) => setEditingState({ ...editing, code: e.target.value })} placeholder="CJ1" className="font-mono text-[13px]" />
                </Field>
              </div>
              <Field label="Adresă">
                <Input value={editing.address} onChange={(e) => setEditingState({ ...editing, address: e.target.value })} placeholder="Str. Exemplu 10, Cluj-Napoca" />
              </Field>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                <span>
                  Gestiune implicită
                  <span className="block text-xs text-muted-foreground">Folosită automat la facturare și recepții.</span>
                </span>
                <Switch checked={editing.isDefault} onCheckedChange={(v) => setEditingState({ ...editing, isDefault: v })} />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Renunță
              </Button>
              <Button type="submit" loading={pending}>
                {editing.id ? "Salvează" : "Adaugă gestiunea"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        title={`Ștergi gestiunea ${removing?.name ?? ""}?`}
        description="Se pot șterge doar gestiunile fără mișcări de stoc."
        confirmLabel="Șterge"
        onConfirm={async () => {
          if (!removing) return;
          const r = await deleteWarehouseAction(removing.id);
          if (r.ok) {
            toast.success(r.message ?? "Gestiune ștearsă");
            router.refresh();
          } else toast.error(r.error);
        }}
      />
    </>
  );
}
