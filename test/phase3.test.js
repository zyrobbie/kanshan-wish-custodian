import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyProviderFailure, finiteMoney, normalizeProducts, normalizeQuery, officialPromotionUrl, toProductCard } from '../supabase/functions/_shared/taobao-product.js';
import { extractProductErrorCode, ProductSearchError, ProductSearchService, isProductCard, normalizeClientQuery, productPriceText, safeClientUrl } from '../src/app/products-service.js';
import { ProductTestService, productTestName } from '../src/app/product-test-scenarios.js';
import { AsyncTaskGate } from '../src/app/async-task.js';

const context = { query: '咖啡杯', fetchedAt: '2026-08-15T00:00:00.000Z' };
const raw = (overrides = {}) => ({ item_id: '123', title: '测试咖啡杯', pict_url: '//img.example.com/cup.jpg', zk_final_price: '99.50', price_promotion_info: { final_promotion_price: '79.50', predict_rounding_up_price: '69.50', predict_rounding_up_price_desc: '满 2 件可享', coupon_amount: '20' }, publish_info: { coupon_share_url: '//s.click.taobao.com/coupon', click_url: 'https://s.click.taobao.com/click' }, commission_rate: '9000', ...overrides });

test('ProductCard maps complete supported fields without commission data', () => {
  const product = toProductCard(raw({ shop_title: '测试店铺' }), context);
  assert.deepEqual(product, { provider: 'taobao', itemId: '123', title: '测试咖啡杯', imageUrl: 'https://img.example.com/cup.jpg', price: 99.5, finalPrice: 79.5, priceLabel: '预估到手价', bundlePrice: 69.5, bundlePriceCondition: '满 2 件可享', couponAmount: 20, shopName: '测试店铺', promotionUrl: 'https://s.click.taobao.com/coupon', query: '咖啡杯', fetchedAt: context.fetchedAt });
  assert.equal('commission_rate' in product, false);
  assert.equal(isProductCard(product), true);
});

test('price fallback and bundle rules keep labels honest', () => {
  const fallback = toProductCard(raw({ price_promotion_info: {}, zk_final_price: '88' }), context);
  assert.equal(fallback.finalPrice, 88);
  assert.equal(fallback.priceLabel, '销售价');
  const noCondition = toProductCard(raw({ price_promotion_info: { final_promotion_price: '80', predict_rounding_up_price: '70' } }), context);
  assert.equal('bundlePrice' in noCondition, false);
  assert.equal(finiteMoney('bad'), null);
  assert.equal(finiteMoney(''), null);
  assert.equal(finiteMoney('   '), null);
  assert.equal(finiteMoney('-1'), null);
  assert.equal(finiteMoney('0'), 0);
});

test('price display preserves sales versus estimate without duplicate values', () => {
  assert.deepEqual(productPriceText({ price: 39.8, finalPrice: 29.8, priceLabel: '预估到手价' }), { sales: 39.8, estimated: 29.8 });
  assert.deepEqual(productPriceText({ price: 39.8, finalPrice: 39.8, priceLabel: '预估到手价' }), { sales: 39.8, estimated: null });
  assert.deepEqual(productPriceText({ price: 39.8, finalPrice: null, priceLabel: '销售价' }), { sales: 39.8, estimated: null });
  assert.equal(productPriceText({ price: 'bad', finalPrice: 1, priceLabel: '预估到手价' }), null);
});

test('promotion URL prefers coupon, falls back to click, and filters unsafe links', () => {
  assert.equal(officialPromotionUrl('//example.com/x'), 'https://example.com/x');
  assert.equal(officialPromotionUrl('javascript:alert(1)'), null);
  assert.equal(toProductCard(raw({ publish_info: { coupon_share_url: '', click_url: '//example.com/click' } }), context).promotionUrl, 'https://example.com/click');
  assert.equal(toProductCard(raw({ publish_info: { coupon_share_url: 'ftp://example.com/x' } }), context), null);
  assert.equal(officialPromotionUrl('  https://example.com/a b  '), 'https://example.com/a%20b');
  assert.equal(officialPromotionUrl('https://example.com/\u0000x'), null);
  assert.equal(safeClientUrl(' javascript:alert(1)'), null);
  assert.equal(safeClientUrl('https://example.com/a b'), 'https://example.com/a%20b');
  assert.equal(safeClientUrl('not a url'), null);
});

test('missing required ProductCard fields are filtered while image is optional', () => {
  assert.equal(toProductCard(raw({ item_id: '' }), context), null);
  assert.equal(toProductCard(raw({ title: '' }), context), null);
  assert.equal(toProductCard(raw({ zk_final_price: 'invalid' }), context), null);
  assert.equal(toProductCard(raw({ publish_info: {} }), context), null);
  assert.equal(toProductCard(raw({ pict_url: '' }), context).imageUrl, null);
  assert.equal(normalizeProducts([raw(), raw({ title: '' })], context).length, 1);
});

