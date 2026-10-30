import { DocumentDetailPage } from "@/components/documents/detail-page";
import { documentTitle } from "@/components/documents/server";
import { getContext } from "@/lib/auth/session";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const ctx = await getContext();
  return { title: await documentTitle(ctx?.company.id, id, "Aviz") };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <DocumentDetailPage kind="notice" id={id} />;
}
