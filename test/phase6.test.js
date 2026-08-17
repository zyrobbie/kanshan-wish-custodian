import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { savedPromotionHref, WishStatuses } from '../src/app/wish-domain.js';
import { shoppingCardSnapshot } from '../src/app/shopping-card.js';
import { createProductionServices } from '../src/app/production-services.js';

const promotion = 'https://s.click.taobao.com/keep-this-exact';
const wish = Object.freeze({
  id: 'wish-1',
  status: WishStatuses.PURCHASED_INTENT,
  product: Object.freeze({ itemId: '12345', title: '保存时的商品标题', imageUrl: 'https://img.alicdn.com/item.jpg', sellingPrice: 39.8, estimatedPrice: 29.8, promotionUrl: promotion }),
});

test('phase6 shopping card uses the exact stored promotion snapshot and never fabricates a replacement', () => {
  const card = shoppingCardSnapshot(wish);
  assert.equal(card.promotionHref, promotion);
  assert.equal(card.itemId, wish.product.itemId);
  assert.equal(card.title, wish.product.title);
  assert.equal(card.imageUrl, wish.product.imageUrl);
  assert.equal(card.sellingPrice, wish.product.sellingPrice);
  assert.equal(card.estimatedPrice, wish.product.estimatedPrice);
});

test('phase6 shopping card rejects missing, unsafe, non-HTTPS and non-Taobao saved URLs', () => {
  for (const value of [null, '', 'http://s.click.taobao.com/a', 'javascript:alert(1)', 'https://eviltaobao.com/a', 'https://taobao.com.evil.example/a', 'https://user@s.click.taobao.com/a', ' https://s.click.taobao.com/a', 'https://s.click.taobao.com/a\nnext']) {
    assert.equal(savedPromotionHref(value), null, String(value));
    assert.equal(shoppingCardSnapshot({ ...wish, product: { ...wish.product, promotionUrl: value } }).promotionHref, null, String(value));
  }
  assert.equal(savedPromotionHref('https://detail.tmall.com/item.htm?id=1'), 'https://detail.tmall.com/item.htm?id=1');
  assert.equal(savedPromotionHref('https://e.tb.cn/h.example'), 'https://e.tb.cn/h.example');
});

test('phase6 Liu Kanshan presentation states are static and cannot mutate a wish lifecycle', () => {
  const before = wish.status;
  const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
  assert.match(main, /home-reference-original\.png/);
  assert.match(main, /import\.meta\.env\.BASE_URL/);
  assert.match(main, /liu-kanshan-wave-transparent\.png/);
  // The welcome pose is part of the user-approved homepage artwork. Guard and
  // release remain live presentation states on later pages.
  for (const state of ['guard', 'release']) assert.match(main, new RegExp(`liuKanshan\\('${state}'\\)`));
  assert.doesNotMatch(main, /kanshanCharacter|kanshan-character/);
  assert.equal(wish.status, before);
});

test('phase6 production composition creates one shared Supabase client for every service', () => {
  let clientCalls = 0;
  const sharedClient = { auth: {}, functions: {} };
  const services = createProductionServices({
    url: 'https://example.supabase.co',
    publishableKey: 'public-test-key',
    createSupabaseClient: () => { clientCalls += 1; return sharedClient; },
  });
  assert.equal(clientCalls, 1);
  assert.equal(services.client, sharedClient);
  assert.equal(services.productService.client, sharedClient);
  assert.equal(services.evidenceService.client, sharedClient);
  assert.equal(services.authService.client, sharedClient);
  assert.equal(services.wishesService.auth, services.authService);
});

test('phase6 abandon accounting stays server-domain based: purchase intent is excluded and abandon is idempotent', async () => {
  const { DevelopmentWishStore, summarizeWishes } = await import('../src/app/wish-domain.js');
  let now = 0;
  const store = new DevelopmentWishStore({ now: () => now });
  const make = (id) => store.create({ product: { itemId: id, title: id, price: 40, finalPrice: 30, promotionUrl: promotion }, evidence: { expert: [], experience: [] }, duration: 24, idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, '0')}` });
  const purchase = make('1'); const abandon = make('2'); now = 25_000;
  store.decide(purchase.id, 'purchase'); store.decide(abandon.id, 'abandon'); store.decide(abandon.id, 'abandon');
  const summary = summarizeWishes(store.list());
  assert.equal(summary.purchaseIntentCount, 1);
  assert.equal(summary.abandonedCount, 1);
  assert.equal(summary.abandonedListedAmount, 30);
});
