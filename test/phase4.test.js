import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildZhihuQueries, cleanProductTitle, compressEvidenceBatch, fallbackEvidenceSummary, finalizeEvidenceLayer, finalizeEvidenceSummaries,
  isInformativeSummary, mapZhihuItem, plainText, prepareEvidenceForZhida, providerErrorCode, safeZhihuUrl, selectEvidence, truncateUnicode,
} from '../supabase/functions/_shared/zhihu-evidence.js';
import { EvidenceTestService, evidenceTestName } from '../src/app/evidence-test-scenarios.js';
import { extractZhihuErrorCode, normalizeEvidencePayload, ZhihuEvidenceError, ZhihuEvidenceService } from '../src/app/zhihu-service.js';
import { AsyncTaskGate } from '../src/app/async-task.js';

const item = (overrides = {}) => ({
  Title: 'XK-100 咖啡机参数测评', ContentText: '使用半年后，我在办公室每天清洗一次，长期体验是维护成本较高。',
  Url: 'https://www.zhihu.com/question/123/answer/456', ContentID: '456', AuthorName: '测试作者', AuthorBadgeText: '认证作者',
  ContentType: '回答', VoteUpCount: 10, AuthorityLevel: '3', EditTime: 100, RankingScore: 0.9, ...overrides,
});

test('product title cleaning preserves model identifiers and safely falls back', () => {
  assert.equal(cleanProductTitle(' 【官方】 Sony WH-1000XM5 头戴式降噪耳机  1件 包邮 '), 'Sony WH-1000XM5 头戴式降噪耳机');
  assert.equal(cleanProductTitle('官方 爆款'), '官方 爆款');
  assert.equal(cleanProductTitle('A'.repeat(90)).length, 64);
  assert.equal(cleanProductTitle('  \u0000 <b>咖啡机</b>  '), '咖啡机');
  assert.deepEqual(buildZhihuQueries('XK-100 咖啡机'), { coreProductName: 'XK-100 咖啡机', expert: 'XK-100 咖啡机 值得买吗 测评 适合谁', experience: 'XK-100 咖啡机 后悔 积灰 长期使用体验' });
});

test('Zhihu mapping cleans highlights, preserves only safe fields and truncates Unicode', () => {
  const mapped = mapZhihuItem(item({ Title: '<em>参数</em><script>alert(1)</script>', AuthorName: '<img src=x onerror=alert(1)>', ContentText: '<em>长期</em>使用<script>bad()</script>' }), 'expert');
  assert.equal(mapped.title.includes('<'), false);
  assert.equal(mapped.authorName.includes('<'), false);
  assert.equal(mapped.summary.includes('<'), false);
  assert.equal(safeZhihuUrl('javascript:alert(1)'), null);
  assert.equal(safeZhihuUrl('http://www.zhihu.com/question/1'), null);
  assert.equal(safeZhihuUrl('https://zhihu.example.com/question/1'), null);
  assert.equal(safeZhihuUrl('https://www.zhihu.com/question/1'), 'https://www.zhihu.com/question/1');
  assert.equal(Array.from(truncateUnicode('😀'.repeat(300))).length, 281);
  assert.equal(plainText('<em>标题</em>'), '标题');
});

test('expert and experience layers filter independently and deduplicate across layers', () => {
  const used = new Set();
  const expert = selectEvidence([item(), item({ ContentID: 'promo', Title: '促销链接', ContentText: '购买链接' })], 'expert', 'XK-100 咖啡机', used);
  const experience = selectEvidence([item({ ContentID: '456' }), item({ ContentID: '789', Url: 'https://zhuanlan.zhihu.com/p/789', Title: '长期使用体验', ContentText: '我用了半年，清洗维护很麻烦，最后积灰。' })], 'experience', 'XK-100 咖啡机', used);
  assert.equal(expert.length >= 1, true);
  assert.equal(experience.length, 1);
  assert.equal(experience[0].id, '789');
  assert.equal(selectEvidence([item({ ContentText: '没有体验描述', ContentID: 'no-experience' })], 'experience', 'XK-100 咖啡机').length, 0);
});

test('provider failures use only stable Zhihu categories', () => {
  assert.equal(providerErrorCode({ code: 10001 }), 'invalid_query');
  assert.equal(providerErrorCode({ code: 20001 }), 'provider_auth_failed');
  assert.equal(providerErrorCode({ code: 30001 }), 'provider_rate_limited');
  assert.equal(providerErrorCode({ code: 90001 }), 'provider_unavailable');
  assert.equal(providerErrorCode({ name: 'TimeoutError' }), 'provider_timeout');
});

