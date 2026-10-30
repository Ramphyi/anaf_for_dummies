import { toolCtxFromToken } from "@/lib/assistant/context";
import { executeTool, toolJsonSchema, toolsFor } from "@/lib/assistant/tools";

export const runtime = "nodejs";

/**
 * Server MCP (Model Context Protocol, transport Streamable HTTP, răspunsuri JSON) care expune
 * datele firmei ca unelte pentru clienți externi: Claude Desktop/Code, ChatGPT, Cursor etc.
 * Autentificare: `Authorization: Bearer afd_…` (chei generate din Asistent → Chei API).
 */
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const ctx = token ? await toolCtxFromToken(token) : null;
  if (!ctx) {
    return Response.json(rpcError(null, -32001, "Neautorizat: trimite o cheie API AND validă în header-ul Authorization."), {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="anaf-for-dummies-mcp"' },
    });
  }

  let payload: RpcRequest | RpcRequest[];
  try {
    payload = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "JSON invalid"), { status: 400 });
  }

  const handle = async (msg: RpcRequest) => {
    if (msg.id === undefined) return null; // notificare (ex. notifications/initialized)
    switch (msg.method) {
      case "initialize": {
        const requested = String(msg.params?.protocolVersion ?? "");
        return rpcResult(msg.id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "anaf-for-dummies", title: "AND · ANAF for Dummies — facturare, ANAF & echipă", version: "1.0.0" },
          instructions: `Date din platforma AND (ANAF for Dummies) pentru firma ${ctx.companyName}: facturi, încasări, cheltuieli, stocuri, e-Factura/SPV, proiecte, pontaje și echipă. Linkurile din rezultate sunt căi relative în aplicația ANAF for Dummies.`,
        });
      }
      case "ping":
        return rpcResult(msg.id, {});
      case "tools/list":
        return rpcResult(msg.id, {
          tools: toolsFor(ctx.permissions).map((t) => ({
            name: t.name,
            title: t.label,
            description: t.description,
            inputSchema: toolJsonSchema(t),
            annotations: { readOnlyHint: !t.mutates, destructiveHint: false, openWorldHint: t.name === "lookup_company_anaf" || t.name === "get_exchange_rates" },
          })),
        });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const r = await executeTool(ctx, name, msg.params?.arguments ?? {});
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(r.ok ? r.data : { error: r.error }, null, 2) }],
          isError: !r.ok,
        });
      }
      default:
        return rpcError(msg.id, -32601, `Metodă necunoscută: ${msg.method}`);
    }
  };

  if (Array.isArray(payload)) {
    const out = (await Promise.all(payload.map(handle))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(payload);
  return out ? Response.json(out, { headers: { "MCP-Protocol-Version": SUPPORTED_VERSIONS[0] } }) : new Response(null, { status: 202 });
}

export function GET() {
  return new Response("Acest server MCP nu oferă stream SSE; folosește POST.", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
