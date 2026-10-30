import { eq } from "drizzle-orm";
import { UsersManager, type MemberRow, type PermissionMatrix, type TeamOption } from "@/components/settings/users-manager";
import { can, requirePermission, type Permission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { memberships, ROLES, teamMembers, users } from "@/lib/db/schema";

export const metadata = { title: "Utilizatori" };

const PERMISSIONS: { key: Permission; label: string; description: string }[] = [
  { key: "billing", label: "Facturare", description: "Facturi, proforme, avize, încasări, cheltuieli, stocuri, nomenclatoare" },
  { key: "anaf", label: "ANAF", description: "e-Factura, mesaje SPV, e-Transport, instrumente fiscale" },
  { key: "reports", label: "Rapoarte", description: "Vânzări, TVA, cash-flow, restanțe, profitabilitate" },
  { key: "projects.manage", label: "Proiecte & echipă", description: "Proiecte, task-uri, echipă, planificare" },
  { key: "timesheet.approve", label: "Aprobare pontaj", description: "Aprobă sau respinge orele echipei" },
  { key: "timesheet.own", label: "Pontaj propriu", description: "Înregistrează orele proprii" },
  { key: "settings", label: "Setări firmă", description: "Date firmă, serii, email, jurnal de activitate" },
  { key: "users", label: "Utilizatori", description: "Invită colegi și schimbă roluri" },
];

export default async function UsersPage() {
  const ctx = await requirePermission("users");
  const companyId = ctx.company.id;
  const [rows, team] = await Promise.all([
    db
      .select({
        id: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarColor: users.avatarColor,
        role: memberships.role,
        teamMemberId: memberships.teamMemberId,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, companyId)),
    db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId), columns: { id: true, name: true, position: true, active: true } }),
  ]);
  const order = ["owner", "admin", "accountant", "manager", "employee"];
  const teamName = new Map(team.map((t) => [t.id, t.name]));
  const members: MemberRow[] = rows
    .map((r) => ({
      ...r,
      teamMemberName: r.teamMemberId ? (teamName.get(r.teamMemberId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      isSelf: r.userId === ctx.user.id,
    }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name, "ro"));
  const linkedBy = new Map(rows.filter((r) => r.teamMemberId).map((r) => [r.teamMemberId!, r.id]));
  const teamOptions: TeamOption[] = team
    .filter((t) => t.active || linkedBy.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, position: t.position, linkedTo: linkedBy.get(t.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
  const matrix: PermissionMatrix = {
    roles: [...ROLES],
    rows: PERMISSIONS.map((p) => ({ ...p, allowed: Object.fromEntries(ROLES.map((r) => [r, can({ role: r }, p.key)])) })),
  };

  return <UsersManager members={members} team={teamOptions} matrix={matrix} myRole={ctx.role} />;
}
