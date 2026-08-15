import test from 'node:test';
import assert from 'node:assert/strict';
import { States, canTransition, transition } from '../src/app/state-machine.js';
import { DemoDurations, createExpiry, hasExpired, remainingSeconds } from '../src/app/timing.js';
import { abandonedTotal, priceSnapshot } from '../src/app/pricing.js';
import { FixtureRepository, FixtureUnavailableError } from '../src/app/repository.js';
import { fixtureProducts } from '../src/app/fixtures.js';
import { AsyncTaskGate } from '../src/app/async-task.js';
import { Views, openWishFlow } from '../src/app/navigation.js';

class MemoryStorage { constructor() { this.data = new Map(); } getItem(key) { return this.data.get(key) ?? null; } setItem(key, value) { this.data.set(key, value); } }

test('state machine permits the static flow and refuses illegal transitions', () => {
  assert.equal(canTransition(States.IDLE, States.PRODUCT_SEARCHING), true);
  assert.equal(transition(States.SEALED, States.EXPIRED), States.EXPIRED);
  assert.throws(() => transition(States.IDLE, States.SEALED), /Illegal state transition/);
  assert.equal(canTransition(States.EXPIRED, 'link_converting'), false);
});

test('demo custody supports only 24, 48 and 72 seconds and uses absolute expiry', () => {
  assert.deepEqual(DemoDurations, [24, 48, 72]);
  const expiry = createExpiry(48, 1_000);
  assert.equal(expiry, 49_000);
  assert.equal(remainingSeconds(expiry, 17_400), 32);
  assert.equal(remainingSeconds(expiry, 50_000), 0);
  assert.equal(hasExpired(expiry, 50_000), true);
  assert.throws(() => createExpiry(25, 0), /Unsupported/);
});

test('suspended page recovery expires a sealed wish once', () => {
  const repo = new FixtureRepository({ storage: new MemoryStorage() });
  const record = repo.seal({ product: fixtureProducts[0], duration: 24, evidence: { expert: [], experience: [] }, now: 100 });
  assert.equal(repo.syncExpiry(record.id, 24_101).status, States.EXPIRED);
  assert.equal(repo.syncExpiry(record.id, 80_000).status, States.EXPIRED);
});

test('purchase and abandonment decisions are idempotent and abandonment counts once', () => {
  const repo = new FixtureRepository({ storage: new MemoryStorage() });
  const purchase = repo.seal({ product: fixtureProducts[0], duration: 24, evidence: {}, now: 0 });
  repo.syncExpiry(purchase.id, 24_000);
  assert.equal(repo.decide(purchase.id, 'purchase').status, States.PURCHASE_READY);
  assert.equal(repo.decide(purchase.id, 'purchase').status, States.PURCHASE_READY);
  const abandonment = repo.seal({ product: fixtureProducts[1], duration: 24, evidence: {}, now: 0 });
  repo.syncExpiry(abandonment.id, 24_000);
  repo.decide(abandonment.id, 'abandon'); repo.decide(abandonment.id, 'abandon');
  assert.equal(abandonedTotal(repo.list()), fixtureProducts[1].estimatedPrice);
});

test('price fields stay distinct', () => {
  const snapshot = priceSnapshot(fixtureProducts[0]);
  assert.equal(snapshot.listPrice, 219);
  assert.equal(snapshot.sellingPrice, 159);
  assert.equal(snapshot.estimatedPrice, 139);
  assert.notEqual(snapshot.sellingPrice, snapshot.estimatedPrice);
});

test('fixture repository blocks production mode and never needs localStorage', async () => {
  const repo = new FixtureRepository({ mode: 'production' });
  await assert.rejects(() => repo.search('耳机'), FixtureUnavailableError);
  assert.throws(() => repo.saveFlow({ state: States.IDLE }), FixtureUnavailableError);
});

test('missing promotion is identifiable and evidence supports partial and none results', async () => {
  const repo = new FixtureRepository({ storage: new MemoryStorage() });
  const products = await repo.search('耳机', 'missing-promotion');
  assert.equal(products[0].promotionUrl, '');
  assert.equal((await repo.evidence('partial')).experience.length, 0);
  const none = await repo.evidence('none');
  assert.equal(none.expert.length + none.experience.length, 0);
  await assert.rejects(() => repo.evidence('error'), /证据加载失败/);
});

test('search task becomes stale when the user opens wish list', async () => {
  const gate = new AsyncTaskGate();
  const searchTask = gate.begin();
  let view = Views.FLOW;
  let writes = 0;
  const delayedSearch = Promise.resolve().then(() => {
    if (view === Views.FLOW && gate.isCurrent(searchTask)) writes += 1;
  });
  view = Views.WISHES;
  gate.invalidate();
  await delayedSearch;
  assert.equal(view, Views.WISHES);
  assert.equal(gate.isCurrent(searchTask), false);
  assert.equal(writes, 0);
});

test('evidence task becomes stale when the user opens wish list', async () => {
  const gate = new AsyncTaskGate();
  let view = Views.FLOW;
  let writes = 0;
  const evidenceTask = gate.begin();
  const delayedEvidence = Promise.resolve().then(() => {
    if (view === Views.FLOW && gate.isCurrent(evidenceTask)) writes += 1;
  });
  view = Views.WISHES;
  gate.invalidate();
  await delayedEvidence;
  assert.equal(view, Views.WISHES);
  assert.equal(gate.isCurrent(evidenceTask), false);
  assert.equal(writes, 0);
});

test('an old async result cannot overwrite a newer view', async () => {
  const gate = new AsyncTaskGate();
  const oldTask = gate.begin();
  let view = Views.FLOW;
  const delayedResult = Promise.resolve('old candidate').then((result) => {
    if (view === Views.FLOW && gate.isCurrent(oldTask)) view = result;
  });
  view = Views.WISHES;
  gate.invalidate();
  await delayedResult;
  assert.equal(view, Views.WISHES);
});

test('sealed wish can be reopened from the independent wish-list view', () => {
  const repo = new FixtureRepository({ storage: new MemoryStorage() });
  const sealed = repo.seal({ product: fixtureProducts[0], duration: 24, evidence: {}, now: 100 });
  const restored = openWishFlow(repo.getWish(sealed.id));
  assert.deepEqual(restored, { state: States.SEALED, recordId: sealed.id });
  assert.equal(repo.syncExpiry(sealed.id, 1_000).status, States.SEALED);
  assert.equal(canTransition(States.PRODUCT_SEARCHING, States.ARCHIVED), false);
});
