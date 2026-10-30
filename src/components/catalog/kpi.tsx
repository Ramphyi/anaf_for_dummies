import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

/** Grilă de KPI-uri cu apariție eșalonată (carduri de înălțime egală). */
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Stagger className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</Stagger>;
}

export function Kpi(props: React.ComponentProps<typeof StatCard>) {
  return (
    <StaggerItem className="[&>a]:block [&>a]:h-full">
      <StatCard {...props} className={cn("h-full", props.className)} />
    </StaggerItem>
  );
}
