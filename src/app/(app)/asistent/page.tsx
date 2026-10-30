import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { isAiConfigured } from "@/lib/ai/openai";
import { getAssistantAdminAction } from "@/lib/assistant/actions";
import { toolCtxFromApp } from "@/lib/assistant/context";
import { requireContext } from "@/lib/auth/session";
import { AssistantPage } from "./assistant-page";

export const metadata = { title: "Asistent AI" };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string }> }) {
  const ctx = await requireContext();
  const { c, tab } = await searchParams;
  const admin = await getAssistantAdminAction();
  if (!admin.ok) throw new Error(admin.error);
  const tc = toolCtxFromApp(ctx);
  return (
    <>
      <PageHeader
        icon={<Sparkles />}
        title="Asistent AI"
        description="Întreabă orice despre firmă: răspunsurile vin din datele tale (facturi, SPV, stocuri, proiecte, pontaje), prin OpenAI."
      />
      <AssistantPage
        userName={ctx.user.name}
        permissions={tc.permissions}
        configured={isAiConfigured()}
        initialConversation={c ?? null}
        initialTab={tab === "setari" ? "setari" : "chat"}
        admin={admin.data}
      />
    </>
  );
}
