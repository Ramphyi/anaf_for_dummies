"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Buton „Client nou” / „Furnizor nou” cu PartnerDialog.
 * `autoOpen` (din `?nou=1`) deschide dialogul la montare; la închidere parametrul dispare din URL.
 */
export function NewPartnerButton({
  kind,
  autoOpen,
  label,
  variant = "default",
  size,
  navigate = true,
}: {
  kind: "client" | "supplier";
  autoOpen?: boolean;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  navigate?: boolean;
}) {
  const [open, setOpen] = React.useState(!!autoOpen);
  const router = useRouter();
  const pathname = usePathname();
  const base = kind === "supplier" ? "/furnizori" : "/clienti";

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && autoOpen) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus /> {label ?? (kind === "supplier" ? "Furnizor nou" : "Client nou")}
      </Button>
      <PartnerDialog
        kind={kind}
        open={open}
        onOpenChange={onOpenChange}
        onSaved={(p) => {
          if (navigate) router.push(`${base}/${p.id}`);
          else router.refresh();
        }}
      />
    </>
  );
}
