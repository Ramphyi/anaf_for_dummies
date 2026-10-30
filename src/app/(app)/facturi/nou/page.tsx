import { DocumentFormPage } from "@/components/documents/form-page";

export const metadata = { title: "Factură nouă" };

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string; project?: string }> }) {
  const { client, project } = await searchParams;
  return <DocumentFormPage kind="invoice" clientId={client} projectId={project} />;
}
