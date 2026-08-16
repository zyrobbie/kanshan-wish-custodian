import { createClient } from '@supabase/supabase-js';
import { plainText, safeZhihuUrl, stableZhihuError, truncateUnicode, zhihuErrorCodes } from '../../supabase/functions/_shared/zhihu-evidence.js';

export const zhihuErrorMessages = Object.freeze({
  invalid_query: '商品名称不足，暂不能整理知乎资料。',
  authentication_required: '匿名会话尚未建立，请重试。',
  origin_not_allowed: '当前来源未获知乎证据服务许可。',
  service_not_configured: '知乎证据服务尚未配置。',
  provider_auth_failed: '知乎证据服务鉴权失败，请联系维护者。',
  provider_rate_limited: '知乎证据服务请求过于频繁，请稍后由你主动重试。',
  provider_timeout: '知乎证据服务响应超时，请由你主动重试。',
  provider_unavailable: '知乎证据服务暂不可用，请稍后重试。',
  invalid_response: '知乎证据服务返回的数据不完整，未展示资料。',
  request_failed: '知乎证据服务请求失败，请稍后重试。',
});

export class ZhihuEvidenceError extends Error {
  constructor(code) { super(zhihuErrorMessages[stableZhihuError(code)]); this.code = stableZhihuError(code); }
}

async function contextBody(context) {
  if (!context) return null;
  if (typeof context === 'string') { try { return JSON.parse(context); } catch { return null; } }
  if (typeof context === 'object' && typeof context.json === 'function') { try { return await context.json(); } catch { return null; } }
  return typeof context === 'object' ? context : null;
}

export async function extractZhihuErrorCode({ data, error } = {}) {
  if (typeof data?.error === 'string' && zhihuErrorCodes.has(data.error)) return data.error;
  const body = await contextBody(error?.context);
  return typeof body?.error === 'string' && zhihuErrorCodes.has(body.error) ? body.error : 'request_failed';
}

export function isEvidenceItem(item, layer) {
  return Boolean(item && item.layer === layer && plainText(item.title) && plainText(item.authorName) && plainText(item.summary)
    && safeZhihuUrl(item.url) && (item.authorBadgeText === null || typeof item.authorBadgeText === 'string')
    && typeof item.contentType === 'string' && (item.voteUpCount === null || (Number.isFinite(item.voteUpCount) && item.voteUpCount >= 0)));
}

export function normalizeEvidencePayload(data) {
  if (!data?.ok || typeof data.coreProductName !== 'string' || !data.layers || typeof data.layers !== 'object') throw new ZhihuEvidenceError('invalid_response');
  const layers = {};
  for (const layer of ['expert', 'experience']) {
    const value = data.layers[layer];
    if (!value || !['ready', 'empty', 'error'].includes(value.status) || !Array.isArray(value.items)) throw new ZhihuEvidenceError('invalid_response');
    layers[layer] = { status: value.status, items: value.items.filter((item) => isEvidenceItem(item, layer)).map((item) => ({ ...item, title: truncateUnicode(item.title, 180), authorName: truncateUnicode(item.authorName, 80), authorBadgeText: item.authorBadgeText ? truncateUnicode(item.authorBadgeText, 80) : null, contentType: truncateUnicode(item.contentType, 40), summary: truncateUnicode(item.summary, 280), url: safeZhihuUrl(item.url) })) };
    if (layers[layer].status === 'ready' && !layers[layer].items.length) layers[layer].status = 'empty';
  }
  return { coreProductName: truncateUnicode(data.coreProductName, 64), layers, fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt : null };
}

export class ZhihuEvidenceService {
  constructor({ url, publishableKey, client } = {}) {
    this.configured = Boolean(url && publishableKey && !url.includes('your-project-ref'));
    this.client = client ?? (this.configured ? createClient(url, publishableKey) : null);
  }

  async load(productTitle) {
    if (!plainText(productTitle) || Array.from(plainText(productTitle)).length < 2) throw new ZhihuEvidenceError('invalid_query');
    if (!this.configured || !this.client) throw new ZhihuEvidenceError('service_not_configured');
    const { data: userData } = await this.client.auth.getUser();
    const session = userData.user ? { data: { user: userData.user }, error: null } : await this.client.auth.signInAnonymously();
    if (session.error || !session.data?.user) throw new ZhihuEvidenceError('authentication_required');
    const { data, error } = await this.client.functions.invoke('zhihu-search', { body: { productTitle: plainText(productTitle) } });
    if (error || !data?.ok) throw new ZhihuEvidenceError(await extractZhihuErrorCode({ data, error }));
    return normalizeEvidencePayload(data);
  }
}
