import { StatusBadge } from "@/components/ui/badge";
import { EFACTURA_STATUS, EFACTURA_STATUS_SIMULATED } from "@/lib/constants";

/** Statusul e-Factura al unei facturi; transmiterile simulate sunt marcate ca atare (nu au ajuns la ANAF). */
export function EfacturaBadge({ status, simulated, className }: { status: string; simulated?: boolean; className?: string }) {
  return <StatusBadge status={status} map={simulated ? EFACTURA_STATUS_SIMULATED : EFACTURA_STATUS} pulse={status === "processing"} className={className} />;
}
