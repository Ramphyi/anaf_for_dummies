import { DocumentListPage } from "@/components/documents/list-page";

export const metadata = { title: "Facturi" };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <DocumentListPage kind="invoice" status={status} />;
}
