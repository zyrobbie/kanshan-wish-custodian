import { snapshotProduct, validDuration, WishDomainError } from './wish-domain.js';

export const wishMessages = Object.freeze({ invalid_duration: '请选择 24、48 或 72 小时。', invalid_product: '商品快照不完整，不能创建愿望。', active_limit_reached: '同时保管中的愿望最多为 5 条。', duplicate: '该愿望已创建，无需重复提交。', wish_not_expired: '愿望尚未到期，暂不能作决定。', not_found: '未找到该愿望。', request_failed: '愿望服务请求失败，请稍后重试。' });
export class WishesServiceError extends Error { constructor(code) { super(wishMessages[code] ?? wishMessages.request_failed); this.code = code; } }
const allowed = new Set(Object.keys(wishMessages));
const stable = (code) => allowed.has(code) ? code : 'request_failed';
export const idempotencyKey = () => crypto.randomUUID();

export class WishesService {
  constructor({ auth, client } = {}) { this.auth = auth; this.client = client ?? auth?.client; }
  async rpc(name, args) { await this.auth.ensureSession(); const { data, error } = await this.client.rpc(name, args); if (error) throw new WishesServiceError(stable(error.code ?? error.message)); return data; }
  async create({ product, evidence, duration, key = idempotencyKey() }) { if (!validDuration(duration)) throw new WishesServiceError('invalid_duration'); const snapshot = snapshotProduct(product); if (!snapshot) throw new WishesServiceError('invalid_product'); return this.rpc('create_custody_wish', { p_product: snapshot, p_evidence: evidence, p_custody_hours: Number(duration), p_idempotency_key: key }); }
  async list({ offset = 0, limit = 20 } = {}) { return this.rpc('list_my_custody_wishes', { p_offset: offset, p_limit: Math.min(20, Math.max(1, limit)) }); }
  async decide(id, decision) { return this.rpc('decide_custody_wish', { p_wish_id: id, p_decision: decision }); }
  async remove(id) { return this.rpc('delete_my_custody_wish', { p_wish_id: id }); }
  async clear() { return this.rpc('clear_my_custody_wishes', {}); }
  async migrate(sourceToken) { if (!sourceToken) return { movedCount: 0 }; await this.auth.ensureSession(); const { data, error } = await this.client.functions.invoke('migrate-anonymous-wishes', { headers: { 'x-source-authorization': `Bearer ${sourceToken}` }, body: {} }); if (error || !data?.ok) throw new WishesServiceError('request_failed'); return { movedCount: Number(data.movedCount) || 0 }; }
}
