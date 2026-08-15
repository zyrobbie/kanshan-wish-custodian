import { createClient } from '@supabase/supabase-js';

export const productErrorMessages = Object.freeze({
  invalid_query: '请输入 2 到 80 个字符的商品名称、品牌或型号。',
  authentication_required: '匿名会话尚未建立，请重试。',
  origin_not_allowed: '当前本地来源未获商品服务许可。',
  service_not_configured: '商品服务尚未配置。',
  service_misconfigured: '商品服务配置不完整，请联系维护者。',
  provider_timeout: '淘宝联盟服务响应超时，请由你主动重试。',
  provider_permission_denied: '淘宝联盟服务权限不足，请联系维护者。',
  provider_unavailable: '淘宝联盟服务暂不可用，请稍后重试。',
  request_failed: '商品服务请求失败，请稍后重试。',
  invalid_response: '商品服务返回的数据不完整，未展示候选。',
});

export class ProductSearchError extends Error {
  constructor(code) { super(productErrorMessages[code] ?? productErrorMessages.request_failed); this.code = code; }
}

export function normalizeClientQuery(value) {
  if (typeof value !== 'string' || /[\u0000-\u001F\u007F]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length >= 2 && normalized.length <= 80 ? normalized : null;
}

export function isProductCard(value) {
  return Boolean(value && value.provider === 'taobao' && typeof value.itemId === 'string' && value.itemId && typeof value.title === 'string' && value.title && Number.isFinite(value.price) && value.price >= 0 && Number.isFinite(value.finalPrice) && value.finalPrice >= 0 && (value.priceLabel === '销售价' || value.priceLabel === '预估到手价') && typeof value.promotionUrl === 'string' && /^https?:\/\//.test(value.promotionUrl));
}

export class ProductSearchService {
  constructor({ url, publishableKey, client } = {}) {
    this.configured = Boolean(url && publishableKey && !url.includes('your-project-ref'));
    this.client = client ?? (this.configured ? createClient(url, publishableKey) : null);
  }

  async search(query) {
    const normalized = normalizeClientQuery(query);
    if (!normalized) throw new ProductSearchError('invalid_query');
    if (!this.configured || !this.client) throw new ProductSearchError('service_not_configured');
    const { data: userData } = await this.client.auth.getUser();
    const session = userData.user ? { data: { user: userData.user }, error: null } : await this.client.auth.signInAnonymously();
    if (session.error || !session.data?.user) throw new ProductSearchError('authentication_required');
    const { data, error } = await this.client.functions.invoke('products-search', { body: { query: normalized } });
    const code = typeof data?.error === 'string' ? data.error : null;
    if (error || !data?.ok) throw new ProductSearchError(code && productErrorMessages[code] ? code : 'request_failed');
    if (!Array.isArray(data.products)) throw new ProductSearchError('invalid_response');
    return { query: normalized, products: data.products.filter(isProductCard) };
  }
}