test('hostile provider strings remain data and cannot become HTML attributes', () => {
  const hostile = toProductCard(raw({
    item_id: '123" onerror="alert(1)',
    title: '<img src=x onerror=alert(1)>',
    pict_url: 'javascript:alert(1)',
  }), context);
  assert.equal(hostile.itemId, '123" onerror="alert(1)');
  assert.equal(hostile.imageUrl, null);
  assert.match(hostile.title, /onerror/);
  const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
  assert.equal(main.includes('data-product="${product.itemId}'), false);
  assert.equal(main.includes('src="${product.imageUrl}'), false);
  assert.match(main, /title\.textContent/);
  assert.match(main, /choose\.dataset\.productIndex/);
});

test('query and provider failures use stable classes', () => {
  assert.equal(normalizeQuery('  品牌   型号 '), '品牌 型号');
  assert.equal(normalizeQuery('x'), null);
  assert.equal(normalizeQuery('a\u0000b'), null);
  assert.equal(normalizeClientQuery('  咖啡   杯 '), '咖啡 杯');
  assert.equal(classifyProviderFailure({ name: 'AbortError' }), 'provider_timeout');
  assert.equal(classifyProviderFailure({ code: 'isv.permission-api-package-limit' }), 'provider_permission_denied');
  assert.equal(classifyProviderFailure({ status: 500 }), 'provider_unavailable');
});

test('unconfigured production service never falls back to fixtures', async () => {
  const service = new ProductSearchService();
  await assert.rejects(() => service.search('咖啡杯'), (error) => error instanceof ProductSearchError && error.code === 'service_not_configured');
});

test('Edge Function failures only accept stable project error codes', async () => {
  assert.equal(await extractProductErrorCode({ data: { error: 'provider_timeout' } }), 'provider_timeout');
  assert.equal(await extractProductErrorCode({ error: { context: { json: async () => ({ error: 'provider_permission_denied' }) } } }), 'provider_permission_denied');
  assert.equal(await extractProductErrorCode({ error: { context: { json: async () => { throw new Error('not json'); } } } }), 'request_failed');
  assert.equal(await extractProductErrorCode({ error: { context: '{"error":"not_whitelisted"}' } }), 'request_failed');
  assert.equal(await extractProductErrorCode({ error: new Error('network') }), 'request_failed');
  assert.equal(await extractProductErrorCode({}), 'request_failed');
});

test('ProductSearchService reads Function HTTP context without leaking it', async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'local' } } }) },
    functions: { invoke: async () => ({ data: null, error: { context: { json: async () => ({ error: 'service_not_configured', detail: 'private' }) } } }) },
  };
  const service = new ProductSearchService({ url: 'https://example.invalid', publishableKey: 'publishable', client });
  await assert.rejects(() => service.search('咖啡杯'), (error) => error instanceof ProductSearchError && error.code === 'service_not_configured' && !error.message.includes('private'));
});

test('ProductSearchService accepts a successful Function response with safe links only', async () => {
  const product = toProductCard(raw(), context);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'local' } } }) },
    functions: { invoke: async () => ({ data: { ok: true, products: [product, { ...product, promotionUrl: 'javascript:alert(1)' }] }, error: null }) },
  };
  const service = new ProductSearchService({ url: 'https://example.invalid', publishableKey: 'publishable', client });
  const result = await service.search('咖啡杯');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].promotionUrl, 'https://s.click.taobao.com/coupon');
});

test('explicit development product scenarios never call Supabase and cover local states', async () => {
  assert.equal(productTestName('?productTest=success'), 'success');
  assert.equal(productTestName('?productTest=unknown'), null);
  assert.equal((await new ProductTestService('success').search('咖啡杯')).products.length, 1);
  assert.equal((await new ProductTestService('empty').search('咖啡杯')).products.length, 0);
  for (const [scenario, code] of [['timeout', 'provider_timeout'], ['permission', 'provider_permission_denied'], ['config', 'service_not_configured'], ['invalid', 'invalid_response']]) {
    await assert.rejects(() => new ProductTestService(scenario).search('咖啡杯'), (error) => error instanceof ProductSearchError && error.code === code);
  }
  const image = await new ProductTestService('image').search('咖啡杯');
  assert.equal(image.products[0].imageUrl, 'http://127.0.0.1:5177/missing-product-test-image.png');
});

test('duplicate or stale search result cannot write after navigation', async () => {
  const gate = new AsyncTaskGate();
  const first = gate.begin();
  let view = 'flow'; let writes = 0;
  const delayed = Promise.resolve().then(() => { if (view === 'flow' && gate.isCurrent(first)) writes += 1; });
  view = 'wishes'; gate.invalidate(); await delayed;
  assert.equal(writes, 0);
});
