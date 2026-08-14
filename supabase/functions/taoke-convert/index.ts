const json = (body: Record<string, unknown>, status = 200, origin?: string | null) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}) },
});
const allowedOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return origin && configured.includes(origin) ? origin : null;
};
const cors = (request: Request) => {
  if (request.method !== "OPTIONS") return null;
  const origin = allowedOrigin(request);
  return new Response(null, { status: origin ? 204 : 403, headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600", vary: "Origin" } : {} });
};
const requireAllowedOrigin = (request: Request): string | Response => allowedOrigin(request) ?? json({ ok: false, error: "origin_not_allowed" }, 403);
const safeError = (error: unknown) => error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]") : "request failed";

function findConversion(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if ("success" in record && ("cpsShortUrl" in record || "message" in record)) return record;
  for (const child of Object.values(record)) { const found = findConversion(child); if (found) return found; }
  return null;
}

function parseRpcBody(text: string): unknown {
  try { return JSON.parse(text); } catch { /* MCP may respond as Server-Sent Events. */ }
  const events = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
  for (const event of events.reverse()) { try { return JSON.parse(event); } catch { /* inspect previous event */ } }
  return null;
}

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  try {
    const { itemId, material } = await request.json();
    if (typeof itemId !== "string" && typeof material !== "string") return json({ ok: false, error: "invalid_input" }, 400, origin);
    const accessKey = Deno.env.get("TAOKE_CONVERT_ACCESS_KEY"); const pid = Deno.env.get("TAOBAO_PID");
    if (!accessKey || !pid) return json({ ok: false, error: "service_not_configured" }, 503, origin);
    const [_, memberId, siteId, adzoneId] = pid.split("_"); if (!memberId || !siteId || !adzoneId) return json({ ok: false, error: "service_misconfigured" }, 503, origin);
    const endpoint = "https://tmcp.taobao.com/mcp/union-ai-platform-server/mcp";
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${accessKey}` };
    const initialized = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "kanshan-phase1", version: "0.1.0" } } }), signal: AbortSignal.timeout(10_000) });
    const sessionId = initialized.headers.get("mcp-session-id"); if (!initialized.ok || !sessionId) return json({ ok: false, error: "provider_unavailable" }, 502, origin);
    const converted = await fetch(endpoint, { method: "POST", headers: { ...headers, "mcp-session-id": sessionId }, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: "entry", arguments: { arg0: "R1LWxXhl.VRFe", arg1: "query", arg2: "tql_obSb3eZV", arg3: { ...(typeof itemId === "string" ? { itemId } : { material }), pid, siteId, adzoneId, scenarioContext: "看山愿望商店：用户已选择还想买，生成指定推广位 CPS 链接" } } } }), signal: AbortSignal.timeout(10_000) });
    const raw = await converted.text(); const rpc = parseRpcBody(raw);
    const conversion = findConversion(rpc);
    if (!converted.ok || !conversion || conversion.success !== true || typeof conversion.cpsShortUrl !== "string") return json({ ok: false, error: "provider_unavailable" }, 502, origin);
    console.log(JSON.stringify({ event: "taoke_convert", ok: true, link_type: "cps_short" }));
    return json({ ok: true, linkGenerated: true, linkType: "cps_short" }, 200, origin);
  } catch (error) { console.log(JSON.stringify({ event: "taoke_convert", ok: false, error: safeError(error) })); return json({ ok: false, error: "request_failed" }, 500, typeof origin === "string" ? origin : null); }
});
