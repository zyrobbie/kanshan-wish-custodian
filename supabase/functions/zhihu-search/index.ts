import { cors, json, requireAllowedOrigin } from "../_shared/http.ts";
import { buildZhihuQueries, compressEvidenceBatch, finalizeEvidenceSummaries, providerErrorCode, selectEvidence } from "../_shared/zhihu-evidence.js";

const endpoint = "https://developer.zhihu.com/api/v1/content/zhihu_search";
const layerNames = ["expert", "experience"] as const;
type LayerName = typeof layerNames[number];

const log = (payload: Record<string, unknown>) => console.log(JSON.stringify({
  event: "zhihu_search",
  ok: Boolean(payload.ok),
  category: payload.category ?? "success",
  expert_status: payload.expert_status ?? "error",
  experience_status: payload.experience_status ?? "error",
  expert_count: payload.expert_count ?? 0,
  experience_count: payload.experience_count ?? 0,
  summary_status: payload.summary_status ?? "fallback",
  duration_ms: payload.duration_ms ?? 0,
}));

const providerItems = async (query: string, secret: string) => {
  const url = new URL(endpoint);
  url.searchParams.set("Query", query);
  url.searchParams.set("Count", "5");
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${secret}`,
      "x-request-timestamp": String(Math.floor(Date.now() / 1000)),
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  let data: Record<string, unknown> | null = null;
  try { data = await response.json(); } catch { /* mapped below */ }
  if (!response.ok || !data || data.Code !== 0) {
    const code = data && typeof data === "object" ? (data as Record<string, unknown>).Code : undefined;
    throw Object.assign(new Error("provider request failed"), { stableCode: providerErrorCode({ status: response.status, code }) });
  }
  const body = data.Data;
  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).Items)) {
    throw Object.assign(new Error("provider response invalid"), { stableCode: "invalid_response" });
  }
  return (body as Record<string, unknown>).Items;
};

const stableFailure = (reason: unknown) => {
  if (reason && typeof reason === "object" && typeof (reason as Record<string, unknown>).stableCode === "string") return (reason as Record<string, unknown>).stableCode;
  return providerErrorCode({ name: reason instanceof Error ? reason.name : undefined });
};

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) {
    log({ ok: false, category: "origin_not_allowed", duration_ms: Date.now() - startedAt }); return origin;
  }
  if (request.method !== "POST") {
    log({ ok: false, category: "request_failed", duration_ms: Date.now() - startedAt });
    return json({ ok: false, error: "request_failed" }, 405, origin);
  }
  if (!request.headers.get("authorization")) {
    log({ ok: false, category: "authentication_required", duration_ms: Date.now() - startedAt });
    return json({ ok: false, error: "authentication_required" }, 401, origin);
  }
  try {
    const body = await request.json();
    const queries = buildZhihuQueries(body?.productTitle);
    if (!queries) {
      log({ ok: false, category: "invalid_query", duration_ms: Date.now() - startedAt });
      return json({ ok: false, error: "invalid_query" }, 400, origin);
    }
    const secret = Deno.env.get("ZHIHU_ACCESS_SECRET");
    if (!secret) {
      log({ ok: false, category: "service_not_configured", duration_ms: Date.now() - startedAt });
      return json({ ok: false, error: "service_not_configured" }, 503, origin);
    }

    const [expertResult, experienceResult] = await Promise.allSettled([
      providerItems(queries.expert, secret),
      providerItems(queries.experience, secret),
    ]);
    const used = new Set<string>();
    const layers: Record<LayerName, { status: "ready" | "empty" | "error"; items: unknown[] }> = {
      expert: { status: "error", items: [] }, experience: { status: "error", items: [] },
    };
    for (const [layer, result] of [["expert", expertResult], ["experience", experienceResult]] as const) {
      if (result.status === "fulfilled") {
        const items = selectEvidence(result.value, layer, queries.coreProductName, used);
        layers[layer] = { status: items.length ? "ready" : "empty", items };
      }
    }
    const bothFailed = layerNames.every((layer) => layers[layer].status === "error");
    const expertCount = layers.expert.items.length;
    const experienceCount = layers.experience.items.length;
    if (bothFailed) {
      const category = stableFailure(expertResult.status === "rejected" ? expertResult.reason : experienceResult.reason);
      log({ ok: false, category, expert_status: "error", experience_status: "error", duration_ms: Date.now() - startedAt });
      return json({ ok: false, error: category }, category === "provider_timeout" ? 504 : 502, origin);
    }
    const selected = [...layers.expert.items, ...layers.experience.items];
    let summaries: Map<string, string> | null = null;
    let summaryStatus = "fallback";
    try {
      summaries = await compressEvidenceBatch(selected, secret);
      summaryStatus = summaries ? "zhida" : "fallback";
    } catch {
      // Zhida is an optional rendering enhancement. Its failures must never
      // turn already-retrieved Zhihu evidence into a page-level failure.
      summaryStatus = "fallback";
    }
    for (const layer of layerNames) layers[layer].items = finalizeEvidenceSummaries(layers[layer].items, summaries);
    log({ ok: true, category: "success", expert_status: layers.expert.status, experience_status: layers.experience.status, expert_count: expertCount, experience_count: experienceCount, summary_status: summaryStatus, duration_ms: Date.now() - startedAt });
    return json({ ok: true, coreProductName: queries.coreProductName, layers, fetchedAt: new Date().toISOString() }, 200, origin);
  } catch {
    log({ ok: false, category: "request_failed", duration_ms: Date.now() - startedAt });
    return json({ ok: false, error: "request_failed" }, 500, origin);
  }
});
