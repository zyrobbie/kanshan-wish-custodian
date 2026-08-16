import { DevelopmentWishStore } from './wish-domain.js';

const product = Object.freeze({ itemId: 'dev-item', title: '阶段 5 开发测试商品', price: 39.8, finalPrice: 29.8, promotionUrl: 'https://s.click.taobao.com/dev-promotion' });
const evidence = Object.freeze({ expert: [], experience: [] });
const key = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const wishTestNames = Object.freeze(['anonymous', 'sealed', 'expired', 'purchase', 'abandon', 'limit', 'duplicate-create', 'decision-race', 'pagination', 'bind-email', 'existing-email-login', 'migration', 'migration-error', 'otp-error', 'otp-expired', 'otp-rate-limited', 'delete-wish', 'clear-wishes', 'account-delete', 'refresh-restore']);

function localAuth() {
  let user = { id: 'dev-anonymous-owner', is_anonymous: true, email_confirmed_at: null };
  return {
    get user() { return structuredClone(user); },
    async bind(email) { const before = user.id; user = { ...user, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00.000Z', email }; return { ownerIdBefore: before, ownerIdAfter: user.id }; },
    async existingLogin(email) { return { shouldCreateUser: false, email }; },
    clear() { user = null; },
  };
}

function createMigrationPair(now) {
  const source = new DevelopmentWishStore({ now });
  const target = new DevelopmentWishStore({ now });
  let migrated = false;
  const seed = (store, n) => store.create({ product, evidence, duration: 24, idempotencyKey: key(n) });
  return {
    source, target,
    seed() { seed(source, 501); seed(source, 502); seed(target, 503); },
    migrate({ fail = false } = {}) {
      const sourceBefore = source.list(); const targetBefore = target.list();
      if (fail) return { ok: false, code: 'migration_failed', sourceCount: sourceBefore.length, targetCount: targetBefore.length };
      if (migrated) return { ok: true, movedCount: 0, sourceCount: sourceBefore.length, targetCount: targetBefore.length };
      sourceBefore.forEach((wish, index) => target.create({ product: wish.product, evidence: wish.evidence, duration: 24, idempotencyKey: key(600 + index) }));
      source.clear(); migrated = true;
      return { ok: true, movedCount: sourceBefore.length, sourceCount: source.list().length, targetCount: target.list().length };
    },
  };
}

/** Explicitly local development behavior. It never invokes Auth, Supabase, email, or external APIs. */
export function createWishTestHarness(name, now = Date.now()) {
  if (!wishTestNames.includes(name)) return null;
  const clock = { value: now };
  const store = new DevelopmentWishStore({ now: () => clock.value });
  const auth = localAuth();
  let outcome = null;
  let accountDeleteConfirmed = false;
  const create = (n, duration = 24) => store.create({ product, evidence, duration, idempotencyKey: key(n) });
  const expire = (wish) => { clock.value = Date.parse(wish.expiresAt) + 1_000; store.list(); };
  const completed = (n, decision = 'abandon') => { const wish = create(n); expire(wish); return store.decide(wish.id, decision); };
  const execute = async () => {
    switch (name) {
      case 'anonymous': case 'sealed': { const wish = create(1); return { code: 'created', count: store.list().length, status: wish.status }; }
      case 'expired': { const wish = create(2); expire(wish); return { code: 'expired', status: store.list()[0].status }; }
      case 'purchase': { const wish = create(3); expire(wish); return { code: 'decided', status: store.decide(wish.id, 'purchase').status, count: store.list().length }; }
      case 'abandon': { const wish = create(4); expire(wish); return { code: 'decided', status: store.decide(wish.id, 'abandon').status, countedAmount: store.list()[0].countedAmount }; }
      case 'limit': { for (let n = 10; n < 15; n += 1) create(n); let code = 'unexpected'; try { create(15); } catch (error) { code = error.code; } return { code, count: store.list().length }; }
      case 'duplicate-create': { const first = create(20); const second = store.create({ product, evidence, duration: 24, idempotencyKey: key(20) }); return { code: 'duplicate_created_once', count: store.list().length, sameId: first.id === second.id }; }
      case 'decision-race': { const wish = create(21); expire(wish); const first = store.decide(wish.id, 'purchase'); const second = store.decide(wish.id, 'abandon'); return { code: 'first_decision_wins', count: store.list().length, winner: first.status, secondStatus: second.status }; }
      case 'pagination': { for (let n = 30; n < 52; n += 1) completed(n); return { code: 'pagination_ready', count: store.list().length, firstPageCount: store.list().slice(0, 20).length, hasMore: store.list().length > 20 }; }
      case 'bind-email': { const result = await auth.bind('local@example.test'); return { code: 'bound', ownerUnchanged: result.ownerIdBefore === result.ownerIdAfter, anonymous: auth.user.is_anonymous }; }
      case 'existing-email-login': { const result = await auth.existingLogin('existing@example.test'); return { code: 'otp_requested', shouldCreateUser: result.shouldCreateUser }; }
      case 'migration': { const pair = createMigrationPair(() => clock.value); pair.seed(); const first = pair.migrate(); const repeat = pair.migrate(); return { code: 'migrated', movedCount: first.movedCount, sourceCount: first.sourceCount, targetCount: first.targetCount, repeatMovedCount: repeat.movedCount }; }
      case 'migration-error': { const pair = createMigrationPair(() => clock.value); pair.seed(); return pair.migrate({ fail: true }); }
      case 'otp-error': case 'otp-expired': case 'otp-rate-limited': return { code: name.replaceAll('-', '_'), retryable: true };
      case 'delete-wish': { const first = create(60); create(61); store.delete(first.id); return { code: 'deleted', count: store.list().length }; }
      case 'clear-wishes': { completed(70); const active = create(71, 48); store.clearCompleted(); const items = store.list(); return { code: 'completed_cleared', count: items.length, activePreserved: items[0]?.id === active.id, status: items[0]?.status }; }
      case 'account-delete': {
        if (!accountDeleteConfirmed) { accountDeleteConfirmed = true; create(80); return { code: 'confirmation_required', count: store.list().length, deleted: false }; }
        store.clear(); auth.clear(); return { code: 'account_deleted', count: store.list().length, deleted: auth.user === null };
      }
      case 'refresh-restore': { const wish = create(90); return { code: 'refresh_ready', count: store.list().length, expiresAt: wish.expiresAt, status: wish.status }; }
      default: return { code: 'unsupported' };
    }
  };
  return {
    name, store, clock, auth,
    async run() { outcome = await execute(); return outcome; },
    get outcome() { return outcome; },
    prepareRecovery() { if (name !== 'refresh-restore' || store.list().length) return null; return create(90); },
  };
}

// Kept as a small compatibility wrapper for existing callers and deterministic tests.
export function buildWishScenario(name, now = Date.now()) {
  const harness = createWishTestHarness(name, now);
  if (!harness) return null;
  if (name === 'refresh-restore') harness.prepareRecovery();
  return { name, store: harness.store, refreshExpiresAt: harness.store.list()[0]?.expiresAt ?? null, harness };
}
