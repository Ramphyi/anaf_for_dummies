import { differenceInCalendarDays, format, parseISO, subMonths } from "date-fns";
import { ro } from "date-fns/locale";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileText,
  FolderKanban,
  HandCoins,
  Palmtree,
  PartyPopper,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AnimatedBar, FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Avatar, ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { can, requireContext } from "@/lib/auth/session";
import { TASK_PRIORITY, TIME_OFF_TYPE } from "@/lib/constants";
import { formatHours, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EfacturaDonut, LiveTimer, RevenueChart } from "./charts";
import { getFinanceOverview, getPersonalOverview, getRecentActivity, getTeamOverview } from "./data";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText />,
  payment: <HandCoins />,
  spv: <ShieldCheck />,
  timesheet: <Timer />,
  task: <FolderKanban />,
  partner: <Users />,
  purchase: <Receipt />,
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireContext();
  const { welcome } = await searchParams;
  const firstName = ctx.user.name.split(" ")[0];
  const finance = can(ctx, "billing") || can(ctx, "reports");
  const companyId = ctx.company.id;

  const [fin, team, activity, me] = await Promise.all([
    finance ? getFinanceOverview(companyId) : Promise.resolve(null),
    getTeamOverview(companyId),
    getRecentActivity(companyId),
    getPersonalOverview(companyId, ctx.teamMemberId),
  ]);

  const todayLabel = format(new Date(), "EEEE, d MMMM yyyy", { locale: ro });
  const vsPrev = `vs. ${format(subMonths(new Date(), 1), "LLL", { locale: ro })}`;
  const summary = fin
    ? [
        fin.receivable.overdueCount ? `${fin.receivable.overdueCount} facturi au scadența depășită` : "nicio factură restantă",
        `${fin.invoiceCountThisMonth} facturi emise luna aceasta`,
      ].join(" · ")
    : `${formatHours(me?.weekHours ?? 0)} pontate săptămâna aceasta`;

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{todayLabel}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">
            {greeting()}, <span className="text-gradient animate-gradient">{firstName}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "timesheet.own") && (
            <Button variant="outline" asChild>
              <Link href="/pontaj">
                <Timer /> Pontează
              </Link>
            </Button>
          )}
          {can(ctx, "billing") && (
            <Button variant="gradient" asChild>
              <Link href="/facturi/nou">
                <Plus /> Factură nouă
              </Link>
            </Button>
          )}
        </div>
      </FadeIn>

      {welcome && (
        <FadeIn delay={0.1}>
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--primary)_14%,var(--card)),color-mix(in_oklab,var(--accent)_10%,var(--card)))] p-5">
            <div className="absolute -top-10 -right-10 size-40 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                <PartyPopper className="size-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold">Contul tău e gata! Câțiva pași ca să pornești:</h2>
                <p className="text-sm text-muted-foreground">Completează datele firmei, conectează SPV-ul ANAF și adaugă primul client — apoi emite prima factură.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/setari">Date firmă</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/efactura/conexiune">Conectează ANAF</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/clienti?nou=1">Primul client</Link>
                </Button>
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {fin ? (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StaggerItem>
            <StatCard
              label="Venituri luna aceasta"
              value={fin.revenue.value}
              delta={fin.revenue.delta}
              deltaLabel={vsPrev}
              icon={<TrendingUp />}
              spark={fin.series.map((s) => s.revenue)}
              href="/rapoarte/vanzari"
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Încasat luna aceasta"
              value={fin.collected.value}
              delta={fin.collected.delta}
              deltaLabel={vsPrev}
              icon={<HandCoins />}
              tone="success"
              spark={fin.series.map((s) => s.collected)}
              href="/incasari"
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="De încasat"
              value={fin.receivable.total}
              icon={<CircleDollarSign />}
              tone={fin.receivable.overdue > 0 ? "warning" : "info"}
              hint={fin.receivable.overdue > 0 ? `${formatMoney(fin.receivable.overdue, "RON", { compact: true })} restanțe` : `${fin.receivable.count} facturi deschise`}
              href="/facturi?status=overdue"
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Cheltuieli luna aceasta"
              value={fin.expenses.value}
              delta={fin.expenses.delta}
              invertDelta
              deltaLabel={vsPrev}
              icon={<Receipt />}
              tone="danger"
              spark={fin.series.map((s) => s.expenses)}
              href="/cheltuieli"
            />
          </StaggerItem>
        </Stagger>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-3">
          <StaggerItem>
            <StatCard label="Ore pontate săptămâna asta" value={me?.weekHours ?? 0} format="hours" icon={<Timer />} href="/pontaj" />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Task-uri deschise" value={me?.tasks.length ?? 0} format="number" icon={<FolderKanban />} tone="info" href="/proiecte" />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Colegi în concediu azi" value={team.offToday.length} format="number" icon={<Palmtree />} tone="success" href="/concedii" />
          </StaggerItem>
        </Stagger>
      )}

      {fin && (
        <div className="grid gap-4 lg:grid-cols-3">
          <FadeIn delay={0.15} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeaderRow
                icon={<TrendingUp />}
                title="Venituri vs. cheltuieli"
                description="Sume în RON, inclusiv facturile în valută la cursul documentului"
                actions={
                  <Badge tone={fin.profitYtd >= 0 ? "success" : "danger"} className="text-xs">
                    Profit {new Date().getFullYear()}: {formatMoney(fin.profitYtd, "RON", { compact: true })}
                  </Badge>
                }
              />
              <CardContent>
                <RevenueChart data={fin.series} />
              </CardContent>
            </Card>
          </FadeIn>
          <FadeIn delay={0.2}>
            <Card className="flex h-full flex-col">
              <CardHeaderRow
                icon={<ShieldCheck />}
                title="e-Factura"
                description="Starea facturilor în SPV"
                actions={
                  <Button size="xs" variant="ghost" asChild>
                    <Link href="/efactura">
                      Deschide <ArrowRight />
                    </Link>
                  </Button>
                }
              />
              <CardContent className="flex flex-1 flex-col justify-between gap-5">
                <EfacturaDonut counts={fin.efactura} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="soft" size="sm" asChild>
                    <Link href="/efactura?sync=1&tab=primite">
                      <Sparkles /> Sincronizează SPV
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/efactura?tab=trimise">Vezi trimise</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      )}

      {me?.running && (
        <FadeIn>
          <Card className="relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: me.running.color }} />
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-danger" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Cronometru pornit</div>
                <div className="truncate font-medium">
                  {me.running.project}
                  {me.running.description ? ` — ${me.running.description}` : ""}
                </div>
              </div>
              <LiveTimer since={me.running.since} />
              <Button variant="outline" asChild>
                <Link href="/pontaj">Gestionează</Link>
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.25} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeaderRow
              icon={<Users />}
              title="Echipa săptămâna aceasta"
              description={`${formatHours(team.totals.hours)} pontate · ${team.totals.billablePct.toFixed(0)}% facturabil · utilizare ${team.totals.utilization.toFixed(0)}%`}
              actions={
                <Button size="xs" variant="ghost" asChild>
                  <Link href="/planificare">
                    Planificare <ArrowRight />
                  </Link>
                </Button>
              }
            />
            <CardContent>
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {team.team.slice(0, 10).map((m) => {
                  const pct = m.expected ? (m.hours / m.expected) * 100 : 0;
                  return (
                    <Link key={m.id} href={`/echipa/${m.id}`} className="group flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/50">
                      <Avatar name={m.name} color={m.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{m.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular">
                            {formatHours(m.hours)} / {formatHours(m.expected)}
                          </span>
                        </div>
                        <AnimatedBar
                          value={Math.min(pct, 100)}
                          color={pct > 110 ? "var(--danger)" : pct >= 85 ? "var(--success)" : pct >= 50 ? "var(--primary)" : "var(--warning)"}
                          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
              {team.offToday.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <Palmtree className="size-3.5" /> Azi lipsesc:
                  {team.offToday.map((o) => (
                    <Badge key={o.name} tone={TIME_OFF_TYPE[o.type]?.tone ?? "neutral"}>
                      {o.name} · {TIME_OFF_TYPE[o.type]?.label}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {fin ? (
          <FadeIn delay={0.3}>
            <Card className="h-full">
              <CardHeaderRow
                icon={<CalendarClock />}
                title="Scadențe"
                description="Facturi de încasat, după scadență"
                actions={
                  <Button size="xs" variant="ghost" asChild>
                    <Link href="/facturi?status=overdue">
                      Toate <ArrowRight />
                    </Link>
                  </Button>
                }
              />
              <CardContent className="space-y-1">
                {fin.upcoming.length === 0 && <EmptyState compact icon={<PartyPopper />} title="Totul e încasat" description="Nicio factură deschisă." />}
                {fin.upcoming.map((d) => {
                  const days = d.dueDate ? differenceInCalendarDays(parseISO(d.dueDate), new Date()) : 0;
                  return (
                    <Link key={d.id} href={`/facturi/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                      <div
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular",
                          days < 0 ? "bg-danger-soft text-danger-soft-foreground" : days <= 7 ? "bg-warning-soft text-warning-soft-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {days < 0 ? `-${Math.abs(days)}` : days}
                        <span className="sr-only">zile</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.clientName}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.fullNumber} · {days < 0 ? `întârziere ${Math.abs(days)} zile` : days === 0 ? "scadentă azi" : `în ${days} zile`}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold tabular">{formatMoney(d.total - d.paidAmount, d.currency)}</div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </FadeIn>
        ) : (
          <FadeIn delay={0.3}>
            <Card className="h-full">
              <CardHeaderRow icon={<FolderKanban />} title="Task-urile mele" description="Nefinalizate, după termen" />
              <CardContent className="space-y-1">
                {!me?.tasks.length && <EmptyState compact icon={<PartyPopper />} title="Niciun task deschis" />}
                {me?.tasks.map((t) => (
                  <Link key={t.id} href={`/proiecte/${t.project?.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                    <ColorDot color={t.project?.color ?? "#999"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.project?.name}</div>
                    </div>
                    <Badge tone={TASK_PRIORITY[t.priority].tone}>{TASK_PRIORITY[t.priority].label}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </FadeIn>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {fin && (
          <FadeIn delay={0.35}>
            <Card className="h-full">
              <CardHeaderRow icon={<Sparkles />} title="Top clienți" description="Ultimele 12 luni" />
              <CardContent className="space-y-3.5">
                {fin.topClients.map((c, i) => (
                  <Link key={c.id ?? c.name} href={c.id ? `/clienti/${c.id}` : "/clienti"} className="block">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                        <span className="truncate font-medium">{c.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular">{formatMoney(c.value, "RON", { compact: true })}</span>
                    </div>
                    <AnimatedBar value={(c.value / (fin.topClients[0]?.value || 1)) * 100} color={`var(--chart-${(i % 5) + 1})`} className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-muted" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </FadeIn>
        )}
        <FadeIn delay={0.4} className={fin ? "" : "lg:col-span-2"}>
          <Card className="h-full">
            <CardHeaderRow
              icon={<FolderKanban />}
              title="Proiecte active"
              description="Ore consumate din buget"
              actions={
                <Button size="xs" variant="ghost" asChild>
                  <Link href="/proiecte">
                    Toate <ArrowRight />
                  </Link>
                </Button>
              }
            />
            <CardContent className="space-y-3.5">
              {team.projects.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/proiecte/${p.id}`} className="block">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <ColorDot color={p.color} />
                      <span className="truncate font-medium">{p.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">
                      {p.budget ? `${Math.round(p.used)} / ${p.budget} h` : `${Math.round(p.month)} h luna asta`}
                    </span>
                  </div>
                  <AnimatedBar
                    value={p.pct ?? Math.min(100, p.month)}
                    color={p.pct !== null && p.pct > 90 ? "var(--danger)" : p.color}
                    className="mt-1.5 ml-[18px] h-1.5 overflow-hidden rounded-full bg-muted"
                  />
                </Link>
              ))}
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.45}>
          <Card className="h-full">
            <CardHeaderRow icon={<Activity />} title="Activitate recentă" />
            <CardContent>
              <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
                {activity.map((a) => (
                  <li key={a.id} className="relative flex gap-3">
                    <div className="z-10 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground [&_svg]:size-3.5">
                      {ACTIVITY_ICONS[a.entity] ?? <Activity />}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm leading-snug">{a.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.userName} · {formatRelative(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {!activity.length && <li className="text-sm text-muted-foreground">Nicio activitate încă.</li>}
              </ol>
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
