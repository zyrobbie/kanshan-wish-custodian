import './styles.css';
import { States, transition } from './state-machine.js';
import { DemoDurations, remainingSeconds } from './timing.js';
import { abandonedTotal, displayPrice, plannedSpend } from './pricing.js';
import { FixtureRepository } from './repository.js';
import { AsyncTaskGate } from './async-task.js';
import { Views, openWishFlow } from './navigation.js';
import { ProductSearchService, normalizeClientQuery, productPriceText, safeClientUrl } from './products-service.js';
import { ProductTestService, productTestName } from './product-test-scenarios.js';

const isDevelopment = import.meta.env.DEV;
const root = document.querySelector('#app');
const fixtureMode = isDevelopment && new URLSearchParams(window.location.search).get('fixture') === '1';
const productTest = !fixtureMode && isDevelopment ? productTestName(window.location.search) : null;
const productTestMode = Boolean(productTest);
const repository = new FixtureRepository({ mode: fixtureMode ? 'development' : 'production', storage: fixtureMode ? window.sessionStorage : null });
const productService = fixtureMode ? null : productTestMode ? new ProductTestService(productTest) : new ProductSearchService({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
let flow = fixtureMode ? repository.getFlow() : { state: States.IDLE };
let timer = null;
let view = Views.FLOW;
const taskGate = new AsyncTaskGate();

const statusNames = { [States.SEALED]: '保管中', [States.EXPIRED]: '已到期待决定', [States.PURCHASE_READY]: '决定购买', [States.ABANDONED]: '已放弃', [States.ARCHIVED]: '已归档' };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const modeLabel = () => fixtureMode ? '阶段 3 · 开发测试数据' : productTestMode ? '阶段 3 · 开发测试情景' : '阶段 3 · 淘宝联盟实时候选';
const productSource = () => fixtureMode ? '开发 fixture（非淘宝实时结果）' : productTestMode ? '开发测试情景（不访问外部接口）' : '淘宝联盟实时候选';
const productSlot = '<div data-product-summary></div>';

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
    const amounts = productPriceText(product);
    price.textContent = amounts?.estimated !== null ? `销售价 ${displayPrice(amounts.sales)} · 预估到手价 ${displayPrice(amounts.estimated)}` : `销售价 ${displayPrice(amounts?.sales)}`;
  } else { price.textContent = `标价 ${displayPrice(product.listPrice)} · 销售价 ${displayPrice(product.sellingPrice)} · 预估到手价 ${displayPrice(product.estimatedPrice)}`; }
  text.append(price); summary.append(text); target.append(summary);
}
function mountProductSummary(product) { const slot = root.querySelector('[data-product-summary]'); if (slot && product) appendProductSummary(slot, product); }

function shell(content) {
  root.innerHTML = `<main class="app-shell"><header><a class="brand" href="#home" data-action="home">看山</a><span class="mode-badge">${modeLabel()}</span><button class="quiet-button" data-action="wishes">我的愿望</button></header>${content}</main>`;
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
  if (!fixtureMode && !productTestMode && !productService.configured) { root.innerHTML = `<main class="app-shell unavailable"><h1>商品服务尚未配置</h1><p>请配置公开 Supabase URL 与 publishable key 后再进行商品搜索；阶段 1 诊断仍在 <a href="diagnostic.html">诊断页</a>。</p></main>`; return; }
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
    case States.SEALED: return renderSealed(repository.getWish(flow.recordId));
    case States.EXPIRED: return renderExpired(repository.getWish(flow.recordId));
    case States.PURCHASE_READY: return renderPurchase(repository.getWish(flow.recordId));
    case States.ABANDONED: return renderAbandoned(repository.getWish(flow.recordId));
    case States.ERROR: return renderError();
    default: return renderHome();
  }
}

