import { DocumentFormPage } from "@/components/documents/form-page";

export const metadata = { title: "Aviz nou" };

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string; project?: string }> }) {
  const { client, project } = await searchParams;
  return <DocumentFormPage kind="notice" clientId={client} projectId={project} />;
}
