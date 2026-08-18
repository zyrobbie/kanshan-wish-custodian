const controls = /[\u0000-\u001F\u007F]/g;
const hasControls = /[\u0000-\u001F\u007F]/;
const tags = /<[^>]*>/g;
const promotionWords = /(?:官方|旗舰|正品|包邮|送礼|爆款|热卖|新品|限时|优惠|特惠|促销|同款|现货|专柜|升级版|家用|商用|套装|礼盒)/gi;
const quantityWords = /(?:\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mm|cm|寸|件|个|只|片|包|盒|套|支|袋)\b|\d+\s*(?:件|个|只|片|包|盒|套|支|袋))/gi;
const experienceSignal = /(?:用了?|使用(?:了|过|中)?|长期|半年|一年|几个月|每天|通勤|家里|办公室|清洗|维护|故障|闲置|积灰|后悔|优缺点|不推荐|买了|入手|退货|收纳|场景)/i;
const expertSignal = /(?:测评|参数|原理|性能|对比|区别|适合|选购|推荐|优缺点|评测|指标|材质|续航|噪音|效率|规格|成像|画质|功能|限制|成本)/i;
const expertDecisionFact = /(?:参数|性能|显示|分辨率|亮度|续航|重量|佩戴|延迟|视场角|识别|翻译|导航|录音|相机|成像|画质|价格|生态|兼容|隐私|发热|交互|功能|限制|准确|清晰|音质|降噪|容量|功耗|材质|尺寸|速度|效率|成本|清洗|维护|对比|区别)/iu;
const experienceDecisionFact = /(?:用了?|使用|佩戴|通勤|出门|室内|户外|长时间|每天|一周|一个月|半年|充电|续航|发热|卡顿|故障|清洗|维护|收纳|闲置|退货|适应|舒适|压鼻|夹头|看不清|听不清|准确|方便|麻烦)/iu;
const decisionOutcome = /(?:适合|不适合|优点|缺点|建议|需要|无需|可以|不能|不过|但是|但|容易|较高|较低|更快|更慢|更轻|更重|清晰|模糊|准确|不准|方便|麻烦|限制|不足|值得|不值得|推荐|不推荐|影响|导致|续航|发热)/u;
const vagueSummary = /(?:文章|本文|作者|废话|保证|期待|期盼|以上|以下|前文|后文|这些顾虑|以上顾虑|大家讨论|围绕讨论|更多还是围绕|无法亲自使用|没有办法亲自使用|未来会有|以后会有|彻底消除|值得关注|拭目以待)/u;

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

const summarySignals = /(?:因为|由于|因此|所以|但是|但|不过|需要|无需|适合|不适合|建议|优点|缺点|使用|实测|清洗|维护|材质|参数|性能|续航|容量|温度|价格|性价比|耐[^。？！!?]{0,8}|容易|困难|方便|影响|导致|选择|购买|推荐|不推荐|长期|实际|可以|不能|会|不易|更[^。？！!?]{0,8})/u;
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
export function isInformativeSummary(value, title = '', layer = null) {
  const summary = plainText(value);
  const size = Array.from(summary).length;
  if (size < 12 || size > 50 || !/[。；;]$/.test(summary)) return false;
  if (/[？?]/.test(summary) || marketingSignals.test(summary) || vagueSummary.test(summary) || titleRestatement(summary, title)) return false;
  if (!summarySignals.test(summary) || !decisionOutcome.test(summary)) return false;
  if (layer === 'expert') return expertDecisionFact.test(summary);
  if (layer === 'experience') return experienceDecisionFact.test(summary);
  return expertDecisionFact.test(summary) || experienceDecisionFact.test(summary);
}

function decisionValue(sentence, layer = 'expert') {
  const text = plainText(sentence);
  const layerSignal = layer === 'experience' ? experienceSignal : expertSignal;
  return Number(layerSignal.test(text)) * 8
    + Number(summarySignals.test(text)) * 4
    + Number(/\d|%|毫米|厘米|克|小时|分钟|张|次|元/u.test(text)) * 2
    + Math.min(Array.from(text).length, 50) / 100;
}

export function fallbackEvidenceSummary(value, layer = 'expert') {
  const candidate = splitEvidenceSentences(value)
    .map((sentence, index) => ({ sentence: limitUnicode(sentence, 50), index }))
    .filter(({ sentence }) => isInformativeSummary(sentence, '', layer))
    .sort((left, right) => decisionValue(right.sentence, layer) - decisionValue(left.sentence, layer) || left.index - right.index)
    .map(({ sentence }) => sentence)[0];
  return candidate ?? null;
}

/** Keep the one batch call focused on useful source passages, not title-like
 * introductions, calls to action, or long unrelated boilerplate. */
