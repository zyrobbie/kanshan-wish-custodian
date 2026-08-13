import { createHash } from "node:crypto";
import { cors, json, requireAllowedOrigin, safeError } from "../_shared/http.ts";

const formatShanghaiTime = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace("T", " ");
const md5 = (value: string) => createHash("md5").update(value, "utf8").digest("hex").toUpperCase();

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  try {
    const { query } = await request.json();
    const normalized = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
    if (normalized.length < 2 || normalized.length > 80) return json({ ok: false, error: "invalid_query" }, 400, origin);
    const key = Deno.env.get("TAOBAO_APP_KEY"); const secret = Deno.env.get("TAOBAO_APP_SECRET");
    const pid = Deno.env.get("TAOBAO_PID"); const adzoneId = Deno.env.get("TAOBAO_ADZONE_ID");
    if (!key || !secret || !pid || !adzoneId) return json({ ok: false, error: "service_not_configured" }, 503, origin);
    const parts = pid.split("_"); if (parts.length !== 4 || parts[3] !== adzoneId) return json({ ok: false, error: "service_misconfigured" }, 503, origin);
    const params: Record<string, string> = { method: "taobao.tbk.dg.material.optional.upgrade", app_key: key, timestamp: formatShanghaiTime(), format: "json", v: "2.0", sign_method: "md5", adzone_id: adzoneId, site_id: parts[2], material_id: "80309", biz_scene_id: "1", q: normalized, page_no: "1", page_size: "5" };
    const payload = Object.keys(params).sort().map((name) => `${name}${params[name]}`).join(""); params.sign = md5(`${secret}${payload}${secret}`);
    const response = await fetch("https://eco.taobao.com/router/rest", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!response.ok || data.error_response) return json({ ok: false, error: "provider_unavailable" }, 502, origin);
    const items = data.tbk_dg_material_optional_upgrade_response?.result_list?.map_data ?? [];
    const products = items.slice(0, 5).map((item: Record<string, unknown>) => ({ itemId: item.item_id ?? item.item_id_str, title: item.title ?? (item.item_basic_info as Record<string, unknown> | undefined)?.title, imageUrl: item.pict_url ?? (item.item_basic_info as Record<string, unknown> | undefined)?.pict_url, price: (item.price_promotion_info as Record<string, unknown> | undefined)?.final_promotion_price ?? item.zk_final_price, promotionUrl: item.coupon_share_url ?? item.url })).filter((item: Record<string, unknown>) => item.itemId && item.title && item.price);
    console.log(JSON.stringify({ event: "products_search", ok: true, result_count: products.length }));
    return json({ ok: true, products }, 200, origin);
  } catch (error) { console.log(JSON.stringify({ event: "products_search", ok: false, error: safeError(error) })); return json({ ok: false, error: "request_failed" }, 500, typeof origin === "string" ? origin : null); }
});
