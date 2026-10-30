import { DocumentFormPage } from "@/components/documents/form-page";

export const metadata = { title: "Editare factură" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentFormPage kind="invoice" id={id} />;
}
