const controls = /[\u0000-\u001F\u007F]/g;
const hasControls = /[\u0000-\u001F\u007F]/;
const tags = /<[^>]*>/g;
const promotionWords = /(?:官方|旗舰|正品|包邮|送礼|爆款|热卖|新品|限时|优惠|特惠|促销|同款|现货|专柜|升级版|家用|商用|套装|礼盒)/gi;
const quantityWords = /(?:\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mm|cm|寸|件|个|只|片|包|盒|套|支|袋)\b|\d+\s*(?:件|个|只|片|包|盒|套|支|袋))/gi;
const experienceSignal = /(?:用了?|使用(?:了|过|中)?|长期|半年|一年|几个月|每天|通勤|家里|办公室|清洗|维护|故障|闲置|积灰|后悔|优缺点|不推荐|买了|入手|退货|收纳|场景)/i;
const expertSignal = /(?:测评|参数|原理|性能|对比|适合|优缺点|评测|指标|材质|续航|噪音|效率|规格)/i;

export const zhihuErrorCodes = Object.freeze(new Set([
  'invalid_query', 'authentication_required', 'origin_not_allowed', 'service_not_configured',
  'provider_auth_failed', 'provider_rate_limited', 'provider_timeout', 'provider_unavailable',
  'invalid_response', 'request_failed',
]));

export function plainText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(controls, ' ').replace(tags, '').replace(/\s+/g, ' ').trim();
}

export function truncateUnicode(value, max = 280) {
  const characters = Array.from(plainText(value));
  return characters.length <= max ? characters.join('') : `${characters.slice(0, max).join('')}…`;
}

export function cleanProductTitle(value) {
  const original = plainText(value);
  if (!original) return '';
  const cleaned = original
    .replace(/[【\[（(][^】\]）)]*[】\]）)]/g, ' ')
    .replace(promotionWords, ' ')
    .replace(quantityWords, ' ')
    .replace(/[|｜/_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return Array.from(cleaned).length >= 2 ? cleaned : Array.from(original).slice(0, 64).join('');
}

export function buildZhihuQueries(productTitle) {
  const coreProductName = cleanProductTitle(productTitle);
  if (Array.from(coreProductName).length < 2) return null;
  return {
    coreProductName,
    expert: `${coreProductName} 值得买吗 测评 适合谁`,
    experience: `${coreProductName} 后悔 积灰 长期使用体验`,
  };
}

export function safeZhihuUrl(value) {
  if (typeof value !== 'string' || hasControls.test(value) || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'zhihu.com' || host.endsWith('.zhihu.com'))) return null;
    return url.href;
  } catch { return null; }
}

const nonNegative = (value) => {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function mapZhihuItem(raw, layer) {
  if (!raw || typeof raw !== 'object' || (layer !== 'expert' && layer !== 'experience')) return null;
  const item = raw;
  const title = truncateUnicode(item.Title, 180);
  const summary = truncateUnicode(item.ContentText, 280);
  const url = safeZhihuUrl(item.Url);
  if (!title || !summary || !url) return null;
  const authorName = truncateUnicode(item.AuthorName || '知乎用户', 80) || '知乎用户';
  const badge = truncateUnicode(item.AuthorBadgeText, 80);
  const contentType = truncateUnicode(item.ContentType || '知乎内容', 40) || '知乎内容';
  const identity = plainText(item.ContentID) || url;
  return {
    layer,
    id: identity,
    title,
    authorName,
    authorBadgeText: badge || null,
    contentType,
    summary,
    url,
    voteUpCount: nonNegative(item.VoteUpCount),
    authorityLevel: plainText(item.AuthorityLevel) || null,
    editTime: nonNegative(item.EditTime),
    rankingScore: nonNegative(item.RankingScore) ?? 0,
  };
}

function coreTokens(coreProductName) {
  return Array.from(new Set(plainText(coreProductName).split(/[\s,，、/]+/).filter((token) => Array.from(token).length >= 2))).slice(0, 8);
}

function relevance(item, coreProductName) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return coreTokens(coreProductName).reduce((score, token) => score + (text.includes(token.toLowerCase()) ? 2 : 0), 0);
}

function score(item, layer, coreProductName) {
  const authority = Number(item.authorityLevel) || 0;
  const votes = item.voteUpCount ?? 0;
  const topical = layer === 'expert' ? Number(expertSignal.test(`${item.title} ${item.summary}`)) * 3 : Number(experienceSignal.test(`${item.title} ${item.summary}`)) * 4;
  return relevance(item, coreProductName) * 10 + topical + authority + Math.min(votes, 1000) / 1000 + item.rankingScore;
}

export function selectEvidence(rawItems, layer, coreProductName, used = new Set()) {
  const candidates = (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => mapZhihuItem(raw, layer))
    .filter(Boolean)
    .filter((item) => layer !== 'experience' || experienceSignal.test(`${item.title} ${item.summary}`))
    .filter((item) => !used.has(item.id) && !used.has(item.url))
    .map((item) => ({ ...item, _score: score(item, layer, coreProductName) }))
    .filter((item) => item._score > 0)
    .sort((left, right) => right._score - left._score)
    .slice(0, 3)
    .map(({ _score, ...item }) => item);
  candidates.forEach((item) => { used.add(item.id); used.add(item.url); });
  return candidates;
}

export function providerErrorCode({ status, code, name } = {}) {
  if (name === 'TimeoutError' || name === 'AbortError' || status === 408 || status === 504) return 'provider_timeout';
  if (String(code) === '10001') return 'invalid_query';
  if (String(code) === '20001' || status === 401 || status === 403) return 'provider_auth_failed';
  if (String(code) === '30001' || status === 429) return 'provider_rate_limited';
  if (String(code) === '90001') return 'provider_unavailable';
  return 'provider_unavailable';
}

export function stableZhihuError(value) {
  return typeof value === 'string' && zhihuErrorCodes.has(value) ? value : 'request_failed';
}