test('Zhida batch summaries are informative, limited to six, and failures retain only quality fallbacks', async () => {
  const selected = Array.from({ length: 7 }, (_, index) => ({ ...mapZhihuItem(item({ ContentID: String(index), ContentText: `第${index}条内容。${'长文本'.repeat(40)}` }), 'expert'), id: String(index) }));
  let request;
  const summaries = await compressEvidenceBatch(selected, 'secret-never-logged', { fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(selected.slice(0,6).map((entry) => [entry.id, `长期使用后清洗维护成本较高，需要结合频率选择。`]))) } }] }) };
  } });
  assert.equal(request.model, 'zhida-fast-1p5'); assert.equal(JSON.parse(request.messages[1].content).length, 6);
  assert.ok(JSON.parse(request.messages[1].content).every((entry) => Array.from(entry.content).length <= 480));
  const final = finalizeEvidenceSummaries(selected.slice(0,6), summaries);
  assert.ok(final.every((entry) => isInformativeSummary(entry.summary) && Array.from(entry.summary).length <= 50));
  assert.equal(final[0].sourceText, undefined);
  await assert.rejects(() => compressEvidenceBatch(selected.slice(0,1), 'x', { fetchImpl: async () => ({ ok: false, status: 504, json: async () => ({}) }) }));
  await assert.rejects(() => compressEvidenceBatch(selected.slice(0,1), 'x', { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{bad json}' } }] }) }) }));
  await assert.rejects(() => compressEvidenceBatch(selected.slice(0,1), 'x', { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ 0: 'x'.repeat(51) }) } }] }) }) }));
  await assert.rejects(() => compressEvidenceBatch(selected.slice(0,1), 'x', { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ 0: '这是什么？' }) } }] }) }) }));
  assert.equal(fallbackEvidenceSummary('这是什么？谁懂啊！长期使用后清洗维护较麻烦，需要结合频率选择。'), '长期使用后清洗维护较麻烦，需要结合频率选择。');
});

test('summary quality rejects questions, exclamations, title echoes and unsafe fallback material', () => {
  assert.equal(isInformativeSummary('这款马克杯值得买吗？'), false);
  assert.equal(isInformativeSummary('谁懂啊！'), false);
  assert.equal(isInformativeSummary('长期维护成本较高，需要结合使用频率选择。'), true);
  assert.equal(isInformativeSummary('😀'.repeat(12)), false);
  assert.equal(isInformativeSummary('使用后需要定期清洗，否则容易残留异味。'.repeat(4)), false);
  assert.equal(isInformativeSummary('<b>长期使用</b>后清洗频率较高，需要考虑维护成本。'), true);
  assert.equal(isInformativeSummary('马克杯带盖勺陶瓷杯子女士新款家用喝茶水杯男办公室咖啡杯高颜值。', '马克杯带盖勺陶瓷杯子女士新款家用喝茶水杯男办公室咖啡杯高颜值'), false);
  assert.equal(fallbackEvidenceSummary('标题复述。要不要买？谁懂啊！'), null);
  assert.ok(Array.from(prepareEvidenceForZhida('要不要买？谁懂啊！长期使用后清洗频率较高，需要考虑维护成本。'.repeat(20))).length <= 480);
});

test('final evidence filtering can leave each layer empty instead of showing a meaningless card', () => {
  const weak = mapZhihuItem(item({ ContentText: '要不要买？谁懂啊！', ContentID: 'weak' }), 'expert');
  assert.deepEqual(finalizeEvidenceSummaries([weak]), []);
  assert.deepEqual(finalizeEvidenceLayer({ status: 'ready', items: [weak] }), { status: 'empty', items: [] });
  const withOpinion = mapZhihuItem(item({ ContentText: '先提一个问题？长期使用后清洗频率较高，需要考虑维护成本。', ContentID: 'opinion' }), 'expert');
  const final = finalizeEvidenceSummaries([weak, withOpinion]);
  assert.equal(final.length, 1);
  assert.equal(final[0].id, 'opinion');
});

