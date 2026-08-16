export const WishStatuses = Object.freeze({ SEALED: 'sealed', EXPIRED: 'expired', PURCHASED_INTENT: 'purchased_intent', ABANDONED: 'abandoned' });
export const DemoDurations = Object.freeze([24, 48, 72]);

const clone = (value) => structuredClone(value);
const money = (value) => Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;

export function validDuration(value) { return DemoDurations.includes(Number(value)); }
export function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u001F\u007f]/.test(value)) return null;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function snapshotProduct(product) {
  if (!product || typeof product.itemId !== 'string' || !product.itemId.trim() || typeof product.title !== 'string' || !product.title.trim()) return null;
  const sellingPrice = money(product.price ?? product.sellingPrice);
  const estimatedPrice = money(product.finalPrice ?? product.estimatedPrice);
  const promotionUrl = safeUrl(product.promotionUrl);
  if (sellingPrice === null || !promotionUrl) return null;
  return { provider: 'taobao', itemId: product.itemId.trim(), title: product.title.trim(), imageUrl: safeUrl(product.imageUrl), sellingPrice, estimatedPrice: estimatedPrice !== null && estimatedPrice !== sellingPrice ? estimatedPrice : null, priceLabel: estimatedPrice !== null && estimatedPrice !== sellingPrice ? '预估到手价' : '销售价', promotionUrl };
}
export function expiryFromServer(expiresAt, now = Date.now()) {
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) ? Math.max(0, Math.ceil((time - now) / 1000)) : 0;
}
export function syncWishExpiry(wish, now = Date.now()) {
  const copy = clone(wish);
  if (copy.status === WishStatuses.SEALED && Date.parse(copy.expiresAt) <= now) copy.status = WishStatuses.EXPIRED;
  return copy;
}
export function groupWishes(wishes, { page = 0, pageSize = 20, now = Date.now() } = {}) {
  const synced = wishes.map((wish) => syncWishExpiry(wish, now));
  const order = (a, b) => Date.parse(a.expiresAt ?? a.updatedAt ?? a.createdAt) - Date.parse(b.expiresAt ?? b.updatedAt ?? b.createdAt);
  const groups = { pending: [], sealed: [], completed: [] };
  for (const wish of synced) {
    if (wish.status === WishStatuses.EXPIRED) groups.pending.push(wish);
    else if (wish.status === WishStatuses.SEALED) groups.sealed.push(wish);
    else groups.completed.push(wish);
  }
  Object.values(groups).forEach((items) => items.sort(order));
  const flattened = [...groups.pending, ...groups.sealed, ...groups.completed];
  const start = page * pageSize;
  return { groups, items: flattened.slice(start, start + pageSize), hasMore: start + pageSize < flattened.length };
}
export function summarizeWishes(wishes, now = Date.now()) {
  const synced = wishes.map((wish) => syncWishExpiry(wish, now));
  const count = (status) => synced.filter((wish) => wish.status === status).length;
  return { wishCount: synced.length, sealedCount: count(WishStatuses.SEALED), expiredCount: count(WishStatuses.EXPIRED), abandonedCount: count(WishStatuses.ABANDONED), purchaseIntentCount: count(WishStatuses.PURCHASED_INTENT), abandonedListedAmount: synced.filter((wish) => wish.status === WishStatuses.ABANDONED).reduce((sum, wish) => sum + (money(wish.countedAmount) ?? 0), 0) };
}

export class WishDomainError extends Error { constructor(code) { super(code); this.code = code; } }
export class DevelopmentWishStore {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.wishes = []; this.keys = new Map(); this.sequence = 0; }
  create({ product, evidence, duration, idempotencyKey }) {
    if (!validDuration(duration)) throw new WishDomainError('invalid_duration');
    const snapshot = snapshotProduct(product); if (!snapshot) throw new WishDomainError('invalid_product');
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) throw new WishDomainError('invalid_idempotency_key');
    if (this.keys.has(idempotencyKey)) return clone(this.keys.get(idempotencyKey));
    if (this.wishes.filter((wish) => [WishStatuses.SEALED, WishStatuses.EXPIRED].includes(wish.status)).length >= 5) throw new WishDomainError('active_limit_reached');
    const createdAt = new Date(this.now()).toISOString();
    const wish = { id: `dev-wish-${++this.sequence}`, product: snapshot, evidence: clone(evidence ?? { expert: [], experience: [] }), custodyHours: Number(duration), demoDurationSeconds: Number(duration), createdAt, updatedAt: createdAt, expiresAt: new Date(this.now() + Number(duration) * 1000).toISOString(), status: WishStatuses.SEALED, decisionAt: null, countedAmount: 0 };
    this.wishes.unshift(wish); this.keys.set(idempotencyKey, wish); return clone(wish);
  }
  list() { this.wishes = this.wishes.map((wish) => syncWishExpiry(wish, this.now())); return clone(this.wishes); }
  decide(id, decision) {
    const wish = this.wishes.find((item) => item.id === id); if (!wish) throw new WishDomainError('not_found');
    Object.assign(wish, syncWishExpiry(wish, this.now()));
    if ([WishStatuses.PURCHASED_INTENT, WishStatuses.ABANDONED].includes(wish.status)) return clone(wish);
    if (wish.status !== WishStatuses.EXPIRED) throw new WishDomainError('wish_not_expired');
    wish.status = decision === 'purchase' ? WishStatuses.PURCHASED_INTENT : WishStatuses.ABANDONED;
    wish.decisionAt = new Date(this.now()).toISOString();
    wish.updatedAt = wish.decisionAt;
    wish.countedAmount = wish.status === WishStatuses.ABANDONED ? (wish.product.estimatedPrice ?? wish.product.sellingPrice) : 0;
    return clone(wish);
  }
  delete(id) { this.wishes = this.wishes.filter((wish) => wish.id !== id); }
  clear() { this.wishes = []; }
}
