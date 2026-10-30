import { format, subMonths } from "date-fns";
import { ro } from "date-fns/locale";
import { BarChart3 } from "lucide-react";
import { ReportHubGrid, type HubCard } from "@/components/reports/hub-grid";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { formatPercent } from "@/lib/format";
import { getHubMetrics } from "@/lib/reports/hub";

export const metadata = { title: "Rapoarte" };

export default async function ReportsHubPage() {
  const ctx = await requirePermission("reports");
  const m = await getHubMetrics(ctx.company.id);

  const delta = m.sales.delta;
  const cards: HubCard[] = [
    {
      href: "/rapoarte/vanzari",
      icon: "sales",
      title: "Vânzări",
      description: "Cifra de afaceri pe luni, clienți, produse și serii, comparativ cu anul trecut.",
      metric: { label: "Venituri luna curentă (fără TVA)", value: m.sales.value, kind: "money" },
      note: delta === null ? undefined : `${delta >= 0 ? "+" : "−"}${formatPercent(Math.abs(delta))} vs ${format(subMonths(new Date(), 1), "LLL", { locale: ro })}`,
      noteTone: delta === null ? "muted" : delta >= 0 ? "success" : "danger",
      color: "#6d5dfc",
    },
    {
      href: "/rapoarte/tva",
      icon: "vat",
      title: "TVA — jurnale & decont",
      description: "Jurnal de vânzări și cumpărări pe cote, decont estimat de plată / de recuperat.",
      metric: { label: m.vat.value >= 0 ? "TVA de plată estimată (luna curentă)" : "TVA de recuperat (luna curentă)", value: Math.abs(m.vat.value), kind: "money" },
      color: "#0ea5e9",
    },
    {
      href: "/rapoarte/incasari",
      icon: "cashflow",
      title: "Cash-flow",
      description: "Încasări vs plăți pe luni și metode, flux net și prognoza scadențelor.",
      metric: { label: "Flux net luna curentă", value: m.cashflow.value, kind: "money" },
      note: m.cashflow.value >= 0 ? "pozitiv" : "negativ",
      noteTone: m.cashflow.value >= 0 ? "success" : "danger",
      color: "#22c55e",
    },
    {
      href: "/rapoarte/restante",
      icon: "overdue",
      title: "Restanțe clienți",
      description: "Vechimea creanțelor pe intervale, clienți rău-platnici și reminder-e de plată.",
      metric: { label: "Total restant (scadență depășită)", value: m.overdue.value, kind: "money" },
      note: m.overdue.count ? `${m.overdue.count} facturi` : "nimic restant",
      noteTone: m.overdue.count ? "danger" : "success",
      color: "#f43f5e",
    },
    {
      href: "/rapoarte/registru-casa",
      icon: "cash",
      title: "Registru de casă",
      description: "Încasări și plăți în numerar, cu chitanțe, sold zilnic și sold inițial/final.",
      metric: { label: "Sold casă azi", value: m.cash.value, kind: "money" },
      color: "#f59e0b",
    },
    {
      href: "/rapoarte/profitabilitate",
      icon: "profit",
      title: "Profitabilitate",
      description: "Marjă pe proiect și client (venit facturat/estimat vs cost manoperă și achiziții), P&L lunar.",
      metric: { label: "Venituri − achiziții (anul curent)", value: m.profit.value, kind: "money" },
      note: `marjă ${formatPercent(m.profit.margin)}`,
      noteTone: m.profit.margin >= 0 ? "success" : "danger",
      color: "#ec4899",
    },
    {
      href: "/rapoarte/pontaj",
      icon: "hours",
      title: "Pontaj & utilizare",
      description: "Ore pe membru × proiect, procent facturabil și grad de utilizare vs capacitate.",
      metric: { label: "Ore pontate luna curentă", value: m.hours.value, kind: "hours" },
      note: `${formatPercent(m.hours.billablePct)} facturabile`,
      color: "#06b6d4",
    },
    {
      href: "/rapoarte/stocuri",
      icon: "stock",
      title: "Stocuri",
      description: "Valoarea stocului pe gestiuni și produse, intrări și ieșiri pe tip de document.",
      metric: { label: "Valoare stoc (cost mediu)", value: m.stock.value, kind: "money" },
      note: `${m.stock.products} produse`,
      color: "#8b5cf6",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapoarte"
        description="Analize financiare și operaționale, gata de exportat pentru contabil."
        icon={<BarChart3 />}
      />
      <ReportHubGrid cards={cards} />
      <p className="text-xs text-muted-foreground">
        Toate sumele sunt în RON — documentele în valută sunt convertite la cursul de pe document. Ciornele și documentele anulate nu sunt incluse; facturile storno apar cu
        semn negativ.
      </p>
    </div>
  );
}
