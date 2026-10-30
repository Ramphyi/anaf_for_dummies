import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Marca AND (ANAF for Dummies): un „A” stilizat, cu bifa de „validat”. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white shadow-glow",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19.5 11 4.5h2l6 15" />
        <path d="m8.6 14.6 2.2 2.2 4.4-4.6" opacity="0.8" />
      </svg>
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.25),transparent_55%)]" />
    </span>
  );
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && (
        <span className="flex flex-col whitespace-nowrap">
          <span className="text-[17px] leading-none font-bold tracking-tight">{APP_NAME}</span>
          <span className="mt-0.5 text-[10px] leading-none font-medium text-muted-foreground">{APP_TAGLINE}</span>
        </span>
      )}
    </span>
  );
}