function renderHome() {
  const eyebrow = fixtureMode ? '开发测试数据' : productTestMode ? `开发测试情景 · ${productTest}` : '淘宝联盟实时候选';
  const description = fixtureMode ? '显式本地测试模式：不请求淘宝、知乎或转链服务。' : productTestMode ? '显式开发测试情景：不请求 Supabase、淘宝、知乎或转链服务。' : '搜索仅展示淘宝联盟返回的可推广商品；实际价格以淘宝结算页为准。';
  shell(`<section class="hero"><p class="eyebrow">${eyebrow}</p><h1>先把想买的东西，保管一会儿。</h1><p>${description}</p><form id="search-form"><label for="search-input">想找什么商品？</label><input id="search-input" name="query" maxlength="80" placeholder="例如：便携咖啡机" value="${escape(flow.query ?? '')}" /><p id="input-error" class="input-error" role="alert"></p><div class="examples"><button type="button" data-example="便携咖啡机">便携咖啡机</button><button type="button" data-example="降噪耳机">降噪耳机</button><button type="button" data-example="露营灯">露营灯</button></div><button class="primary" type="submit">交给看山看看</button></form></section>${fixtureMode ? `<section class="test-panel"><h2>开发测试开关</h2><label>证据状态 <select id="evidence-mode"><option value="both">两类证据都有</option><option value="partial">只有专业类证据</option><option value="none">没有相关证据</option><option value="error">证据加载失败</option></select></label><label>候选异常 <select id="product-mode"><option value="normal">正常候选</option><option value="broken">首张图片加载失败</option><option value="missing-promotion">首条缺少推广链接</option></select></label></section>` : ''}`);
  root.querySelector('#search-form').addEventListener('submit', (event) => { event.preventDefault(); const query = normalizeClientQuery(new FormData(event.currentTarget).get('query')); if (!query) { root.querySelector('#input-error').textContent = '请输入 2 到 80 个字符的商品名称、品牌或型号。'; return; } root.querySelector('[type="submit"]').disabled = true; flow = { state: States.IDLE, query, evidenceMode: fixtureMode ? root.querySelector('#evidence-mode').value : null, productMode: fixtureMode ? root.querySelector('#product-mode').value : null }; save(States.PRODUCT_SEARCHING); });
  root.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => { root.querySelector('#search-input').value = button.dataset.example; }));
}

function renderSearching() {
  const task = taskGate.begin();
  const query = flow.query;
  const productMode = flow.productMode;
  const copy = fixtureMode ? ['开发测试数据', '正在整理静态候选', '不会访问真实淘宝联盟接口。'] : productTestMode ? [`开发测试情景 · ${productTest}`, '正在演练商品搜索状态', '不会访问 Supabase 或淘宝联盟接口。'] : ['淘宝联盟实时候选', '正在搜索符合条件的商品', '仅展示当次返回且可推广的候选。'];
  shell(`<section class="center-state"><span class="loader" aria-hidden="true"></span><p class="eyebrow">${copy[0]}</p><h1>${copy[1]}</h1><p>${copy[2]}</p></section>`);
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
  }, 420);
}

function renderProducts() {
  const label = fixtureMode ? '开发测试数据' : productTestMode ? `开发测试情景 · ${productTest}` : '淘宝联盟实时候选';
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
      save(fixtureMode ? States.EVIDENCE_LOADING : States.PRODUCT_SELECTED, { product: selected });
    });
    card.append(choose); list.append(card);
  });
}

function renderProductSelected() { shell(`<section><p class="eyebrow">阶段 3 边界</p><h1>商品已选定；知乎证据将在阶段 4 接入。</h1>${productSlot}<p class="notice">当前仅完成淘宝联盟真实候选选择，不展示 fixture 知乎证据、不启动倒计时，也不打开推广链接。</p><button class="secondary" data-action="products">返回重选商品</button><button class="quiet-button" data-action="home">开始新的搜索</button></section>`); mountProductSummary(flow.product); }
function renderProductEmpty() { const label = fixtureMode ? '开发测试数据' : productTestMode ? `开发测试情景 · ${productTest}` : '淘宝联盟实时候选'; shell(`<section class="center-state"><p class="eyebrow">${label}</p><h1>暂未找到可展示的候选</h1><p>本次返回结果为空，或全部因字段不完整被过滤；没有自动补充候选。</p><button class="primary" data-action="home">换一个关键词</button></section>`); }

