import crypto from "node:crypto";
import fs from "node:fs";

const envPath = new URL("../.env.taobao.local", import.meta.url);
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

const required = ["TAOBAO_APP_KEY", "TAOBAO_APP_SECRET", "TAOBAO_ADZONE_ID"];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  throw new Error(`缺少环境变量：${missing.join(", ")}`);
}

const timestamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})
  .format(new Date())
  .replace("T", " ");

const requestedMode = process.argv[3];
const mode = ["featured", "upgrade"].includes(requestedMode)
  ? requestedMode
  : "search";
const pidParts = env.TAOBAO_PID?.split("_") ?? [];
if (mode === "upgrade" && pidParts.length !== 4) {
  throw new Error("升级版物料搜索需要合法的 TAOBAO_PID");
}
const params = {
  method:
    mode === "featured"
      ? "taobao.tbk.dg.optimus.material"
      : mode === "upgrade"
        ? "taobao.tbk.dg.material.optional.upgrade"
        : "taobao.tbk.dg.material.optional",
  app_key: env.TAOBAO_APP_KEY,
  timestamp,
  format: "json",
  v: "2.0",
  sign_method: "md5",
  adzone_id: env.TAOBAO_ADZONE_ID,
  page_no: "1",
  page_size: "5",
};

if (mode === "featured") {
  params.material_id = "3767";
} else if (mode === "upgrade") {
  params.q = process.argv[2] || "露营灯";
  params.site_id = pidParts[2];
  params.material_id = "80309";
  params.biz_scene_id = "1";
} else {
  params.q = process.argv[2] || "露营灯";
  params.platform = "2";
}

const signPayload = Object.keys(params)
  .sort()
  .map((key) => `${key}${params[key]}`)
  .join("");
params.sign = crypto
  .createHash("md5")
  .update(`${env.TAOBAO_APP_SECRET}${signPayload}${env.TAOBAO_APP_SECRET}`, "utf8")
  .digest("hex")
  .toUpperCase();

const response = await fetch("https://eco.taobao.com/router/rest", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
  body: new URLSearchParams(params),
});
const payload = await response.json();

function normalizePrice(item) {
  const info = item.price_promotion_info ?? {};
  const finalPrice = info.final_promotion_price;
  const salePrice = item.zk_final_price ?? info.zk_final_price;
  const listPrice = info.reserve_price;
  const estimatedBundlePrice = info.predict_rounding_up_price;

  return {
    displayPrice: finalPrice ?? salePrice ?? listPrice,
    displayPriceLabel: finalPrice ? "预估到手价" : salePrice ? "销售价" : "参考价",
    listPrice,
    salePrice,
    finalPromotionPrice: finalPrice,
    estimatedBundlePrice,
    estimatedBundlePriceDescription: info.predict_rounding_up_price_desc,
  };
}

if (payload.error_response) {
  const { code, sub_code, msg, sub_msg, request_id } = payload.error_response;
  console.log(JSON.stringify({ ok: false, code, sub_code, msg, sub_msg, request_id }, null, 2));
  process.exitCode = 1;
} else {
  const responsePayload =
    mode === "featured"
      ? payload.tbk_dg_optimus_material_response
      : mode === "upgrade"
        ? payload.tbk_dg_material_optional_upgrade_response
        : payload.tbk_dg_material_optional_response;
  const result = responsePayload?.result_list?.map_data ?? [];
  const products = result.slice(0, 5).map((item) => {
    const prices = normalizePrice(item);
    return {
      itemId: item.item_id ?? item.item_id_str,
      title: item.title ?? item.item_basic_info?.title,
      image: item.pict_url ?? item.item_basic_info?.pict_url,
      price: prices.displayPrice,
      priceLabel: prices.displayPriceLabel,
      prices,
      couponAmount:
        item.coupon_amount ?? item.price_promotion_info?.coupon_amount,
      promotionUrl:
        item.coupon_share_url ??
        item.url ??
        item.publish_info?.coupon_share_url ??
        item.publish_info?.click_url,
    };
  });
  console.log(
    JSON.stringify(
      { ok: true, mode, keyword: params.q, count: result.length, products },
      null,
      2,
    ),
  );
}
