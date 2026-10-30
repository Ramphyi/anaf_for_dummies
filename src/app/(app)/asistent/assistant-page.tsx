"use client";

import { Activity, Bot, Check, Copy, Globe, KeyRound, MessagesSquare, Plug, Plus, Server, Settings2, SquarePen, Trash2, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ChatView } from "@/components/assistant/chat-view";
import { HistoryList } from "@/components/assistant/history-list";
import { suggestionsFor } from "@/components/assistant/assistant-widget";
import { useAssistantChat } from "@/components/assistant/use-assistant-chat";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import {
  createApiTokenAction,
  deleteAllConversationsAction,
  deleteMcpServerAction,
  listAvailableModelsAction,
  revokeApiTokenAction,
  saveAssistantSettingsAction,
  saveMcpServerAction,
  testMcpServerAction,
} from "@/lib/assistant/actions";
import type { Permission } from "@/lib/auth/session";
import { formatRelative } from "@/lib/format";

type Admin = {
  isAdmin: boolean;
  configured: boolean;
  defaultModel: string;
  settings: { model: string | null; webSearch: boolean; effort: "low" | "medium" | "high"; instructions: string | null };
  servers: { id: string; name: string; url: string; enabled: boolean; hasToken: boolean; createdAt: Date }[];
  tokens: { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date }[];
  usage: { input: number; output: number; conversations: number };
  appUrl: string;
};

