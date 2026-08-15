import { createHash } from "node:crypto";
import { cors, json, requireAllowedOrigin } from "../_shared/http.ts";
import { classifyProviderFailure, normalizeProducts, normalizeQuery } from "../_shared/taobao-product.js";

const formatShanghaiTime = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace("T", " ");
const md5 = (value: string) => createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
const log = (ok: boolean, category: string, resultCount: number, startedAt: number) => console.log(JSON.stringify({ event: "products_search", ok, category, result_count: resultCount, duration_ms: Date.now() - startedAt }));

const providerCode = (data: unknown) => {
  const error = data && typeof data === "object" ? (data as Record<string, unknown>).error_response : null;
  return error && typeof error === "object" ? String((error as Record<string, unknown>).sub_code ?? (error as Record<string, unknown>).code ?? "") : "";
};

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) { log(false, "origin_not_allowed", 0, startedAt); return origin; }
  if (request.method !== "POST") { log(false, "request_failed", 0, startedAt); return json({ ok: false, error: "request_failed" }, 405, origin); }
  if (!request.headers.get("authorization")) { log(false, "authentication_required", 0, startedAt); return json({ ok: false, error: "authentication_required" }, 401, origin); }
  try {
    const body = await request.json();
    const query = normalizeQuery(body?.query);
    if (!query) { log(false, "invalid_query", 0, startedAt); return json({ ok: false, error: "invalid_query" }, 400, origin); }
    const key = Deno.env.get("TAOBAO_APP_KEY"); const secret = Deno.env.get("TAOBAO_APP_SECRET");
    const pid = Deno.env.get("TAOBAO_PID"); const adzoneId = Deno.env.get("TAOBAO_ADZONE_ID");
    if (!key || !secret || !pid || !adzoneId) { log(false, "service_not_configured", 0, startedAt); return json({ ok: false, error: "service_not_configured" }, 503, origin); }
    const parts = pid.split("_");
    if (parts.length !== 4 || parts[3] !== adzoneId || !parts[2]) { log(false, "service_misconfigured", 0, startedAt); return json({ ok: false, error: "service_misconfigured" }, 503, origin); }
    const params: Record<string, string> = { method: "taobao.tbk.dg.material.optional.upgrade", app_key: key, timestamp: formatShanghaiTime(), format: "json", v: "2.0", sign_method: "md5", adzone_id: adzoneId, site_id: parts[2], material_id: "80309", biz_scene_id: "1", q: query, page_no: "1", page_size: "5" };
    const payload = Object.keys(params).sort().map((name) => `${name}${params[name]}`).join("");
    params.sign = md5(`${secret}${payload}${secret}`);
    const response = await fetch("https://eco.taobao.com/router/rest", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!response.ok || (data && typeof data === "object" && "error_response" in data)) {
      const error = classifyProviderFailure({ status: response.status, code: providerCode(data) });
      log(false, error, 0, startedAt); return json({ ok: false, error }, 502, origin);
    }
    const responseBody = data as Record<string, unknown>;
    const providerResponse = responseBody.tbk_dg_material_optional_upgrade_response as Record<string, unknown> | undefined;
    const resultList = providerResponse?.result_list as Record<string, unknown> | undefined;
    const products = normalizeProducts(resultList?.map_data, { query, fetchedAt: new Date().toISOString() });
    log(true, products.length ? "success" : "empty_result", products.length, startedAt);
    return json({ ok: true, products }, 200, origin);
  } catch (error) {
    const category = classifyProviderFailure({ name: error instanceof Error ? error.name : undefined });
    const stableError = category === "provider_timeout" ? category : "request_failed";
    log(false, stableError, 0, startedAt);
    return json({ ok: false, error: stableError }, stableError === "provider_timeout" ? 504 : 500, origin);
  }
});
