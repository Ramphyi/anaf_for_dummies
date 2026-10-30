import { CompanyForm, type CompanyFormData } from "@/components/settings/company-form";
import { DataExportCard } from "@/components/settings/data-export-card";
import { requirePermission } from "@/lib/auth/session";

export const metadata = { title: "Setări firmă" };

export default async function CompanySettingsPage() {
  const ctx = await requirePermission("settings");
  const c = ctx.company;
  // doar câmpurile editabile — fără setările SMTP (parola nu ajunge niciodată în browser)
  const initial: CompanyFormData = {
    name: c.name,
    cui: c.cui,
    regCom: c.regCom,
    vatPayer: c.vatPayer,
    vatOnCollection: c.vatOnCollection,
    address: c.address,
    city: c.city,
    county: c.county,
    postalCode: c.postalCode,
    iban: c.iban,
    bank: c.bank,
    email: c.email,
    phone: c.phone,
    website: c.website,
    shareCapital: c.shareCapital,
    logoDataUrl: c.logoDataUrl,
    brandColor: c.brandColor,
    defaultCurrency: c.defaultCurrency,
    defaultVatRate: c.defaultVatRate,
    defaultDueDays: c.defaultDueDays,
    invoiceFooter: c.invoiceFooter,
  };
  return (
    <div className="space-y-6">
      <CompanyForm initial={initial} />
      <DataExportCard />
    </div>
  );
}