export function AssistantPage({
  userName,
  permissions,
  configured,
  initialConversation,
  initialTab,
  admin,
}: {
  userName: string;
  permissions: Permission[];
  configured: boolean;
  initialConversation: string | null;
  initialTab: "chat" | "setari";
  admin: Admin;
}) {
  const chat = useAssistantChat();
  const { openConversation } = chat;
  React.useEffect(() => {
    if (initialConversation) openConversation(initialConversation);
  }, [initialConversation, openConversation]);
  const suggestions = React.useMemo(() => suggestionsFor(permissions), [permissions]);

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="chat">
          <MessagesSquare /> Conversații
        </TabsTrigger>
        <TabsTrigger value="setari">
          <Settings2 /> Setări, MCP & chei API
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chat">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="hidden h-[calc(100dvh-15rem)] min-h-[520px] flex-col overflow-hidden lg:flex">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Istoric</span>
              <Button size="xs" variant="soft" onClick={chat.newChat}>
                <SquarePen /> Nouă
              </Button>
            </div>
            <HistoryList chat={chat} />
            <div className="border-t border-border p-2">
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="xs" className="w-full text-muted-foreground">
                    <Trash2 /> Șterge tot istoricul
                  </Button>
                }
                title="Ștergi toate conversațiile?"
                description="Conversațiile tale cu asistentul vor fi șterse definitiv."
                destructive
                confirmLabel="Șterge tot"
                onConfirm={async () => {
                  const r = await deleteAllConversationsAction();
                  if (r.ok) {
                    chat.setConversations([]);
                    chat.newChat();
                    toast.success(r.message);
                  } else toast.error(r.error);
                }}
              />
            </div>
          </Card>
          <Card className="relative flex h-[calc(100dvh-15rem)] min-h-[520px] flex-col overflow-hidden">
            <div className="pointer-events-none absolute -top-32 -right-32 size-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex items-center gap-3 border-b border-border px-5 py-3">
              <Bot className="size-4 text-primary" />
              <span className="truncate text-sm font-medium">{chat.title ?? "Conversație nouă"}</span>
              <Badge tone="brand" className="ml-auto">
                {admin.settings.model ?? admin.defaultModel}
              </Badge>
              <Button size="xs" variant="ghost" onClick={chat.newChat} className="lg:hidden">
                <SquarePen />
              </Button>
            </div>
            <ChatView chat={chat} userName={userName} suggestions={suggestions} configured={configured} />
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="setari">
        <SettingsTab admin={admin} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2">
      <code className={`min-w-0 flex-1 overflow-x-auto text-xs whitespace-pre ${mono ? "font-mono" : ""}`}>{value}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Copiază"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function SettingsTab({ admin }: { admin: Admin }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [form, setForm] = React.useState(admin.settings);
  const [models, setModels] = React.useState<string[] | null>(null);
  const [serverDialog, setServerDialog] = React.useState<null | { id?: string; name: string; url: string; token: string; enabled: boolean }>(null);
  const [tokenName, setTokenName] = React.useState("");
  const [newToken, setNewToken] = React.useState<string | null>(null);
  const [snippet, setSnippet] = React.useState<"claude" | "desktop" | "openai" | "curl">("claude");
  const mcpUrl = `${admin.appUrl.replace(/\/$/, "")}/api/mcp`;
  const tokenShown = newToken ?? "afd_…";

  React.useEffect(() => {
    if (!admin.isAdmin || !admin.configured) return;
    listAvailableModelsAction().then((r) => r.ok && setModels(r.data));
  }, [admin.isAdmin, admin.configured]);

  const snippets = {
    claude: `claude mcp add --transport http anaf-for-dummies ${mcpUrl} \\\n  --header "Authorization: Bearer ${tokenShown}"`,
    desktop: JSON.stringify({ mcpServers: { "anaf-for-dummies": { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", `Authorization: Bearer ${tokenShown}`] } } }, null, 2),
    openai: JSON.stringify({ type: "mcp", server_label: "anaf_for_dummies", server_url: mcpUrl, headers: { Authorization: `Bearer ${tokenShown}` }, require_approval: "never" }, null, 2),
    curl: `curl -s ${mcpUrl} \\\n  -H "Authorization: Bearer ${tokenShown}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  };

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatCard label="Conversații luna aceasta" value={admin.usage.conversations} format="number" icon={<MessagesSquare />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Tokeni de intrare" value={admin.usage.input} format="number" icon={<Activity />} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Tokeni generați" value={admin.usage.output} format="number" icon={<Zap />} tone="success" />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-4 xl:grid-cols-2">
        {admin.isAdmin && (
          <Card>
            <CardHeaderRow icon={<Bot />} title="Model și comportament" description="Se aplică tuturor utilizatorilor firmei." />
            <CardContent className="space-y-4">
              {!admin.configured && (
                <div className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                  Lipsește <code className="font-mono">OPENAI_API_KEY</code> — adaug-o în <code className="font-mono">.env.local</code> și repornește aplicația.
                </div>
              )}
              <Field label="Model OpenAI" hint={models ? `${models.length} modele disponibile în contul tău` : "Se încarcă lista de modele din contul OpenAI…"}>
                <NativeSelect value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value || null })}>
                  <option value="">Implicit ({admin.defaultModel})</option>
                  {(models ?? (form.model ? [form.model] : [])).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Efort de raționament" hint="Mai mult efort = răspunsuri mai atente, dar mai lente și mai scumpe.">
                <Segmented
                  value={form.effort}
                  onChange={(v) => setForm({ ...form, effort: v })}
                  options={[
                    { value: "low", label: "Rapid" },
                    { value: "medium", label: "Echilibrat" },
                    { value: "high", label: "Atent" },
                  ]}
                />
              </Field>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="flex items-center gap-2.5 text-sm">
                  <Globe className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">Căutare pe web</span>
                    <span className="block text-xs text-muted-foreground">Pentru legislație fiscală, termene ANAF, cote TVA</span>
                  </span>
                </span>
                <Switch checked={form.webSearch} onCheckedChange={(v) => setForm({ ...form, webSearch: v })} />
              </label>
              <Field label="Instrucțiuni personalizate" hint="Ex.: „Răspunde mereu cu sume fără TVA” sau „Clienții noștri principali sunt…”">
                <Textarea value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={4} />
              </Field>
              <Button loading={pending} onClick={() => run(() => saveAssistantSettingsAction(form), { onSuccess: () => router.refresh() })}>
                Salvează setările
              </Button>
            </CardContent>
          </Card>
        )}

        {admin.isAdmin && (
          <Card>
            <CardHeaderRow
              icon={<Plug />}
              title="Conectori MCP externi"
              description="Servere MCP pe care asistentul le poate folosi (Notion, Linear, GitHub, CRM intern…). OpenAI le apelează direct, deci trebuie să fie publice, prin HTTPS."
              actions={
                <Button size="sm" variant="soft" onClick={() => setServerDialog({ name: "", url: "", token: "", enabled: true })}>
                  <Plus /> Adaugă
                </Button>
              }
            />
            <CardContent className="space-y-2">
              {!admin.servers.length && <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Niciun conector configurat.</p>}
              {admin.servers.map((s) => (
                <motion.div key={s.id} layout className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <Server className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {s.name}
                      <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "activ" : "oprit"}</Badge>
                      {s.hasToken && <Badge tone="brand">autentificat</Badge>}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{s.url}</div>
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setServerDialog({ id: s.id, name: s.name, url: s.url, token: "", enabled: s.enabled })}>
                    Editează
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="icon-xs" variant="ghost">
                        <Trash2 />
                      </Button>
                    }
                    title={`Ștergi conectorul „${s.name}”?`}
                    destructive
                    onConfirm={() => run(() => deleteMcpServerAction(s.id), { onSuccess: () => router.refresh() })}
                  />
                </motion.div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="xl:col-span-2">
          <CardHeaderRow
            icon={<KeyRound />}
            title="Serverul MCP AND"
            description="Conectează datele firmei la Claude Desktop/Code, ChatGPT, Cursor sau orice client MCP. Fiecare cheie are drepturile contului tău."
          />
          <CardContent className="space-y-5">
            <Field label="Endpoint (Streamable HTTP)">
              <CopyField value={mcpUrl} />
            </Field>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Numele cheii (ex. Claude Desktop)" />
                  <Button
                    loading={pending}
                    onClick={() =>
                      run(() => createApiTokenAction(tokenName), {
                        onSuccess: (d) => {
                          setNewToken(d.token);
                          setTokenName("");
                          router.refresh();
                        },
                      })
                    }
                  >
                    <Plus /> Cheie nouă
                  </Button>
                </div>
                {newToken && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-lg border border-success/30 bg-success-soft p-3">
                    <p className="text-xs font-medium text-success-soft-foreground">Copiază cheia acum — din motive de securitate nu va mai fi afișată.</p>
                    <CopyField value={newToken} />
                  </motion.div>
                )}
                <div className="space-y-2">
                  {!admin.tokens.length && <p className="text-sm text-muted-foreground">Nu ai chei active.</p>}
                  {admin.tokens.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <KeyRound className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{t.prefix}…</span> · {t.lastUsedAt ? `folosită ${formatRelative(t.lastUsedAt)}` : "nefolosită"}
                        </div>
                      </div>
                      <ConfirmDialog
                        trigger={
                          <Button size="xs" variant="destructive-soft">
                            Revocă
                          </Button>
                        }
                        title={`Revoci cheia „${t.name}”?`}
                        description="Clienții care o folosesc își pierd accesul imediat."
                        destructive
                        confirmLabel="Revocă"
                        onConfirm={() => run(() => revokeApiTokenAction(t.id), { onSuccess: () => router.refresh() })}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Segmented
                  size="sm"
                  value={snippet}
                  onChange={setSnippet}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "desktop", label: "Claude Desktop / Cursor" },
                    { value: "openai", label: "OpenAI API" },
                    { value: "curl", label: "curl" },
                  ]}
                />
                <CopyField value={snippets[snippet]} />
                <p className="text-xs text-muted-foreground">
                  Unelte expuse: facturi, restanțe, parteneri, cheltuieli, stocuri, e-Factura, ANAF CUI, curs BNR, proiecte, pontaje, echipă — plus crearea de facturi și pontaje ciornă.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!serverDialog} onOpenChange={(o) => !o && setServerDialog(null)}>
        <DialogContent>
          {serverDialog && (
            <>
              <DialogHeader>
                <DialogTitle>{serverDialog.id ? "Editează conectorul MCP" : "Conector MCP nou"}</DialogTitle>
                <DialogDescription>Asistentul va putea folosi uneltele expuse de acest server.</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <Field label="Nume (identificator)" hint="litere mici, cifre, - și _">
                  <Input value={serverDialog.name} onChange={(e) => setServerDialog({ ...serverDialog, name: e.target.value.toLowerCase() })} placeholder="notion" />
                </Field>
                <Field label="URL server MCP">
                  <Input value={serverDialog.url} onChange={(e) => setServerDialog({ ...serverDialog, url: e.target.value })} placeholder="https://mcp.exemplu.ro/mcp" />
                </Field>
                <Field label="Token de autorizare (opțional)" hint={serverDialog.id ? "Lasă gol pentru a păstra tokenul existent" : "Trimis ca Authorization: Bearer …, stocat criptat"}>
                  <Input type="password" value={serverDialog.token} onChange={(e) => setServerDialog({ ...serverDialog, token: e.target.value })} />
                </Field>
                <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  Activ
                  <Switch checked={serverDialog.enabled} onCheckedChange={(v) => setServerDialog({ ...serverDialog, enabled: v })} />
                </label>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  loading={pending}
                  onClick={() => run(() => testMcpServerAction({ url: serverDialog.url, token: serverDialog.token || null }), { success: (d) => `Serverul răspunde: ${d.server}` })}
                >
                  Testează
                </Button>
                <Button
                  loading={pending}
                  onClick={() =>
                    run(() => saveMcpServerAction({ ...serverDialog, token: serverDialog.token || null }), {
                      onSuccess: () => {
                        setServerDialog(null);
                        router.refresh();
                      },
                    })
                  }
                >
                  Salvează
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
