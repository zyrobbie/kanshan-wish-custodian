import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderFailure, finiteMoney, normalizeProducts, normalizeQuery, officialPromotionUrl, toProductCard } from '../supabase/functions/_shared/taobao-product.js';
import { ProductSearchError, ProductSearchService, isProductCard, normalizeClientQuery } from '../src/app/products-service.js';
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
  assert.equal(finiteMoney('-1'), null);
  assert.equal(finiteMoney('0'), 0);
});

test('promotion URL prefers coupon, falls back to click, and filters unsafe links', () => {
  assert.equal(officialPromotionUrl('//example.com/x'), 'https://example.com/x');
  assert.equal(officialPromotionUrl('javascript:alert(1)'), null);
  assert.equal(toProductCard(raw({ publish_info: { coupon_share_url: '', click_url: '//example.com/click' } }), context).promotionUrl, 'https://example.com/click');
  assert.equal(toProductCard(raw({ publish_info: { coupon_share_url: 'ftp://example.com/x' } }), context), null);
});

test('missing required ProductCard fields are filtered while image is optional', () => {
  assert.equal(toProductCard(raw({ item_id: '' }), context), null);
  assert.equal(toProductCard(raw({ title: '' }), context), null);
  assert.equal(toProductCard(raw({ zk_final_price: 'invalid' }), context), null);
  assert.equal(toProductCard(raw({ publish_info: {} }), context), null);
  assert.equal(toProductCard(raw({ pict_url: '' }), context).imageUrl, null);
  assert.equal(normalizeProducts([raw(), raw({ title: '' })], context).length, 1);
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

test('duplicate or stale search result cannot write after navigation', async () => {
  const gate = new AsyncTaskGate();
  const first = gate.begin();
  let view = 'flow'; let writes = 0;
  const delayed = Promise.resolve().then(() => { if (view === 'flow' && gate.isCurrent(first)) writes += 1; });
  view = 'wishes'; gate.invalidate(); await delayed;
  assert.equal(writes, 0);
});