test('frontend accepts only a complete stable evidence payload', () => {
  const ready = { ok: true, coreProductName: '咖啡机', fetchedAt: 'x', layers: { expert: { status: 'ready', items: [mapZhihuItem(item(), 'expert')] }, experience: { status: 'empty', items: [] } } };
  assert.equal(normalizeEvidencePayload(ready).layers.expert.items.length, 1);
  assert.throws(() => normalizeEvidencePayload({ ok: true, coreProductName: 'x', layers: {} }), ZhihuEvidenceError);
  assert.throws(() => normalizeEvidencePayload({ ok: true, coreProductName: 'x', layers: { expert: { status: 'ready', items: [] }, experience: { status: 'bad', items: [] } } }), ZhihuEvidenceError);
  const oversized = normalizeEvidencePayload({ ...ready, layers: { expert: { status: 'ready', items: [{ ...mapZhihuItem(item(), 'expert'), summary: '😀'.repeat(80) }] }, experience: { status: 'empty', items: [] } } });
  assert.ok(Array.from(oversized.layers.expert.items[0].summary).length <= 50);
});

test('FunctionsHttpError contexts and network failures never leak raw provider data', async () => {
  assert.equal(await extractZhihuErrorCode({ data: { error: 'provider_timeout' } }), 'provider_timeout');
  assert.equal(await extractZhihuErrorCode({ error: { context: { json: async () => ({ error: 'provider_rate_limited', raw: 'private' }) } } }), 'provider_rate_limited');
  assert.equal(await extractZhihuErrorCode({ error: { context: '{not json}' } }), 'request_failed');
  assert.equal(await extractZhihuErrorCode({ error: new Error('network private details') }), 'request_failed');
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'local' } } }) }, functions: { invoke: async () => ({ data: null, error: { context: { json: async () => ({ error: 'provider_auth_failed', detail: 'private' }) } } }) } };
  await assert.rejects(() => new ZhihuEvidenceService({ url: 'https://example.invalid', publishableKey: 'publishable', client }).load('咖啡机'), (error) => error instanceof ZhihuEvidenceError && error.code === 'provider_auth_failed' && !error.message.includes('private'));
});

test('explicit evidence scenarios are local and cover both partial failures and hostile text', async () => {
  assert.equal(evidenceTestName('?evidenceTest=both'), 'both');
  assert.equal(evidenceTestName('?evidenceTest=unknown'), null);
  assert.equal((await new EvidenceTestService('both').load()).layers.expert.status, 'ready');
  assert.equal((await new EvidenceTestService('empty').load()).layers.expert.status, 'empty');
  assert.equal((await new EvidenceTestService('expert-error').load()).layers.expert.status, 'error');
  assert.equal((await new EvidenceTestService('experience-error').load()).layers.experience.status, 'error');
  assert.match((await new EvidenceTestService('html').load()).layers.expert.items[0].title, /<script>/);
  for (const [name, code] of [['timeout', 'provider_timeout'], ['permission', 'provider_auth_failed'], ['invalid', 'invalid_response']]) {
    await assert.rejects(() => new EvidenceTestService(name).load(), (error) => error instanceof ZhihuEvidenceError && error.code === code);
  }
});

test('evidence async results become stale on navigation, reselection and a new search', async () => {
  const gate = new AsyncTaskGate();
  const first = gate.begin(); let writes = 0;
  const delayed = Promise.resolve().then(() => { if (gate.isCurrent(first)) writes += 1; });
  gate.invalidate(); await delayed; assert.equal(writes, 0);
  const second = gate.begin(); gate.begin(); assert.equal(gate.isCurrent(second), false);
});

test('browser source keeps external evidence text out of HTML interpolation and does not auto-open links', () => {
  const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
  assert.match(main, /title\.textContent = item\.title/);
  assert.match(main, /summary\.textContent = item\.summary/);
  assert.match(main, /link\.rel = 'noopener noreferrer'/);
  assert.equal(main.includes('window.open(item.url'), false);
});

test('evidence footer leads with custody and keeps the three mobile actions on stable rows', () => {
  const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/app/styles.css', import.meta.url), 'utf8');
  const custody = main.indexOf('data-action="custody"');
  const products = main.indexOf('data-action="products"', custody);
  const home = main.indexOf('data-action="home"', products);
  assert.match(main, /还没决定？先把这个愿望交给看山保存一会吧/);
  assert.ok(custody >= 0 && products > custody && home > products);
  assert.match(styles, /\.evidence-actions[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.evidence-actions \.primary[^}]*grid-column:\s*1 \/ -1/);
  assert.match(styles, /\.evidence-actions button[^}]*white-space:\s*nowrap/);
});
