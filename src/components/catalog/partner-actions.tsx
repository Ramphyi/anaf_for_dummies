"use client";

import { Archive, ArchiveRestore, FileClock, FilePlus2, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { restorePartnerAction } from "@/app/(app)/clienti/actions";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAction } from "@/hooks/use-action";
import type { Partner } from "@/lib/db/schema";
import { deletePartnerAction } from "@/lib/partners/actions";
import type { PartnerMode } from "./partner-table";

/** Acțiunile din antetul profilului unui client/furnizor. */
export function PartnerActions({ partner, mode }: { partner: Partner; mode: PartnerMode }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useAction();
  const base = mode === "client" ? "/clienti" : "/furnizori";
  const noun = mode === "client" ? "Clientul" : "Furnizorul";

  const remove = async () => {
    const r = await deletePartnerAction(partner.id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (r.data.archived) {
      toast.success(`${noun} a fost arhivat — are documente, deci istoricul rămâne intact.`);
      router.refresh();
    } else {
      toast.success(`${noun} a fost șters.`);
      router.push(base);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil /> Editează
      </Button>
      {mode === "client" ? (
        <Button asChild>
          <Link href={`/facturi/nou?client=${partner.id}`}>
            <FilePlus2 /> Factură nouă
          </Link>
        </Button>
      ) : (
        <Button asChild>
          <Link href={`/cheltuieli/nou?supplier=${partner.id}`}>
            <Receipt /> Cheltuială nouă
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Mai multe acțiuni">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {mode === "client" ? (
            <DropdownMenuItem asChild>
              <Link href={`/proforme/nou?client=${partner.id}`}>
                <FileClock /> Proformă nouă
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={`/stocuri?tab=documente&nou=nir&furnizor=${partner.id}`}>
                <Archive /> Recepție marfă (NIR)
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {partner.active ? (
            <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
              <Trash2 /> Arhivează / șterge
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={pending} onSelect={() => run(() => restorePartnerAction(partner.id), { refresh: true })}>
              <ArchiveRestore /> Reactivează
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PartnerDialog kind={mode} partner={partner} open={editing} onOpenChange={setEditing} onSaved={() => router.refresh()} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={`Elimini ${partner.name}?`}
        description="Dacă are documente asociate (facturi, cheltuieli), va fi doar arhivat și istoricul rămâne intact. Altfel, se șterge definitiv."
        confirmLabel="Continuă"
        onConfirm={remove}
      />
    </>
  );
}
