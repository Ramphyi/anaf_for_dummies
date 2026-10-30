import { DocumentListPage } from "@/components/documents/list-page";

export const metadata = { title: "Avize de însoțire" };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <DocumentListPage kind="notice" status={status} />;
}
