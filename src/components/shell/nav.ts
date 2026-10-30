import {
  BarChart3,
  Boxes,
  Building2,
  CalendarRange,
  Contact,
  FileClock,
  FileOutput,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Package,
  Palmtree,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/session";

export type NavBadgeKey = "spvUnread" | "overdue" | "approvals" | "efacturaErrors";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  badge?: NavBadgeKey;
  keywords?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

/** Sursa unică pentru navigație (sidebar, command palette, breadcrumbs). */
export const NAV: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: ["acasa", "sumar"] },
      { href: "/asistent", label: "Asistent AI", icon: Sparkles, keywords: ["ai", "chat", "chatgpt", "openai", "mcp", "intreaba"] },
    ],
  },
  {
    label: "Vânzări",
    items: [
      { href: "/facturi", label: "Facturi", icon: FileText, permission: "billing", badge: "overdue", keywords: ["factura", "storno"] },
      { href: "/proforme", label: "Proforme", icon: FileClock, permission: "billing", keywords: ["oferta"] },
      { href: "/avize", label: "Avize de însoțire", icon: FileOutput, permission: "billing", keywords: ["aviz", "livrare"] },
      { href: "/incasari", label: "Încasări & chitanțe", icon: Wallet, permission: "billing", keywords: ["plati", "chitanta", "registru casa"] },
      { href: "/recurente", label: "Facturi recurente", icon: Repeat, permission: "billing", keywords: ["abonament", "lunar"] },
    ],
  },
  {
    label: "Achiziții & stocuri",
    items: [
      { href: "/cheltuieli", label: "Cheltuieli", icon: Receipt, permission: "billing", keywords: ["facturi primite", "furnizori", "achizitii"] },
      { href: "/stocuri", label: "Stocuri & gestiuni", icon: Boxes, permission: "billing", keywords: ["nir", "inventar", "bon consum", "transfer"] },
    ],
  },
  {
    label: "Nomenclatoare",
    items: [
      { href: "/clienti", label: "Clienți", icon: Users, permission: "billing" },
      { href: "/furnizori", label: "Furnizori", icon: Building2, permission: "billing" },
      { href: "/produse", label: "Produse & servicii", icon: Package, permission: "billing", keywords: ["articole", "nomenclator"] },
    ],
  },
  {
    label: "ANAF",
    items: [
      { href: "/efactura", label: "e-Factura · SPV", icon: ShieldCheck, permission: "anaf", badge: "spvUnread", keywords: ["spv", "anaf", "mesaje", "oauth"] },
      { href: "/etransport", label: "e-Transport", icon: Truck, permission: "anaf", keywords: ["uit", "transport"] },
      { href: "/instrumente", label: "Instrumente fiscale", icon: Wrench, permission: "anaf", keywords: ["cui", "validare xml", "curs bnr", "pdf"] },
    ],
  },
  {
    label: "Outsourcing",
    items: [
      { href: "/proiecte", label: "Proiecte", icon: FolderKanban, keywords: ["kanban", "task"] },
      { href: "/pontaj", label: "Pontaj", icon: Timer, permission: "timesheet.own", badge: "approvals", keywords: ["timesheet", "ore", "cronometru"] },
      { href: "/planificare", label: "Planificare echipă", icon: CalendarRange, keywords: ["alocare", "timeline", "resurse", "orar"] },
      { href: "/echipa", label: "Echipă", icon: Contact, keywords: ["angajati", "membri"] },
      { href: "/concedii", label: "Concedii", icon: Palmtree, keywords: ["concediu", "libere"] },
    ],
  },
  {
    label: "Analiză",
    items: [{ href: "/rapoarte", label: "Rapoarte", icon: BarChart3, permission: "reports", keywords: ["tva", "vanzari", "restante", "profit"] }],
  },
  {
    label: "Sistem",
    items: [{ href: "/setari", label: "Setări", icon: Settings, permission: "settings", keywords: ["firma", "serii", "utilizatori"] }],
  },
];
