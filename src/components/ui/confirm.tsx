"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Dialog de confirmare. `onConfirm` poate fi async; dialogul rămâne deschis cu spinner până se termină.
 *   <ConfirmDialog trigger={<Button>Șterge</Button>} title="Ștergi factura?" destructive onConfirm={...} />
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmă",
  cancelLabel = "Renunță",
  destructive,
  onConfirm,
  children,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size="sm" hideClose>
        <DialogHeader className="items-center pr-6 text-center">
          <div className={destructive ? "mb-2 grid size-12 place-items-center rounded-full bg-danger-soft text-danger" : "mb-2 grid size-12 place-items-center rounded-full bg-primary-soft text-primary"}>
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="px-6 pb-4">{children}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
