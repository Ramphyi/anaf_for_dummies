import { DocumentFormPage } from "@/components/documents/form-page";

export const metadata = { title: "Editare proformă" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentFormPage kind="proforma" id={id} />;
}