function renderEvidenceLoading() {
  const task = taskGate.begin();
  const evidenceMode = flow.evidenceMode;
  shell(`<section class="center-state"><span class="loader" aria-hidden="true"></span><p class="eyebrow">开发测试数据</p><h1>正在整理克制消费证据</h1><p>不会请求知乎或任何外部内容。</p></section>`);
  setTimeout(async () => {
    try {
      const evidence = await repository.evidence(evidenceMode);
      if (!taskIsCurrent(task, States.EVIDENCE_LOADING)) return;
      const state = evidence.expert.length && evidence.experience.length ? States.EVIDENCE_READY : States.EVIDENCE_PARTIAL;
      save(state, { evidence });
    } catch (error) {
      if (!taskIsCurrent(task, States.EVIDENCE_LOADING)) return;
      flow = { ...flow, error: error.message };
      save(States.ERROR);
    }
  }, 350);
}

function evidenceBlock(title, records, empty) { return `<section class="evidence"><h2>${title}</h2>${records.length ? records.map((item) => `<article><span class="source">${escape(item.source)}</span><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p></article>`).join('') : `<p class="empty">${empty}</p>`}</section>`; }
function renderEvidence() { const { evidence } = flow; shell(`<section><p class="eyebrow">开发测试数据 · 克制消费证据</p><h1>给决定多一点时间</h1>${productSlot}${evidenceBlock('专业 / 专家类提醒', evidence.expert, '本次未找到专业类证据。')}${evidenceBlock('真实经验类提醒', evidence.experience, '本次未找到经验类证据。')}<p class="notice">这些均是本地开发样例，不是知乎真实搜索结果。证据不足仍可继续保管，但不替你作决定。</p><div class="decision-row"><button class="primary" data-action="custody">继续设置保管时间</button><button class="secondary" data-action="products">返回重选商品</button></div></section>`); mountProductSummary(flow.product); }

function renderCustody() { shell(`<section><p class="eyebrow">开发演示时间</p><h1>这次想保管多久？</h1>${productSlot}<p>正式产品计划对应 24 / 48 / 72 小时；本阶段分别压缩为 24 / 48 / 72 秒。</p><div class="duration-list">${DemoDurations.map((seconds) => `<button class="duration" data-duration="${seconds}"><b>${seconds} 秒</b><span>对应 ${seconds} 小时</span></button>`).join('')}</div><p class="notice">封存后以绝对到期时间计算；刷新、页面恢复或后台返回时都会重新计算。</p></section>`); mountProductSummary(flow.product); root.querySelectorAll('[data-duration]').forEach((button) => button.addEventListener('click', () => { const record = repository.seal({ product: flow.product, duration: Number(button.dataset.duration), evidence: flow.evidence }); flow = repository.getFlow(); flow.recordId = record.id; render(); })); }

