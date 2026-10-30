import { Settings } from "lucide-react";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/page";
import { can, requireContext } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const settings = can(ctx, "settings");
  const items: SettingsNavItem[] = [
    ...(settings
      ? ([
          { href: "/setari", label: "Firmă", icon: "company", description: "Date fiscale, branding, implicite", group: "firma" },
          { href: "/setari/serii", label: "Serii documente", icon: "series", description: "Numerotare facturi, chitanțe", group: "firma" },
          { href: "/setari/email", label: "Email", icon: "email", description: "Server SMTP pentru trimitere", group: "firma" },
        ] as const)
      : []),
    ...(can(ctx, "users") ? ([{ href: "/setari/utilizatori", label: "Utilizatori", icon: "users", description: "Acces și roluri", group: "firma" }] as const) : []),
    ...(settings ? ([{ href: "/setari/activitate", label: "Jurnal activitate", icon: "activity", description: "Cine ce a modificat", group: "firma" }] as const) : []),
    { href: "/setari/profil", label: "Profil", icon: "profile", description: "Nume, culoare, parolă", group: "cont" },
    { href: "/setari/firme-noi", label: "Firme", icon: "companies", description: "Adaugă sau schimbă firma", group: "cont" },
  ];

  return (
    <div>
      <PageHeader
        title="Setări"
        description={`${ctx.company.name} · CUI ${ctx.company.cui}`}
        icon={<Settings />}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <SettingsNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
