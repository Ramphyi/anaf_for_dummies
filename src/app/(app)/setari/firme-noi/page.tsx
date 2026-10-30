import { NewCompany } from "@/components/settings/new-company";
import { requireContext } from "@/lib/auth/session";

export const metadata = { title: "Firmele mele" };

export default async function NewCompanyPage() {
  const ctx = await requireContext();
  const companies = ctx.companies
    .map((c) => ({ ...c, current: c.id === ctx.company.id }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "ro"));
  return <NewCompany companies={companies} />;
}
