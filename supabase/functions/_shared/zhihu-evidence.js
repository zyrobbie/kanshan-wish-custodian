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

/** Hard character limit used for the public evidence cards. Unlike the older
 * generic truncator it never adds an ellipsis beyond the requested maximum. */
export function limitUnicode(value, max = 50) {
  return Array.from(plainText(value)).slice(0, max).join('');
}

const summarySignals = /(?:因为|由于|因此|所以|但是|但|不过|需要|适合|不适合|建议|优点|缺点|使用|清洗|维护|材质|参数|性能|容量|温度|价格|性价比|耐[^。？！!?]{0,8}|容易|困难|方便|影响|导致|选择|购买|推荐|不推荐|长期|实际|可以|不能|会|不易|更[^。？！!?]{0,8})/u;
const marketingSignals = /(?:点击|关注|第一时间|不会走散|官方|旗舰|正品|包邮|爆款|热卖|限时|优惠|促销|同款|私信|加群|领取)/u;

function splitEvidenceSentences(value) {
  return plainText(value)
    .split(/(?<=[。！？!?；;])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function titleRestatement(summary, title = '') {
  const normalizedSummary = plainText(summary).replace(/[。；;！!？?]/g, '');
  const normalizedTitle = plainText(title).replace(/[。；;！!？?]/g, '');
  return normalizedSummary.length >= 12 && normalizedTitle.includes(normalizedSummary);
}

/** A public card must stand on its own: a complete, non-promotional statement
 * containing an observable opinion, condition, result, or factual detail. */
export function isInformativeSummary(value, title = '') {
  const summary = plainText(value);
  const size = Array.from(summary).length;
  if (size < 12 || size > 50 || !/[。；;]$/.test(summary)) return false;
  if (/[？?]/.test(summary) || marketingSignals.test(summary) || titleRestatement(summary, title)) return false;
  return summarySignals.test(summary);
}

export function fallbackEvidenceSummary(value) {
  const candidate = splitEvidenceSentences(value)
    .map((sentence) => limitUnicode(sentence, 50))
    .find((sentence) => isInformativeSummary(sentence));
  return candidate ?? null;
}

/** Keep the one batch call focused on useful source passages, not title-like
 * introductions, calls to action, or long unrelated boilerplate. */
export function prepareEvidenceForZhida(value) {
  const candidates = splitEvidenceSentences(value)
    .filter((sentence) => !/[？?]/.test(sentence) && !marketingSignals.test(sentence))
    .filter((sentence) => Array.from(sentence).length >= 12)
    .slice(0, 3);
  const prepared = candidates.join(' ');
  return truncateUnicode(prepared || plainText(value), 480);
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
  const sourceText = truncateUnicode(item.ContentText, 1600);
  const summary = sourceText;
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
    sourceText,
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

function responseContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  try { return JSON.parse(content); } catch { return null; }
}

export function validateZhidaSummaries(value, items) {
  const mapping = value && typeof value === 'object' && !Array.isArray(value)
    ? (value.summaries && typeof value.summaries === 'object' && !Array.isArray(value.summaries) ? value.summaries : value)
    : null;
  if (!mapping) return null;
  const summaries = new Map();
  for (const item of items) {
    const summary = mapping[item.id];
    if (typeof summary !== 'string' || !isInformativeSummary(summary, item.title)) return null;
    summaries.set(item.id, plainText(summary));
  }
  return summaries;
}

/** One Zhida request compresses the selected evidence batch. The function
 * receives only already-selected items and does not log their content. */
export async function compressEvidenceBatch(items, secret, { fetchImpl = fetch } = {}) {
  const batch = Array.isArray(items) ? items.slice(0, 6) : [];
  if (!batch.length) return null;
  const payload = batch.map((item) => ({ id: item.id, content: prepareEvidenceForZhida(item.sourceText ?? item.summary) }));
  const response = await fetchImpl('https://developer.zhihu.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'zhida-fast-1p5', stream: false,
      messages: [{ role: 'system', content: '只依据给定原文压缩，不补充事实。每条必须是12到50个Unicode字符、以。或；结尾的完整陈述句，表达一个明确知识、经验或判断。禁止问题、感叹、标题复述、营销语、寒暄和无信息短句。仅输出严格 JSON：{"内容ID":"摘要"}。' }, { role: 'user', content: JSON.stringify(payload) }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Object.assign(new Error('zhida failed'), { stableCode: providerErrorCode({ status: response.status }) });
  let body = null;
  try { body = await response.json(); } catch { /* handled as invalid output */ }
  const summaries = validateZhidaSummaries(responseContent(body), batch);
  if (!summaries) throw Object.assign(new Error('zhida invalid'), { stableCode: 'invalid_response' });
  return summaries;
}

export function finalizeEvidenceSummaries(items, summaries = null) {
  return (Array.isArray(items) ? items : [])
    .map(({ sourceText, summary, ...item }) => {
      const candidate = summaries?.get(item.id) ?? fallbackEvidenceSummary(sourceText ?? summary);
      if (!isInformativeSummary(candidate, item.title)) return null;
      return { ...item, summary: candidate };
    })
    .filter(Boolean);
}

/** Preserve the layer contract after low-quality cards have been removed. */
export function finalizeEvidenceLayer(layer, summaries = null) {
  const items = finalizeEvidenceSummaries(layer?.items, summaries);
  return {
    ...layer,
    items,
    status: layer?.status === 'ready' && !items.length ? 'empty' : layer?.status,
  };
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
