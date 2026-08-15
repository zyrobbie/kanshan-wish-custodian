const controlCharacters = /[\u0000-\u001F\u007F]/;

export function normalizeQuery(value) {
  if (typeof value !== 'string' || controlCharacters.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length >= 2 && normalized.length <= 80 ? normalized : null;
}

export function finiteMoney(value) {
  if (typeof value === 'string' && !value.trim()) return null;
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function officialPromotionUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? normalized : null;
  } catch { return null; }
}

export function safeImageUrl(value) {
  return officialPromotionUrl(value);
}

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

export function toProductCard(rawItem, { query, fetchedAt }) {
  const item = object(rawItem);
  const basic = object(item.item_basic_info);
  const promotion = object(item.price_promotion_info);
  const publishInfo = object(item.publish_info);
  const itemId = first(item.item_id, item.item_id_str);
  const title = first(item.title, basic.title);
  const price = finiteMoney(first(item.zk_final_price, promotion.zk_final_price, item.price));
  const finalPromotionPrice = finiteMoney(first(promotion.final_promotion_price, item.final_promotion_price));
  const promotionUrl = officialPromotionUrl(publishInfo.coupon_share_url) ?? officialPromotionUrl(publishInfo.click_url);
  if ((typeof itemId !== 'string' && typeof itemId !== 'number') || typeof title !== 'string' || !title.trim() || price === null || !promotionUrl) return null;

  const bundlePrice = finiteMoney(first(promotion.predict_rounding_up_price, item.predict_rounding_up_price));
  const bundlePriceCondition = first(promotion.predict_rounding_up_price_desc, item.predict_rounding_up_price_desc);
  const couponAmount = finiteMoney(first(promotion.coupon_amount, item.coupon_amount));
  return {
    provider: 'taobao',
    itemId: String(itemId),
    title: title.trim(),
    imageUrl: safeImageUrl(first(item.pict_url, basic.pict_url)),
    price,
    finalPrice: finalPromotionPrice ?? price,
    priceLabel: finalPromotionPrice === null ? '销售价' : '预估到手价',
    ...(bundlePrice !== null && typeof bundlePriceCondition === 'string' && bundlePriceCondition.trim() ? { bundlePrice, bundlePriceCondition: bundlePriceCondition.trim() } : {}),
    ...(couponAmount !== null ? { couponAmount } : {}),
    ...(typeof first(item.shop_title, item.shop_name, item.nick) === 'string' ? { shopName: String(first(item.shop_title, item.shop_name, item.nick)).trim() } : {}),
    promotionUrl,
    query,
    fetchedAt,
  };
}

export function normalizeProducts(rawItems, context) {
  return Array.isArray(rawItems) ? rawItems.map((item) => toProductCard(item, context)).filter(Boolean).slice(0, 5) : [];
}

export function classifyProviderFailure({ status, code, name } = {}) {
  if (name === 'AbortError') return 'provider_timeout';
  if (typeof code === 'string' && code.toLowerCase().startsWith('isv.permission')) return 'provider_permission_denied';
  if (status === 408 || status === 504) return 'provider_timeout';
  return 'provider_unavailable';
}
