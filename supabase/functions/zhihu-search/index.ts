import { cors, json, requireAllowedOrigin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  try {
    const { query } = await request.json();
    const normalized = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
    const secret = Deno.env.get("ZHIHU_ACCESS_SECRET");
    if (normalized.length < 2 || normalized.length > 80) return json({ ok: false, error: "invalid_query" }, 400, origin);
    if (!secret) return json({ ok: false, error: "service_not_configured" }, 503, origin);
    const url = new URL("https://developer.zhihu.com/api/v1/content/zhihu_search"); url.searchParams.set("Query", normalized); url.searchParams.set("Count", "5");
    const response = await fetch(url, { headers: { authorization: `Bearer ${secret}`, "x-request-timestamp": String(Math.floor(Date.now() / 1000)), "content-type": "application/json" }, signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!response.ok || data.Code !== 0) return json({ ok: false, error: "provider_unavailable" }, 502, origin);
    const items = (data.Data?.Items ?? []).map((item: Record<string, unknown>) => ({ title: item.Title, authorName: item.AuthorName, authorBadgeText: item.AuthorBadgeText, contentType: item.ContentType, excerpt: String(item.ContentText ?? "").replace(/<[^>]+>/g, "").slice(0, 600), url: item.Url, voteUpCount: item.VoteUpCount, authorityLevel: item.AuthorityLevel, editTime: item.EditTime }));
    console.log(JSON.stringify({ event: "zhihu_search", ok: true, result_count: items.length })); return json({ ok: true, items }, 200, origin);
  } catch (error) { console.log(JSON.stringify({ event: "zhihu_search", ok: false, error: safeError(error) })); return json({ ok: false, error: "request_failed" }, 500, typeof origin === "string" ? origin : null); }
});