function renderSealed(record) { const update = () => { const synced = repository.syncExpiry(record.id); if (synced.status === States.EXPIRED) { flow = repository.getFlow(); render(); return; } const left = remainingSeconds(synced.expiresAt); const counter = root.querySelector('#countdown'); if (counter) counter.textContent = `${left} 秒`; }; shell(`<section class="sealed"><p class="eyebrow">已封存 · 开发演示</p><h1>先把它放在这里。</h1>${productSlot}<div class="countdown" id="countdown" aria-live="polite">${remainingSeconds(record.expiresAt)} 秒</div><p>封存时间：${new Date(record.createdAt).toLocaleTimeString('zh-CN')} · 预计到期：${new Date(record.expiresAt).toLocaleTimeString('zh-CN')}</p><p class="notice">当前为 sessionStorage 中的临时开发测试状态，不是正式愿望持久化。</p></section>`); mountProductSummary(record.product); update(); timer = setInterval(update, 500); }
function equalButtons() { return `<div class="decision-row equal"><button class="decision" data-decision="purchase">我还是想买</button><button class="decision" data-decision="abandon">这次不买了</button></div>`; }
function renderExpired(record) { shell(`<section><p class="eyebrow">保管时间到了</p><h1>现在，你想怎么决定？</h1>${productSlot}<p>没有默认选择；两个决定的权重相同。</p>${equalButtons()}</section>`); mountProductSummary(record.product); root.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', () => { const result = repository.decide(record.id, button.dataset.decision); flow = repository.getFlow(); flow.recordId = result.id; render(); })); }
function renderPurchase(record) { shell(`<section><p class="eyebrow">决定购买 · 开发测试占位</p><h1>保留给淘宝页面的最后确认</h1>${productSlot}<p>具体价格及优惠以淘宝结算页面为准。阶段 2 不打开真实推广链接，也不代表订单已完成。</p><a class="primary fake-link" href="#fixture-purchase" id="fixture-purchase">开发测试：模拟打开淘宝</a><p id="purchase-message" class="notice"></p><button class="secondary" data-action="wishes">查看我的愿望</button></section>`); mountProductSummary(record.product); root.querySelector('#fixture-purchase').addEventListener('click', () => { root.querySelector('#purchase-message').textContent = '开发测试占位已触发；不产生外跳或订单。'; }); }
function renderAbandoned(record) { const total = abandonedTotal(repository.list()); shell(`<section><p class="eyebrow">已放弃 · 计划支出记录</p><h1>这次先不买，也是一种决定。</h1>${productSlot}<p class="metric">本次避免的计划支出：${displayPrice(plannedSpend(record))}</p><p>当前开发测试记录累计：${displayPrice(total)}。这不是实际到账收益。</p><button class="secondary" data-action="wishes">查看我的愿望</button></section>`); mountProductSummary(record.product); }
function renderWishes() { if (!fixtureMode) { shell(`<section><p class="eyebrow">阶段 3 边界</p><h1>愿望正式持久化将在阶段 5 接入。</h1><p>当前真实商品搜索不会创建本地 fixture 愿望记录。</p><button class="primary" data-action="home">返回商品搜索</button></section>`); return; } shell(`<section><p class="eyebrow">开发测试记录</p><h1>我的愿望</h1><p>这是独立页面视图，不会修改当前愿望的生命周期。正式持久化仍由阶段 1 Supabase 链路承担。</p><button class="secondary" id="seed-history">载入五种状态样例</button><div class="filter-row"><label>筛选状态 <select id="wish-filter"><option value="all">全部</option>${Object.entries(statusNames).map(([status, name]) => `<option value="${status}">${name}</option>`).join('')}</select></label></div><div id="wish-list"></div><button class="quiet-button" data-action="home">开始新的开发测试流程</button></section>`); const list = root.querySelector('#wish-list'); const paint = () => { const selected = root.querySelector('#wish-filter').value; const rows = repository.list().filter((wish) => selected === 'all' || wish.status === selected); list.innerHTML = rows.length ? rows.map((wish) => `<article class="wish-row"><span class="status">${statusNames[wish.status] ?? wish.status}</span><strong>${escape(wish.product.title)}</strong><span>${displayPrice(wish.priceSnapshot.estimatedPrice)}</span>${wish.status === States.SEALED ? `<button class="secondary" data-open-wish="${wish.id}">恢复保管</button>` : ''}</article>`).join('') : '<p class="empty">暂无符合筛选条件的开发测试愿望。</p>'; list.querySelectorAll('[data-open-wish]').forEach((button) => button.addEventListener('click', () => { invalidateTasks(); const record = repository.syncExpiry(button.dataset.openWish); if (!record) return; flow = openWishFlow(record); repository.saveFlow(flow); view = Views.FLOW; render(); })); }; root.querySelector('#seed-history').addEventListener('click', () => { repository.seedHistory(); paint(); }); root.querySelector('#wish-filter').addEventListener('change', paint); paint(); }
function renderError() { const label = fixtureMode ? '开发测试错误状态' : productTestMode ? `开发测试情景 · ${productTest}` : '商品搜索未完成'; shell(`<section class="error-state"><p class="eyebrow">${label}</p><h1>这一步不能继续</h1><p>${escape(flow.error ?? '发生了未分类错误。')}</p><button class="primary" data-action="home">返回首页</button></section>`); }

function handleAction(event) { event.preventDefault(); const action = event.currentTarget.dataset.action; if (action === 'home') { invalidateTasks(); view = Views.FLOW; if (fixtureMode) repository.clearFlow(); flow = fixtureMode ? repository.getFlow() : { state: States.IDLE }; render(); } if (action === 'wishes') { invalidateTasks(); view = Views.WISHES; render(); } if (action === 'products') { view = Views.FLOW; save(States.PRODUCT_SELECTING); } if (action === 'custody') { view = Views.FLOW; save(States.CUSTODY_CONFIG); } }
function recover() { if (!isDevelopment || !flow.recordId) return; const record = repository.syncExpiry(flow.recordId); if (record?.status === States.EXPIRED && flow.state === States.SEALED) { flow = repository.getFlow(); render(); } else if (flow.state === States.SEALED) render(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) recover(); }); window.addEventListener('pageshow', recover); render();
