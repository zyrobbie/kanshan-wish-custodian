import crypto from "node:crypto";
import fs from "node:fs";

const envPath = new URL("../.env.taobao.local", import.meta.url);
const credentialsPath = "/Users/zhihu/.urp/credentials.json";

function readEnv(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function timestamp() {
  return new Intl.DateTimeFormat("sv-SE", {
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
}

function sign(params, secret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return crypto
    .createHash("md5")
    .update(`${secret}${payload}${secret}`, "utf8")
    .digest("hex")
    .toUpperCase();
}

function parseRpcBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    const events = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const event of events.reverse()) {
      try {
        return JSON.parse(event);
      } catch {
        // Continue to the previous event.
      }
    }
  }
  return null;
}

function findConversion(value, seen = new Set()) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return findConversion(JSON.parse(value), seen);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (
    "success" in value &&
    ("cpsShortUrl" in value || "message" in value || "pid" in value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const found = findConversion(child, seen);
    if (found) return found;
  }
  return null;
}

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

const env = readEnv(envPath);
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const accessKey =
  typeof credentials.access_key === "string"
    ? credentials.access_key
    : credentials.access_key?.value;
const required = [
  "TAOBAO_APP_KEY",
  "TAOBAO_APP_SECRET",
  "TAOBAO_ADZONE_ID",
  "TAOBAO_PID",
];
const missing = required.filter((key) => !env[key]);
if (missing.length || !accessKey) {
  throw new Error(
    missing.length
      ? `缺少环境变量：${missing.join(", ")}`
      : "缺少转链 Skill Access Key",
  );
}

const pidParts = env.TAOBAO_PID.split("_");
if (
  pidParts.length !== 4 ||
  pidParts[3] !== env.TAOBAO_ADZONE_ID ||
  !/^mm_\d+_\d+_\d+$/.test(env.TAOBAO_PID)
) {
  throw new Error("TAOBAO_PID 与 TAOBAO_ADZONE_ID 不匹配");
}

const searchParams = {
  method: "taobao.tbk.dg.material.optional.upgrade",
  app_key: env.TAOBAO_APP_KEY,
  timestamp: timestamp(),
  format: "json",
  v: "2.0",
  sign_method: "md5",
  adzone_id: env.TAOBAO_ADZONE_ID,
  site_id: pidParts[2],
  material_id: "80309",
  biz_scene_id: "1",
  q: process.argv[2] || "露营灯",
  page_no: "1",
  page_size: "5",
};
searchParams.sign = sign(searchParams, env.TAOBAO_APP_SECRET);

const searchResponse = await fetch("https://eco.taobao.com/router/rest", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
  body: new URLSearchParams(searchParams),
});
const searchPayload = await searchResponse.json();
if (searchPayload.error_response) {
  throw new Error(
    `搜索失败：${searchPayload.error_response.sub_code ?? searchPayload.error_response.msg}`,
  );
}

const product =
  searchPayload.tbk_dg_material_optional_upgrade_response?.result_list?.map_data?.[0];
if (!product?.item_id) throw new Error("搜索没有返回可转链的商品营销 ID");
const prices = normalizePrice(product);

const endpoint = "https://tmcp.taobao.com/mcp/union-ai-platform-server/mcp";
const commonHeaders = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  authorization: `Bearer ${accessKey}`,
};
const initializeResponse = await fetch(endpoint, {
  method: "POST",
  headers: commonHeaders,
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "init-transfer-check",
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "kanshan-wish-store", version: "1.0.0" },
    },
  }),
});
const sessionId = initializeResponse.headers.get("mcp-session-id");
if (!initializeResponse.ok || !sessionId) {
  throw new Error(`MCP 初始化失败：HTTP ${initializeResponse.status}`);
}

const callResponse = await fetch(endpoint, {
  method: "POST",
  headers: { ...commonHeaders, "mcp-session-id": sessionId },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "call-transfer-check",
    method: "tools/call",
    params: {
      name: "entry",
      arguments: {
        arg0: "R1LWxXhl.VRFe",
        arg1: "query",
        arg2: "tql_obSb3eZV",
        arg3: {
          itemId: product.item_id,
          pid: env.TAOBAO_PID,
          siteId: pidParts[2],
          adzoneId: pidParts[3],
          scenarioContext:
            "看山愿望商店购物卡验收：用户选择搜索结果后生成指定推广位的 CPS 短链",
        },
      },
    },
  }),
});
const callText = await callResponse.text();
const rpc = parseRpcBody(callText);
const conversion = findConversion(rpc);
if (!callResponse.ok || rpc?.error || !conversion) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        stage: "tools/call",
        httpStatus: callResponse.status,
        rpcErrorCode: rpc?.error?.code ?? null,
        rpcErrorMessage: rpc?.error?.message ?? null,
        responseReceived: callText.length > 0,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const pidMatches = conversion.pid === env.TAOBAO_PID;
const cpsShortUrl = conversion.cpsShortUrl;
if (!conversion.success || !pidMatches || !cpsShortUrl) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        stage: "conversion",
        success: conversion.success ?? false,
        message: conversion.message ?? null,
        returnedPid: conversion.pid ?? null,
        expectedPid: env.TAOBAO_PID,
        pidMatches,
        cpsShortUrlPresent: !!cpsShortUrl,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

credentials.defaultPid = conversion.pid;
fs.writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
  mode: 0o600,
});
fs.chmodSync(credentialsPath, 0o600);

console.log(
  JSON.stringify(
    {
      ok: true,
      product: {
        itemId: product.item_id,
        title: product.item_basic_info?.title ?? product.title,
        image: product.item_basic_info?.pict_url ?? product.pict_url,
        price: prices.displayPrice,
        priceLabel: prices.displayPriceLabel,
        prices,
      },
      returnedPid: conversion.pid,
      pidMatches,
      cpsShortUrl,
      defaultPidSaved: credentials.defaultPid === conversion.pid,
      credentialsPermissions: (
        fs.statSync(credentialsPath).mode & 0o777
      ).toString(8),
    },
    null,
    2,
  ),
);