export function prepareEvidenceForZhida(value, layer = 'expert') {
  const candidates = splitEvidenceSentences(value)
    .filter((sentence) => !/[？?]/.test(sentence) && !marketingSignals.test(sentence))
    .filter((sentence) => Array.from(sentence).length >= 12)
    .map((sentence, index) => ({ sentence, index }))
    .sort((left, right) => decisionValue(right.sentence, layer) - decisionValue(left.sentence, layer) || left.index - right.index)
    .slice(0, 3);
  const prepared = candidates.map(({ sentence }) => sentence).join(' ');
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

const genericProductTerms = new Set([
  '商品', '产品', '推荐', '测评', '评测', '体验', '使用', '值得', '购买', '适合', '官方', '自营', '旗舰', '新款', '原装', '配件', '海外版', '升级', '升级版',
]);

const genericIdentityTerms = new Set([
  'ai', '智能', '眼镜', '智能眼镜', '相机', '拍立得', '耳机', '手机', '电脑', '笔记本', '咖啡机', '硬件', '设备', '产品', '商品',
]);

export function coreTokens(coreProductName) {
  const chunks = plainText(coreProductName).toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const tokens = [];
  for (const chunk of chunks) {
    if (!/^[\p{Script=Han}]+$/u.test(chunk)) { tokens.push(chunk); continue; }
    const characters = Array.from(chunk);
    if (characters.length <= 6) tokens.push(chunk);
    if (characters.length >= 4) {
      for (const size of [4, 3, 2]) {
        for (let index = 0; index <= characters.length - size; index += 1) tokens.push(characters.slice(index, index + size).join(''));
      }
    }
  }
  return Array.from(new Set(tokens))
    .filter((token) => Array.from(token).length >= 2 && !genericProductTerms.has(token) && !/^\d+$/.test(token))
    .slice(0, 32);
}

/** Brand/model anchors stop broad category articles from taking over a card.
 * Generic product names still use the ordinary category relevance path. */
export function identityTokens(coreProductName) {
  const chunks = plainText(coreProductName).toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const identities = [];
  for (const chunk of chunks) {
    if (!/^[\p{Script=Han}]+$/u.test(chunk)) {
      if (/\d/u.test(chunk) || chunk.length >= 3) identities.push(chunk);
      continue;
    }
    if (genericIdentityTerms.has(chunk)) continue;
    const characters = Array.from(chunk);
    if (characters.length <= 8) identities.push(chunk);
    if (characters.length >= 4) identities.push(characters.slice(0, 2).join(''));
  }
  return Array.from(new Set(identities))
    .filter((token) => Array.from(token).length >= 2 && !genericProductTerms.has(token) && !genericIdentityTerms.has(token))
    .slice(0, 12);
}

function relevance(item, coreProductName) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return coreTokens(coreProductName).reduce((score, token) => score + (text.includes(token) ? Math.min(Array.from(token).length, 4) : 0), 0);
}

function matchesIdentity(item, coreProductName) {
  const identities = identityTokens(coreProductName);
  if (!identities.length) return true;
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return identities.some((token) => text.includes(token));
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
    .filter((item) => relevance(item, coreProductName) > 0)
    .filter((item) => matchesIdentity(item, coreProductName))
    .filter((item) => (layer === 'experience' ? experienceSignal : expertSignal).test(`${item.title} ${item.summary}`))
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
    if (typeof summary === 'string' && isInformativeSummary(summary, item.title, item.layer)) summaries.set(item.id, plainText(summary));
  }
  return summaries.size ? summaries : null;
}

/** One Zhida request compresses the selected evidence batch. The function
 * receives only already-selected items and does not log their content. */
export async function compressEvidenceBatch(items, secret, coreProductName = '', { fetchImpl = fetch } = {}) {
  const batch = Array.isArray(items) ? items.slice(0, 6) : [];
  if (!batch.length) return null;
  const payload = batch.map((item) => ({
    id: item.id,
    layer: item.layer,
    product: truncateUnicode(coreProductName, 64),
    title: truncateUnicode(item.title, 100),
    content: prepareEvidenceForZhida(item.sourceText ?? item.summary, item.layer),
  }));
  const response = await fetchImpl('https://developer.zhihu.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'zhida-fast-1p5', stream: false,
      messages: [{ role: 'system', content: '你是购买决策编辑，只依据给定原文提炼，不补充事实。每条必须是12到50个Unicode字符、以。或；结尾，且单独阅读即可理解。摘要必须同时包含：一项具体产品事实，以及它对使用、适用人群或购买取舍的明确影响。expert层只提取参数、性能、差异、适用人群、局限或选购结论；experience层只提取真实场景、长期优缺点、故障维护或闲置原因。优先保留品牌、型号、功能、数值和具体场景。禁止开场白、文章评价、作者自述、行业泛谈、未来期待、问题、感叹、标题复述、营销语、寒暄和指代不明的句子。原文没有有效结论时，对应值输出空字符串。仅输出严格 JSON：{"内容ID":"摘要"}。' }, { role: 'user', content: JSON.stringify(payload) }],
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
      const candidate = summaries?.get(item.id) ?? fallbackEvidenceSummary(sourceText ?? summary, item.layer);
      if (!isInformativeSummary(candidate, item.title, item.layer)) return null;
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
