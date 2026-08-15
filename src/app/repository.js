import { States } from './state-machine.js';
import { fixtureEvidence, fixtureSearch } from './fixtures.js';
import { createExpiry, hasExpired } from './timing.js';

const storageKey = 'kanshan-phase2-development-state';
const clone = (value) => structuredClone(value);

export class FixtureUnavailableError extends Error {
  constructor() { super('阶段 2 尚未接入真实数据。'); }
}

export class FixtureRepository {
  constructor({ mode = 'development', storage = null } = {}) {
    this.mode = mode;
    this.storage = storage;
    this.state = this.load() ?? { flow: { state: States.IDLE }, wishes: [] };
  }

  assertFixtureMode() { if (this.mode !== 'development') throw new FixtureUnavailableError(); }
  load() { if (!this.storage) return null; try { const raw = this.storage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  save() { if (this.storage) this.storage.setItem(storageKey, JSON.stringify(this.state)); }
  getFlow() { return clone(this.state.flow); }
  saveFlow(flow) { this.assertFixtureMode(); this.state.flow = clone(flow); this.save(); return this.getFlow(); }
  clearFlow() { this.assertFixtureMode(); this.state.flow = { state: States.IDLE }; this.save(); }
  async search(query, imageMode) { this.assertFixtureMode(); return fixtureSearch(query, imageMode); }
  async evidence(mode) { this.assertFixtureMode(); if (mode === 'error') throw new Error('开发测试：证据加载失败'); return clone(fixtureEvidence[mode] ?? fixtureEvidence.both); }
  seal({ product, duration, evidence, now = Date.now() }) {
    this.assertFixtureMode();
    const record = { id: `fixture-${now}`, status: States.SEALED, product: clone(product), evidence: clone(evidence), duration, createdAt: now, expiresAt: createExpiry(duration, now), priceSnapshot: { listPrice: product.listPrice, sellingPrice: product.sellingPrice, estimatedPrice: product.estimatedPrice }, abandonmentCounted: false };
    this.state.wishes.unshift(record); this.state.flow = { state: States.SEALED, recordId: record.id }; this.save(); return clone(record);
  }
  getWish(id) { return clone(this.state.wishes.find((wish) => wish.id === id) ?? null); }
  syncExpiry(id, now = Date.now()) {
    const record = this.state.wishes.find((wish) => wish.id === id);
    if (record?.status === States.SEALED && hasExpired(record.expiresAt, now)) { record.status = States.EXPIRED; this.state.flow = { state: States.EXPIRED, recordId: id }; this.save(); }
    return clone(record ?? null);
  }
  decide(id, decision) {
    this.assertFixtureMode();
    const record = this.state.wishes.find((wish) => wish.id === id);
    if (!record) throw new Error('找不到开发测试愿望。');
    if (record.status === States.PURCHASE_READY || record.status === States.ABANDONED) return clone(record);
    if (record.status !== States.EXPIRED) throw new Error('愿望尚未到期，不能决定。');
    record.status = decision === 'purchase' ? States.PURCHASE_READY : States.ABANDONED;
    if (record.status === States.ABANDONED) record.abandonmentCounted = true;
    this.state.flow = { state: record.status, recordId: id }; this.save(); return clone(record);
  }
  list() { return clone(this.state.wishes); }
  seedHistory() {
    this.assertFixtureMode();
    if (this.state.wishes.some((wish) => wish.seeded)) return this.list();
    const product = fixtureSearch('历史样例')[0];
    this.state.wishes.push(...[States.SEALED, States.EXPIRED, States.PURCHASE_READY, States.ABANDONED, States.ARCHIVED].map((status, index) => ({ id: `history-${index}`, seeded: true, status, product, duration: 24, createdAt: Date.now() - index * 1000, expiresAt: Date.now() + 24_000, priceSnapshot: { listPrice: product.listPrice, sellingPrice: product.sellingPrice, estimatedPrice: product.estimatedPrice }, abandonmentCounted: status === States.ABANDONED })));
    this.save(); return this.list();
  }
}
