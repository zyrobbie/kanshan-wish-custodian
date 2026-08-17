import './styles.css';
import { States, transition } from './state-machine.js';
import { DemoDurations, remainingSeconds } from './timing.js';
import { abandonedTotal, displayPrice, plannedSpend } from './pricing.js';
import { FixtureRepository } from './repository.js';
import { AsyncTaskGate } from './async-task.js';
import { Views, openWishFlow } from './navigation.js';
import { ProductSearchService, normalizeClientQuery, productPriceText, safeClientUrl } from './products-service.js';
import { ProductTestService, productTestName } from './product-test-scenarios.js';
import { ZhihuEvidenceService, ZhihuEvidenceError } from './zhihu-service.js';
import { EvidenceTestService, evidenceTestName } from './evidence-test-scenarios.js';
import { AuthService } from './auth-service.js';
import { WishesService } from './wishes-service.js';
import { createWishTestHarness, wishTestNames } from './wish-test-scenarios.js';
import { expiryFromServer, groupWishes, summarizeWishes, WishStatuses } from './wish-domain.js';
import { RecoveryTriggers, recoveryPlan } from './wish-recovery.js';
import { shoppingCardSnapshot } from './shopping-card.js';

const isDevelopment = import.meta.env.DEV;
const root = document.querySelector('#app');
const fixtureMode = isDevelopment && new URLSearchParams(window.location.search).get('fixture') === '1';
const productTest = !fixtureMode && isDevelopment ? productTestName(window.location.search) : null;
const productTestMode = Boolean(productTest);
const evidenceTest = !fixtureMode && productTest === 'success' && isDevelopment ? evidenceTestName(window.location.search) : null;
const evidenceTestMode = Boolean(evidenceTest);
const wishTest = !fixtureMode && isDevelopment ? new URLSearchParams(window.location.search).get('wishTest') : null;
const wishTestMode = Boolean(wishTest && wishTestNames.includes(wishTest));
// Only development wish tests retain their deterministic clock across a reload.
// Production restoration remains server-authoritative through the stored expiresAt.
const wishScenario = (() => {
  if (!wishTestMode) return null;
  const seedKey = `kanshan:phase5:wish-test-seed:${wishTest}`;
  const savedSeed = Number(window.sessionStorage.getItem(seedKey));
  const seed = Number.isFinite(savedSeed) && savedSeed > 0 ? savedSeed : Date.now();
  window.sessionStorage.setItem(seedKey, String(seed));
  return createWishTestHarness(wishTest, seed);
})();
const repository = new FixtureRepository({ mode: fixtureMode ? 'development' : 'production', storage: fixtureMode ? window.sessionStorage : null });
const localWishFlow = wishTestMode && !productTestMode;
const productService = fixtureMode ? null : productTestMode ? new ProductTestService(productTest) : localWishFlow ? new ProductTestService('wish-success') : new ProductSearchService({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
const evidenceService = fixtureMode ? null : evidenceTestMode ? new EvidenceTestService(evidenceTest) : localWishFlow ? new EvidenceTestService('both') : new ZhihuEvidenceService({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
const authService = fixtureMode || productTestMode ? null : new AuthService({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
const wishesService = authService ? new WishesService({ auth: authService }) : null;
let flow = fixtureMode ? repository.getFlow() : { state: States.IDLE };
let timer = null;
let view = Views.FLOW;
const taskGate = new AsyncTaskGate();
let recoveryInFlight = false;

const statusNames = { [States.SEALED]: '保管中', [States.EXPIRED]: '已到期待决定', [States.PURCHASE_READY]: '决定购买', [States.ABANDONED]: '已放弃', [States.ARCHIVED]: '已归档' };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const modeLabel = () => fixtureMode ? '开发测试数据' : wishTestMode ? `开发测试情景 · ${wishTest}` : productTestMode || evidenceTestMode ? '开发测试情景' : '看山·愿望寄存处';
const productSource = () => fixtureMode ? '开发 fixture（非淘宝实时结果）' : wishTestMode || productTestMode ? '开发测试情景（不访问外部接口）' : '本次可推广商品';
const productSlot = '<div data-product-summary></div>';
const kanshanAsset = (file) => `${import.meta.env.BASE_URL}assets/kanshan-home/${file}`;
const liuKanshan = (state = 'welcome') => `<img class="liu-kanshan liu-kanshan-${state}" src="${kanshanAsset('liu-kanshan-wave-transparent.png')}" alt="刘看山${state === 'guard' ? '正在守候这个愿望' : state === 'release' ? '轻轻送别这次决定' : '向你挥手'}" />`;

function appendProductSummary(target, product) {
  const summary = document.createElement('div'); summary.className = 'summary';
  const imageUrl = safeClientUrl(product.imageUrl);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl; image.alt = typeof product.title === 'string' ? product.title : '商品图片';
    image.addEventListener('error', () => {
      const fallback = document.createElement('div'); fallback.className = 'image-fallback'; fallback.textContent = '图片加载失败'; image.replaceWith(fallback);
    }, { once: true });
    summary.append(image);
  } else { const fallback = document.createElement('div'); fallback.className = 'image-fallback'; fallback.textContent = '图片暂缺'; summary.append(fallback); }
  const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = String(product.title ?? '未命名商品'); text.append(title);
  const price = document.createElement('p');
  if (product.provider === 'taobao') {
    const amounts = productPriceText(product) ?? (Number.isFinite(product.sellingPrice) ? { sales: product.sellingPrice, estimated: Number.isFinite(product.estimatedPrice) ? product.estimatedPrice : null } : null);
    price.textContent = amounts && amounts.estimated !== null ? `销售价 ${displayPrice(amounts.sales)} · 预估到手价 ${displayPrice(amounts.estimated)}` : `销售价 ${displayPrice(amounts?.sales)}`;
  } else { price.textContent = `标价 ${displayPrice(product.listPrice)} · 销售价 ${displayPrice(product.sellingPrice)} · 预估到手价 ${displayPrice(product.estimatedPrice)}`; }
  text.append(price); summary.append(text); target.append(summary);
}
function mountProductSummary(product) { const slot = root.querySelector('[data-product-summary]'); if (slot && product) appendProductSummary(slot, product); }

function shell(content, { home = false } = {}) {
  const header = home ? '' : `<header><a class="brand" href="#home" data-action="home">看山·愿望寄存处</a><span class="mode-badge">${modeLabel()}</span><button class="quiet-button" data-action="wishes">我的愿望</button></header>`;
  root.innerHTML = `<main class="app-shell${home ? ' home-shell' : ''}">${header}${content}</main>`;
  root.querySelectorAll('[data-action]').forEach((node) => node.addEventListener('click', handleAction));
}

function save(nextState, patch = {}) {
  flow = { ...flow, ...patch, state: transition(flow.state, nextState) };
  if (fixtureMode) repository.saveFlow(flow); render();
}

function invalidateTasks() { taskGate.invalidate(); }
function taskIsCurrent(token, expectedState) { return view === Views.FLOW && taskGate.isCurrent(token) && flow.state === expectedState; }

function render() {
  clearInterval(timer);
  if (!fixtureMode && !productTestMode && !wishTestMode && !productService.configured) { root.innerHTML = `<main class="app-shell unavailable"><h1>暂时无法开始搜索</h1><p>商品服务暂不可用，请稍后再试。</p></main>`; return; }
  if (view === Views.WISHES) return renderWishes();
  const record = fixtureMode && flow.recordId ? repository.getWish(flow.recordId) : null;
  if (record && flow.state === States.SEALED) {
    const current = repository.syncExpiry(record.id);
    if (current.status === States.EXPIRED) { flow = repository.getFlow(); }
  }
  switch (flow.state) {
    case States.IDLE: return renderHome();
    case States.PRODUCT_SEARCHING: return renderSearching();
    case States.PRODUCT_SELECTING: return renderProducts();
    case States.PRODUCT_SELECTED: return renderProductSelected();
    case States.PRODUCT_EMPTY: return renderProductEmpty();
    case States.EVIDENCE_LOADING: return renderEvidenceLoading();
    case States.EVIDENCE_READY:
    case States.EVIDENCE_PARTIAL: return renderEvidence();
    case States.CUSTODY_CONFIG: return renderCustody();
    case States.SEALED: return renderSealed(flow.record ?? repository.getWish(flow.recordId));
    case States.EXPIRED: return renderExpired(flow.record ?? repository.getWish(flow.recordId));
    case States.PURCHASE_READY: return renderPurchase(flow.record ?? repository.getWish(flow.recordId));
    case States.ABANDONED: return renderAbandoned(flow.record ?? repository.getWish(flow.recordId));
    case States.ERROR: return renderError();
    default: return renderHome();
  }
}

function renderHome() {
  shell(`<section class="home-stage" aria-labelledby="home-title"><img class="home-reference-art" src="${kanshanAsset('home-reference-original.png')}" alt="" aria-hidden="true" /><h1 id="home-title" class="sr-only">看山·愿望寄存处</h1><form id="search-form" class="home-hotspots"><label class="sr-only" for="search-input">商品名称</label><input class="home-live-input" id="search-input" name="query" maxlength="80" placeholder="输入你想买的好物名称" value="${escape(flow.query ?? '')}" /><span class="home-counter-mask" aria-hidden="true"></span><p id="input-error" class="home-input-error" role="alert"></p><button class="home-primary-hotspot" type="submit"><span class="sr-only">交给看山看看</span></button><p class="home-hint">先了解一下，再决定也没关系哦</p></form><button class="wish-entry-hotspot" type="button" data-action="wishes"><span class="sr-only">我的愿望：查看你寄存的愿望清单</span></button><span class="home-gesture-mask" aria-hidden="true"></span></section>${fixtureMode ? `<section class="test-panel"><h2>开发测试开关</h2><label>证据状态 <select id="evidence-mode"><option value="both">两类证据都有</option><option value="partial">只有专业类证据</option><option value="none">没有相关证据</option><option value="error">证据加载失败</option></select></label><label>候选异常 <select id="product-mode"><option value="normal">正常候选</option><option value="broken">首张图片加载失败</option><option value="missing-promotion">首条缺少推广链接</option></select></label></section>` : ''}`, { home: true });
  root.querySelector('#search-form').addEventListener('submit', (event) => { event.preventDefault(); const query = normalizeClientQuery(new FormData(event.currentTarget).get('query')); if (!query) { root.querySelector('#input-error').textContent = '请输入 2 到 80 个字符的商品名称、品牌或型号。'; return; } root.querySelector('[type="submit"]').disabled = true; flow = { state: States.IDLE, query, evidenceMode: fixtureMode ? root.querySelector('#evidence-mode').value : null, productMode: fixtureMode ? root.querySelector('#product-mode').value : null }; save(States.PRODUCT_SEARCHING); });
}

function renderSearching() {
  const task = taskGate.begin();
  const query = flow.query;
  const productMode = flow.productMode;
  const copy = fixtureMode ? ['开发测试数据', '正在整理静态候选', '不会访问真实淘宝联盟接口。'] : wishTestMode ? [`阶段 6 开发测试情景 · ${wishTest}`, '正在演练愿望保管流程', '不会访问 Supabase、淘宝、知乎、邮件或转链服务。'] : productTestMode ? [`开发测试情景 · ${productTest}`, '正在演练商品搜索状态', '不会访问 Supabase 或淘宝联盟接口。'] : ['淘宝联盟实时候选', '正在搜索符合条件的商品', '仅展示当次返回且可推广的候选。'];
  shell(`<section class="center-state"><span class="loader" aria-hidden="true"></span><p class="eyebrow">${copy[0]}</p><h1>${copy[1]}</h1><p>${copy[2]}</p>${wishTestMode ? '<button class="quiet-button" id="simulate-background-return" type="button">模拟后台返回（开发测试）</button>' : ''}</section>`);
  root.querySelector('#simulate-background-return')?.addEventListener('click', () => { void recover(RecoveryTriggers.BACKGROUND_RETURN); });
  // Give the explicit local recovery control enough time to exercise a
  // background return before the local product fixture completes.
  const searchDelay = wishTestMode ? 1_500 : 420;
  setTimeout(async () => {
    try {
      const result = fixtureMode ? { products: await repository.search(query, productMode) } : await productService.search(query);
      const products = result.products;
      if (!taskIsCurrent(task, States.PRODUCT_SEARCHING)) return;
      if (!products.length) { save(States.PRODUCT_EMPTY); return; }
      save(States.PRODUCT_SELECTING, { products });
    } catch (error) {
      if (!taskIsCurrent(task, States.PRODUCT_SEARCHING)) return;
      flow = { ...flow, error: error.message };
      save(States.ERROR);
    }
  }, searchDelay);
}

function renderProducts() {
  const label = fixtureMode ? '开发测试数据' : wishTestMode ? `阶段 6 开发测试情景 · ${wishTest}` : productTestMode ? `开发测试情景 · ${productTest}` : '淘宝联盟实时候选';
  shell(`<section><p class="eyebrow">${label} · ${escape(flow.query)}</p><h1>从候选中选择一件</h1><p>实际价格以淘宝结算页为准。</p><div id="product-list" class="products"></div><button class="quiet-button" data-action="home">重新输入</button></section>`);
  const list = root.querySelector('#product-list');
  flow.products.forEach((product, index) => {
    const card = document.createElement('article'); card.className = 'product-card'; appendProductSummary(card, product);
    const source = document.createElement('p'); source.className = 'source'; source.textContent = `来源：${productSource()}${fixtureMode ? '' : ' · 刚刚获取'}`; card.append(source);
    if (Number.isFinite(product.bundlePrice) && product.bundlePriceCondition) { const bundle = document.createElement('p'); bundle.textContent = `凑单参考价 ${displayPrice(product.bundlePrice)}：${String(product.bundlePriceCondition)}`; card.append(bundle); }
    const choose = document.createElement('button'); choose.className = 'secondary'; choose.type = 'button'; choose.dataset.productIndex = String(index); choose.textContent = '选择这件';
    choose.addEventListener('click', () => {
      const selected = flow.products[Number(choose.dataset.productIndex)];
      if (!selected || !safeClientUrl(selected.promotionUrl)) { flow = { ...flow, error: '该候选缺少有效官方推广链接，不能继续。' }; save(States.ERROR); return; }
      save(States.EVIDENCE_LOADING, { product: selected });
    });
    card.append(choose); list.append(card);
  });
}

function renderProductSelected() { renderEvidenceLoading(); }
function renderProductEmpty() { const label = fixtureMode ? '开发测试数据' : productTestMode ? `开发测试情景 · ${productTest}` : '淘宝联盟实时候选'; shell(`<section class="center-state"><p class="eyebrow">${label}</p><h1>暂未找到可展示的候选</h1><p>本次返回结果为空，或全部因字段不完整被过滤；没有自动补充候选。</p><button class="primary" data-action="home">换一个关键词</button></section>`); }

function renderEvidenceLoading() {
  const task = taskGate.begin();
  const evidenceMode = flow.evidenceMode;
  const label = fixtureMode ? '开发测试数据' : evidenceTestMode ? `开发测试情景 · ${evidenceTest}` : '知乎双层内容';
  const description = fixtureMode ? '不会请求知乎或任何外部内容。' : evidenceTestMode ? '不会请求 Supabase、淘宝或知乎。' : '正在从知乎整理专业解读与真实体验。';
  shell(`<section class="center-state"><span class="loader" aria-hidden="true"></span><p class="eyebrow">${label}</p><h1>正在从知乎整理专业解读与真实体验</h1><p>${description}</p></section>`);
  setTimeout(async () => {
    try {
      const fixtureEvidence = fixtureMode ? await repository.evidence(evidenceMode) : null;
      const fixtureLayer = (layer, items) => ({ status: items.length ? 'ready' : 'empty', items: items.map((item, index) => ({ layer, id: `fixture-${layer}-${index}`, title: item.title, authorName: '开发测试样例', authorBadgeText: null, contentType: '开发样例', summary: item.summary, url: `https://www.zhihu.com/question/fixture-${layer}-${index}`, voteUpCount: null, authorityLevel: null, editTime: null })) });
      const evidence = fixtureMode ? { coreProductName: flow.product?.title ?? '', layers: { expert: fixtureLayer('expert', fixtureEvidence.expert), experience: fixtureLayer('experience', fixtureEvidence.experience) } } : await evidenceService.load(flow.product?.title);
      if (!taskIsCurrent(task, States.EVIDENCE_LOADING)) return;
      const state = evidence.layers.expert.status === 'ready' && evidence.layers.experience.status === 'ready' ? States.EVIDENCE_READY : States.EVIDENCE_PARTIAL;
      save(state, { evidence });
    } catch (error) {
      if (!taskIsCurrent(task, States.EVIDENCE_LOADING)) return;
      flow = { ...flow, failedStage: 'evidence', error: error instanceof Error ? error.message : '知乎证据服务请求失败，请稍后重试。' };
      save(States.ERROR);
    }
  }, 350);
}

function appendEvidenceSection(target, label, layer) {
  const section = document.createElement('section'); section.className = 'evidence';
  const heading = document.createElement('h2'); heading.textContent = label; section.append(heading);
  if (layer.status === 'error') { const notice = document.createElement('p'); notice.className = 'empty'; notice.textContent = '该层暂时加载失败，未将失败当作无结果。'; section.append(notice); target.append(section); return; }
  if (!layer.items.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '该层暂未找到足够相关内容。'; section.append(empty); target.append(section); return; }
  layer.items.forEach((item) => {
    const card = document.createElement('article');
    const source = document.createElement('span'); source.className = 'source'; source.textContent = '来源：知乎';
    const title = document.createElement('h3'); title.textContent = item.title;
    const meta = document.createElement('p'); meta.textContent = `${item.authorName}${item.authorBadgeText ? ` · ${item.authorBadgeText}` : ''} · ${item.contentType}`;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    const link = document.createElement('a'); link.className = 'evidence-link'; link.textContent = '查看知乎原文'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.href = item.url;
    card.append(source, title, meta, summary, link); section.append(card);
  });
  target.append(section);
}
function renderEvidence() {
  const { evidence } = flow;
  const label = fixtureMode ? '开发测试数据 · 知乎证据样例' : evidenceTestMode ? `开发测试情景 · ${evidenceTest}` : '知乎双层内容';
  const article = `<section><p class="eyebrow">${label}</p><h1>给决定多一点可追溯的参考</h1>${productSlot}<div id="evidence-layers"></div><p id="evidence-notice" class="notice"></p><div class="decision-row"><button class="secondary" data-action="products">返回重选商品</button><button class="quiet-button" data-action="home">开始新的搜索</button></div></section>`;
  shell(article); mountProductSummary(flow.product);
  const target = root.querySelector('#evidence-layers');
  appendEvidenceSection(target, '专业解读', evidence.layers.expert);
  appendEvidenceSection(target, '真实体验', evidence.layers.experience);
  const bothEmpty = evidence.layers.expert.status === 'empty' && evidence.layers.experience.status === 'empty';
  root.querySelector('#evidence-notice').textContent = bothEmpty ? '本次未找到足够相关的知乎资料。资料不足不会替用户作决定，仍可自行选择保管。' : '搜索摘要不是完整原文；请自行查看来源。资料不足不会替用户作决定。';
  const actions = root.querySelector('.decision-row'); const custody = document.createElement('button'); custody.className = 'primary'; custody.type = 'button'; custody.dataset.action = 'custody'; custody.textContent = '交给看山保管'; custody.addEventListener('click', handleAction); actions.append(custody);
}

function normalizeWish(record) {
  if (!record) return null;
  return { id: record.id, product: record.product, evidence: record.evidence, custodyHours: record.custodyHours ?? record.custody_hours, demoDurationSeconds: record.demoDurationSeconds ?? record.demo_duration_seconds, createdAt: record.createdAt ?? record.created_at, expiresAt: record.expiresAt ?? record.expires_at, status: record.status, decisionAt: record.decisionAt ?? record.decision_at, countedAmount: Number(record.countedAmount ?? record.counted_amount ?? 0), updatedAt: record.updatedAt ?? record.updated_at };
}
async function createCustody(duration, button) {
  button.disabled = true;
  try {
    let record;
    if (fixtureMode) record = repository.seal({ product: flow.product, duration, evidence: flow.evidence });
    else if (wishTestMode) record = wishScenario.store.create({ product: flow.product, evidence: flow.evidence, duration, idempotencyKey: crypto.randomUUID() });
    else record = await wishesService.create({ product: flow.product, evidence: flow.evidence, duration });
    flow = { ...flow, record: normalizeWish(record), recordId: record.id, state: States.SEALED };
    if (fixtureMode) repository.saveFlow(flow); render();
  } catch (error) { flow = { ...flow, error: error instanceof Error ? error.message : '愿望创建失败。', state: States.ERROR }; render(); }
}
function renderCustody() { const label = wishTestMode ? `开发测试情景 · ${wishTest}` : '寄存时间'; shell(`<section><p class="eyebrow">${label}</p><h1>这次想保管多久？</h1>${productSlot}<p>正式产品对应 24 / 48 / 72 小时；当前演示分别压缩为 24 / 48 / 72 秒。</p><div class="duration-list">${DemoDurations.map((seconds) => `<button class="duration" data-duration="${seconds}"><b>${seconds} 秒</b><span>对应 ${seconds} 小时</span></button>`).join('')}</div><p class="notice">创建与到期以保存的到期时间为准；刷新、页面恢复或后台返回时都会重新读取。</p></section>`); mountProductSummary(flow.product); root.querySelectorAll('[data-duration]').forEach((button) => button.addEventListener('click', () => createCustody(Number(button.dataset.duration), button))); }

function renderSealed(record) { if (!record) return renderWishes(); const update = () => { const left = expiryFromServer(record.expiresAt); if (left <= 0) { flow = { ...flow, record: { ...record, status: States.EXPIRED }, state: States.EXPIRED }; render(); return; } const counter = root.querySelector('#countdown'); if (counter) counter.textContent = `${left} 秒`; }; const label = fixtureMode || wishTestMode ? '已封存 · 开发测试' : '已封存'; shell(`<section class="sealed"><div class="state-heading"><div><p class="eyebrow">${label}</p><h1>先把它放在这里。</h1></div>${liuKanshan('guard')}</div>${productSlot}<div class="countdown" id="countdown" aria-live="polite">${expiryFromServer(record.expiresAt)} 秒</div><p>预计到期：<time id="expiry-time"></time></p><p class="notice">倒计时以保存的到期时间为准。</p></section>`); const expiry = root.querySelector('#expiry-time'); expiry.dateTime = record.expiresAt; expiry.textContent = new Date(record.expiresAt).toLocaleTimeString('zh-CN'); mountProductSummary(record.product); update(); timer = setInterval(update, 500); }
function equalButtons() { return `<div class="decision-row equal"><button class="decision" data-decision="purchase">我还是想买</button><button class="decision" data-decision="abandon">这次不买了</button></div>`; }
async function decideCustody(record, decision, button) { button.disabled = true; try { const result = fixtureMode ? repository.decide(record.id, decision) : wishTestMode ? wishScenario.store.decide(record.id, decision) : await wishesService.decide(record.id, decision); const normalized = normalizeWish(result); flow = { ...flow, record: normalized, state: normalized.status === WishStatuses.PURCHASED_INTENT ? States.PURCHASE_READY : States.ABANDONED }; render(); } catch (error) { flow = { ...flow, error: error instanceof Error ? error.message : '决定保存失败。', state: States.ERROR }; render(); } }
function renderExpired(record) { shell(`<section><p class="eyebrow">保管时间到了</p><h1>现在，你想怎么决定？</h1>${productSlot}<p>没有默认选择；两个决定的权重相同。</p>${equalButtons()}</section>`); mountProductSummary(record.product); root.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', () => decideCustody(record, button.dataset.decision, button))); }
function renderPurchase(record) {
  // Explicit local-only rendering test for old/invalid saved values. Production
  // always presents the exact server snapshot unchanged.
  const cardRecord = wishTest === 'purchase-invalid-link'
    ? { ...record, product: { ...record.product, promotionUrl: 'javascript:invalid-local-test' } }
    : record;
  const snapshot = shoppingCardSnapshot(cardRecord);
  const href = snapshot.promotionHref;
  shell(`<section class="shopping-card outcome-card"><div class="state-heading"><div><p class="eyebrow">${wishTest === 'purchase-invalid-link' ? '开发测试情景 · 无效保存链接' : '已记录前往购买意向'}</p><h1>决定由你自己完成。</h1></div>${liuKanshan('release')}</div><p>这是创建愿望时保存的商品快照。看山不会重新搜索、转链或替换链接。</p>${productSlot}<dl class="snapshot-details"><div><dt>商品编号</dt><dd id="shopping-item-id"></dd></div><div><dt>价格说明</dt><dd>实际价格以淘宝结算页为准。</dd></div></dl><p id="promotion-status" class="notice"></p><div id="shopping-actions" class="decision-row"></div></section>`);
  mountProductSummary(cardRecord.product);
  root.querySelector('#shopping-item-id').textContent = snapshot.itemId || '未提供';
  const status = root.querySelector('#promotion-status'); const actions = root.querySelector('#shopping-actions');
  if (href) {
    status.textContent = '已保留创建愿望时的官方推广链接。是否前往淘宝，由你再次决定。';
    const go = document.createElement('a'); go.className = 'primary'; go.setAttribute('href', href); go.textContent = '去淘宝看看'; go.setAttribute('aria-label', '在当前页面打开保存的淘宝推广链接');
    actions.append(go);
  } else status.textContent = '这条愿望没有可安全打开的官方推广链接，因此不会提供外跳按钮。';
  const wishes = document.createElement('button'); wishes.className = 'secondary'; wishes.type = 'button'; wishes.dataset.action = 'wishes'; wishes.textContent = '返回我的愿望'; wishes.addEventListener('click', handleAction); actions.append(wishes);
  const home = document.createElement('button'); home.className = 'quiet-button'; home.type = 'button'; home.dataset.action = 'home'; home.textContent = '回到首页'; home.addEventListener('click', handleAction); actions.append(home);
}
function renderAbandoned(record) {
  const amount = Number(record.countedAmount ?? 0);
  shell(`<section class="outcome-card"><div class="state-heading"><div><p class="eyebrow">已放下 · 计划支出记录</p><h1>这次先不买，也是一种决定。</h1></div>${liuKanshan('release')}</div>${productSlot}<p class="metric">本次放下的计划支出：${displayPrice(amount)}</p><p id="abandon-summary" class="notice">正在读取累计记录…</p><p>金额是计划支出记录，不是真实财务收益，也不代表实际省下的钱。</p><div class="decision-row"><button class="secondary" data-action="wishes">查看我的愿望</button><button class="quiet-button" data-action="home">回到首页</button></div></section>`);
  mountProductSummary(record.product);
  const summary = root.querySelector('#abandon-summary');
  void getWishPage(0).then((page) => {
    if (!summary.isConnected) return;
    const stats = page.summary ?? summarizeWishes(page.items);
    summary.textContent = `累计放下 ${stats.abandonedCount} 条愿望 · 累计计划支出 ${displayPrice(stats.abandonedListedAmount)}`;
  }).catch(() => { if (summary.isConnected) summary.textContent = '累计记录暂时无法读取，可返回愿望列表后重试。'; });
}
async function getTimeline() {
  if (fixtureMode) return repository.list().map(normalizeWish);
  if (wishTestMode) return wishScenario.store.list();
  const all = []; let offset = 0; let page;
  do { page = await wishesService.list({ offset }); all.push(...page.items.map((row) => normalizeWish(row.wish ?? row))); offset = page.nextOffset; } while (page.hasMore && Number.isInteger(offset));
  return all;
}
async function getWishPage(offset = 0) {
  if (fixtureMode) { const items = repository.list().map(normalizeWish); return { items: items.slice(offset, offset + 20), nextOffset: offset + 20 < items.length ? offset + 20 : null, hasMore: offset + 20 < items.length, summary: summarizeWishes(items) }; }
  if (wishTestMode) { const items = wishScenario.store.list(); return { items: items.slice(offset, offset + 20), nextOffset: offset + 20 < items.length ? offset + 20 : null, hasMore: offset + 20 < items.length, summary: summarizeWishes(items) }; }
  const page = await wishesService.list({ offset }); return { ...page, items: page.items.map((row) => normalizeWish(row.wish ?? row)) };
}
function appendWishRow(list, wish) {
  const row = document.createElement('article'); row.className = 'wish-row';
  const status = document.createElement('span'); status.className = 'status'; status.textContent = statusNames[wish.status] ?? wish.status;
  const title = document.createElement('strong'); title.textContent = wish.product?.title ?? '未命名商品';
  const price = document.createElement('span'); price.textContent = displayPrice(wish.product?.estimatedPrice ?? wish.product?.sellingPrice);
  row.append(status, title, price);
  if (wish.status === WishStatuses.SEALED) { const open = document.createElement('button'); open.className = 'secondary'; open.setAttribute('data-open-wish', wish.id); open.textContent = '恢复保管'; open.addEventListener('click', () => { invalidateTasks(); flow = { state: States.SEALED, record: wish, recordId: wish.id }; view = Views.FLOW; render(); }); row.append(open); }
  if (wish.status === WishStatuses.EXPIRED) { const open = document.createElement('button'); open.className = 'secondary'; open.textContent = '现在决定'; open.addEventListener('click', () => { flow = { state: States.EXPIRED, record: wish, recordId: wish.id }; view = Views.FLOW; render(); }); row.append(open); }
  if (wish.status === WishStatuses.PURCHASED_INTENT || wish.status === WishStatuses.ABANDONED) { const open = document.createElement('button'); open.className = 'secondary'; open.textContent = wish.status === WishStatuses.PURCHASED_INTENT ? '查看购物卡' : '查看记录'; open.addEventListener('click', () => { flow = { state: wish.status === WishStatuses.PURCHASED_INTENT ? States.PURCHASE_READY : States.ABANDONED, record: wish, recordId: wish.id }; view = Views.FLOW; render(); }); row.append(open); }
  const remove = document.createElement('button'); remove.className = 'quiet-button'; remove.textContent = '删除'; remove.addEventListener('click', async () => {
    if (!window.confirm('确定删除这条愿望吗？此操作不可恢复。')) return;
    try { if (fixtureMode) repository.state?.delete?.(wish.id); else if (wishTestMode) wishScenario.store.delete(wish.id); else await wishesService.remove(wish.id); renderWishes(); }
    catch (error) { const summary = root.querySelector('#wish-summary'); if (summary) summary.textContent = error instanceof Error ? error.message : '删除失败，请重试。'; }
  }); row.append(remove); list.append(row);
}
function renderWishes() {
  shell(`<section><p class="eyebrow">${wishTestMode ? `开发测试情景 · ${wishTest}` : '愿望清单'}</p><h1>我的愿望</h1><p>这里会保留当前身份下的愿望和决定记录。</p><p id="wish-summary" class="notice"></p><div id="wish-list"></div><button class="secondary" id="clear-wishes">清空愿望</button><button class="quiet-button" id="sign-out">退出当前设备</button>${wishTestMode ? '<button class="quiet-button" id="delete-account">删除账户（开发测试）</button>' : ''}<button class="quiet-button" data-action="home">开始新的搜索</button></section>`);
  const list = root.querySelector('#wish-list'); const summary = root.querySelector('#wish-summary');
  const identity = document.createElement('section'); identity.className = 'identity-panel';
  const identityTitle = document.createElement('h2'); identityTitle.textContent = '跨浏览器找回';
  const identityHint = document.createElement('p'); identityHint.textContent = wishTestMode ? '开发测试情景不发送邮件。' : '跨浏览器找回将在后续开放。';
  identity.append(identityTitle, identityHint);
  if (isDevelopment && !wishTestMode && authService) {
    const email = document.createElement('input'); email.type = 'email'; email.placeholder = '邮箱'; email.autocomplete = 'email';
    const token = document.createElement('input'); token.inputMode = 'numeric'; token.placeholder = '邮件验证码'; token.autocomplete = 'one-time-code';
    const message = document.createElement('p'); message.className = 'notice';
    const bind = document.createElement('button'); bind.className = 'quiet-button'; bind.textContent = '发送绑定验证码';
    const verifyBind = document.createElement('button'); verifyBind.className = 'quiet-button'; verifyBind.textContent = '确认绑定';
    const requestLogin = document.createElement('button'); requestLogin.className = 'quiet-button'; requestLogin.textContent = '发送已有账户登录验证码';
    const verifyLogin = document.createElement('button'); verifyLogin.className = 'quiet-button'; verifyLogin.textContent = '验证登录';
    let bindingOwnerId = null; let anonymousSourceToken = null;
    bind.addEventListener('click', async () => { try { const result = await authService.bindEmail(email.value.trim()); bindingOwnerId = result.ownerIdBefore; message.textContent = '绑定验证码已请求；请在当前浏览器完成确认。'; } catch (error) { message.textContent = error.message; } });
    verifyBind.addEventListener('click', async () => { try { await authService.verifyBinding(email.value.trim(), token.value.trim(), bindingOwnerId); message.textContent = '邮箱已绑定，身份未更换。'; } catch (error) { message.textContent = error.message; } });
    requestLogin.addEventListener('click', async () => { try { const request = await authService.requestExistingLogin(email.value.trim()); anonymousSourceToken = request.sourceToken; message.textContent = '已有账户登录验证码已请求；不存在邮箱不会自动注册。'; } catch (error) { message.textContent = error.message; } });
    verifyLogin.addEventListener('click', async () => { try { await authService.verifyExistingLogin(email.value.trim(), token.value.trim()); const migrated = await wishesService.migrate(anonymousSourceToken); anonymousSourceToken = null; message.textContent = migrated.movedCount ? '登录成功，匿名愿望已迁入当前账户。' : '登录成功，正在读取当前账户愿望。'; renderWishes(); } catch (error) { message.textContent = error.message; } });
    identity.append(email, token, bind, verifyBind, requestLogin, verifyLogin, message);
  }
  list.before(identity);
  if (wishTestMode) {
    const testPanel = document.createElement('section'); testPanel.className = 'test-panel';
    const title = document.createElement('h2'); title.textContent = '开发测试行为';
    const hint = document.createElement('p'); hint.textContent = '此操作只执行本地开发存储与 Auth stub，不代表真实 Supabase 或邮件验收。';
    const run = document.createElement('button'); run.className = 'secondary'; run.id = 'run-wish-test'; run.textContent = '执行当前测试行为';
    const result = document.createElement('p'); result.className = 'notice'; result.id = 'wish-test-result';
    if (wishScenario.outcome) result.textContent = `本地行为结果：${Object.entries(wishScenario.outcome).map(([name, value]) => `${name}=${String(value)}`).join(' · ')}`;
    run.addEventListener('click', async () => { run.disabled = true; try { await wishScenario.run(); renderWishes(); } catch (error) { result.textContent = `本地行为失败：${error?.code ?? 'request_failed'}`; run.disabled = false; } });
    testPanel.append(title, hint, run, result); identity.after(testPanel);
  }
  (async () => { try {
    let page = await getWishPage(0); const wishes = [...page.items]; const stats = page.summary ?? summarizeWishes(wishes);
    summary.textContent = `保管中 ${stats.sealedCount} 条 · 待决定 ${stats.expiredCount} 条 · 已放下计划支出 ${displayPrice(stats.abandonedListedAmount)}`;
    const paint = () => { list.replaceChildren(); const grouped = groupWishes(wishes, { page: 0, pageSize: wishes.length || 20 }); if (!grouped.items.length) { list.textContent = '暂无愿望。'; return; } grouped.items.forEach((wish) => appendWishRow(list, wish)); if (page.hasMore) { const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '加载更多'; more.addEventListener('click', async () => { more.disabled = true; try { page = await getWishPage(page.nextOffset); wishes.push(...page.items); paint(); } catch (error) { summary.textContent = error instanceof Error ? error.message : '愿望读取失败。'; } }); list.append(more); } };
    paint();
  } catch (error) { summary.textContent = error instanceof Error ? error.message : '愿望读取失败。'; } })();
  root.querySelector('#clear-wishes').textContent = '清空已完成愿望';
  root.querySelector('#clear-wishes').addEventListener('click', async () => { if (!window.confirm('确认清空已完成愿望？保管中和待决定愿望不会被删除。')) return; try { if (fixtureMode) repository.clearFlow(); else if (wishTestMode) wishScenario.store.clearCompleted?.(); else await wishesService.clear(); renderWishes(); } catch (error) { summary.textContent = error instanceof Error ? error.message : '清空失败，请重试。'; } });
  root.querySelector('#sign-out').addEventListener('click', async () => { try { if (authService) await authService.signOut({ scope: 'local' }); flow={state:States.IDLE}; view=Views.FLOW; render(); } catch (error) { summary.textContent = error instanceof Error ? error.message : '退出失败，请重试。'; } });
  root.querySelector('#delete-account')?.addEventListener('click', async () => { if (!window.confirm('删除账户会删除全部愿望和绑定身份，确定继续吗？') || !window.confirm('请再次确认：此操作不可恢复。')) return; try {
    if (wishTestMode) { wishScenario.store.clear(); flow={state:States.IDLE}; view=Views.FLOW; render(); return; }
    await wishesService.deleteAccount();
    // A deleted server user can make a subsequent local sign-out report
    // "user not found". Deletion is already authoritative, so always clear UI.
    try { await authService.signOut({ scope: 'local' }); } catch { /* local cleanup continues after successful deletion */ }
    flow={state:States.IDLE}; view=Views.FLOW; render();
  } catch (error) { summary.textContent = error instanceof Error ? error.message : '删除账户失败，请重试。'; } });
}
function renderError() { const label = fixtureMode ? '开发测试错误状态' : productTestMode || evidenceTestMode ? `开发测试情景 · ${evidenceTest ?? productTest}` : flow.failedStage === 'evidence' ? '知乎证据未完成' : '商品搜索未完成'; shell(`<section class="error-state"><p class="eyebrow">${label}</p><h1>这一步不能继续</h1><p>${escape(flow.error ?? '发生了未分类错误。')}</p><button class="primary" data-action="home">返回首页</button></section>`); }

function handleAction(event) { event.preventDefault(); const action = event.currentTarget.dataset.action; if (action === 'home') { invalidateTasks(); view = Views.FLOW; if (fixtureMode) repository.clearFlow(); flow = fixtureMode ? repository.getFlow() : { state: States.IDLE }; render(); } if (action === 'wishes') { invalidateTasks(); view = Views.WISHES; render(); } if (action === 'products') { invalidateTasks(); view = Views.FLOW; save(States.PRODUCT_SELECTING); } if (action === 'custody') { view = Views.FLOW; save(States.CUSTODY_CONFIG); } }
async function recover(trigger = RecoveryTriggers.INITIAL_LOAD) {
  if (recoveryInFlight || fixtureMode || productTestMode) return;
  recoveryInFlight = true;
  try {
    if (wishTestMode) {
      if (trigger === RecoveryTriggers.INITIAL_LOAD) wishScenario.prepareRecovery();
    } else {
      await authService.ensureSession();
    }
    const plan = recoveryPlan({
      trigger,
      currentView: view,
      currentState: flow.state,
      currentRecordId: flow.recordId ?? flow.record?.id ?? null,
      wishes: await getTimeline(),
    });
    if (plan.action === 'replace_view') {
      view = plan.view;
      if (plan.record) flow = { state: plan.state, record: plan.record, recordId: plan.record.id };
      render();
    } else if (plan.action === 'refresh_current') {
      flow = { ...flow, state: plan.state, record: plan.record, recordId: plan.record.id };
      render();
    } else if (plan.action === 'refresh_wishes') {
      renderWishes();
    }
  } catch { /* recovery never replaces a usable view with a raw provider error */ }
  finally { recoveryInFlight = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) void recover(RecoveryTriggers.BACKGROUND_RETURN); });
window.addEventListener('pageshow', (event) => { if (event.persisted) void recover(RecoveryTriggers.BACKGROUND_RETURN); });
render(); void recover(RecoveryTriggers.INITIAL_LOAD);
