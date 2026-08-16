import { DevelopmentWishStore, WishDomainError } from './wish-domain.js';

const product = { itemId: 'dev-item', title: '阶段 5 开发测试商品', price: 39.8, finalPrice: 29.8, promotionUrl: 'https://example.test/promotion' };
const evidence = { expert: [], experience: [] };
export const wishTestNames = Object.freeze(['anonymous','sealed','expired','purchase','abandon','limit','duplicate-create','decision-race','pagination','bind-email','existing-email-login','migration','migration-error','otp-error','otp-expired','otp-rate-limited','delete-wish','clear-wishes','account-delete']);

export function buildWishScenario(name, now = Date.now()) {
  if (!wishTestNames.includes(name)) return null;
  const clock = { value: now }; const store = new DevelopmentWishStore({ now: () => clock.value });
  const create = (key = crypto.randomUUID(), duration = 24) => store.create({ product, evidence, duration, idempotencyKey: key });
  if (name === 'limit') { for (let index = 0; index < 5; index += 1) create(`00000000-0000-4000-8000-0000000000${index}`); return { store, name, message: '阶段 5 开发测试情景：已达到 5 条保管上限。' }; }
  if (name === 'pagination') { for (let index = 0; index < 22; index += 1) { const wish = create(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`); clock.value += 25_000; store.list(); store.decide(wish.id, 'abandon'); } return { store, name, message: '阶段 5 开发测试情景：分页数据。' }; }
  const wish = create('00000000-0000-4000-8000-000000000001');
  if (['expired','purchase','abandon','decision-race'].includes(name)) { clock.value += 25_000; store.list(); }
  if (name === 'purchase' || name === 'decision-race') store.decide(wish.id, 'purchase');
  if (name === 'abandon') store.decide(wish.id, 'abandon');
  if (name === 'delete-wish') store.delete(wish.id);
  if (name === 'clear-wishes') store.clear();
  const messages = { 'bind-email': '阶段 5 开发测试情景：邮箱绑定后归属保持不变。', 'existing-email-login': '阶段 5 开发测试情景：已有保管箱 OTP 登录。', migration: '阶段 5 开发测试情景：匿名愿望已安全迁入。', 'migration-error': '阶段 5 开发测试情景：迁移失败，源愿望保持不变。', 'otp-error': '阶段 5 开发测试情景：验证码错误。', 'otp-expired': '阶段 5 开发测试情景：验证码已过期。', 'otp-rate-limited': '阶段 5 开发测试情景：验证码请求过于频繁。', 'account-delete': '阶段 5 开发测试情景：删除账户需要远程受控函数。' };
  return { store, wishId: wish.id, name, message: messages[name] ?? '阶段 5 开发测试情景：匿名保管箱已就绪。' };
}
