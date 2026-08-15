import './styles.css';
import { States, transition } from './state-machine.js';
import { DemoDurations, remainingSeconds } from './timing.js';
import { abandonedTotal, displayPrice, plannedSpend } from './pricing.js';
import { FixtureRepository } from './repository.js';
import { AsyncTaskGate } from './async-task.js';
import { Views, openWishFlow } from './navigation.js';

const isDevelopment = import.meta.env.DEV;
const root = document.querySelector('#app');
const repository = new FixtureRepository({ mode: isDevelopment ? 'development' : 'production', storage: isDevelopment ? window.sessionStorage : null });
let flow = isDevelopment ? repository.getFlow() : { state: States.IDLE };
let timer = null;
let view = Views.FLOW;
const taskGate = new AsyncTaskGate();

const statusNames = { [States.SEALED]: '保管中', [States.EXPIRED]: '已到期待决定', [States.PURCHASE_READY]: '决定购买', [States.ABANDONED]: '已放弃', [States.ARCHIVED]: '已归档' };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const productSummary = (product) => `<div class="summary"><img src="${product.imageUrl}" alt="${escape(product.title)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'image-fallback',textContent:'图片加载失败'}))" /><div><strong>${escape(product.title)}</strong><p>标价 ${displayPrice(product.listPrice)} · 销售价 ${displayPrice(product.sellingPrice)} · <b>预估到手价 ${displayPrice(product.estimatedPrice)}</b></p></div></div>`;

function shell(content) {
  root.innerHTML = `<main class="app-shell"><header><a class="brand" href="#home" data-action="home">看山</a><span class="mode-badge">阶段 2 静态流程 · 开发测试数据</span><button class="quiet-button" data-action="wishes">我的愿望</button></header>${content}</main>`;
  root.querySelectorAll('[data-action]').forEach((node) => node.addEventListener('click', handleAction));
}

function save(nextState, patch = {}) {
  flow = { ...flow, ...patch, state: transition(flow.state, nextState) };
  repository.saveFlow(flow); render();
}

function invalidateTasks() { taskGate.invalidate(); }
function taskIsCurrent(token, expectedState) { return view === Views.FLOW && taskGate.isCurrent(token) && flow.state === expectedState; }

function render() {
  clearInterval(timer);
  if (!isDevelopment) { root.innerHTML = `<main class="app-shell unavailable"><h1>阶段 2 尚未接入真实数据</h1><p>正式产品页目前不会把本地 fixture 当成线上结果。请在本地开发环境使用阶段 2 静态流程；阶段 1 诊断仍在 <a href="diagnostic.html">诊断页</a>。</p></main>`; return; }
  if (view === Views.WISHES) return renderWishes();
  const record = flow.recordId ? repository.getWish(flow.recordId) : null;
  if (record && flow.state === States.SEALED) {
    const current = repository.syncExpiry(record.id);
    if (current.status === States.EXPIRED) { flow = repository.getFlow(); }
  }
  switch (flow.state) {
    case States.IDLE: return renderHome();
    case States.PRODUCT_SEARCHING: return renderSearching();
    case States.PRODUCT_SELECTING: return renderProducts();
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
  shell(`<section class="hero"><p class="eyebrow">把冲动交给看山，把决定留给自己</p><h1>先把想买的东西，保管一会儿。</h1><p>这是阶段 2 的本地开发验证：不请求淘宝、知乎或转链服务，所有候选与证据均为开发测试数据。</p><form id="search-form"><label for="search-input">想找什么商品？</label><input id="search-input" name="query" maxlength="80" placeholder="例如：便携咖啡机" value="${escape(flow.query ?? '')}" /><p id="input-error" class="input-error" role="alert"></p><div class="examples"><button type="button" data-example="便携咖啡机">便携咖啡机</button><button type="button" data-example="降噪耳机">降噪耳机</button><button type="button" data-example="露营灯">露营灯</button></div><button class="primary" type="submit">交给看山看看</button></form></section><section class="test-panel"><h2>开发测试开关</h2><label>证据状态 <select id="evidence-mode"><option value="both">两类证据都有</option><option value="partial">只有专业类证据</option><option value="none">没有相关证据</option><option value="error">证据加载失败</option></select></label><label>候选异常 <select id="product-mode"><option value="normal">正常候选</option><option value="broken">首张图片加载失败</option><option value="missing-promotion">首条缺少推广链接</option></select></label></section>`);
  root.querySelector('#search-form').addEventListener('submit', (event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get('query').trim().replace(/\s+/g, ' '); if (!query) { root.querySelector('#input-error').textContent = '请输入商品名称、品牌或型号。'; return; } flow = { state: States.IDLE, query, evidenceMode: root.querySelector('#evidence-mode').value, productMode: root.querySelector('#product-mode').value }; save(States.PRODUCT_SEARCHING); });
  root.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => { root.querySelector('#search-input').value = button.dataset.example; }));
}

function renderSearching() {
  const task = taskGate.begin();
  const query = flow.query;
  const productMode = flow.productMode;
  shell(`<section class="center-state"><span class="loader" aria-hidden="true"></span><p class="eyebrow">开发测试数据</p><h1>正在整理静态候选</h1><p>不会访问真实淘宝联盟接口。</p></section>`);
  setTimeout(async () => {
    try {
      const products = await repository.search(query, productMode);
      if (!taskIsCurrent(task, States.PRODUCT_SEARCHING)) return;
      save(States.PRODUCT_SELECTING, { products });
    } catch (error) {
      if (!taskIsCurrent(task, States.PRODUCT_SEARCHING)) return;
      flow = { ...flow, error: error.message };
      save(States.ERROR);
    }
  }, 420);
}

function renderProducts() { shell(`<section><p class="eyebrow">开发测试数据 · ${escape(flow.query)}</p><h1>从 5 件候选中选择一件</h1><p>价格字段被明确区分：标价、销售价与预估到手价。预估到手价不是最终结算价。</p><div class="products">${flow.products.map((product) => `<article class="product-card">${productSummary(product)}<p class="source">来源：开发 fixture（非淘宝实时结果）</p><button class="secondary" data-product="${product.itemId}">选择这件</button></article>`).join('')}</div><button class="quiet-button" data-action="home">重新输入</button></section>`); root.querySelectorAll('[data-product]').forEach((button) => button.addEventListener('click', () => { const product = flow.products.find((item) => item.itemId === button.dataset.product); if (!product.promotionUrl) { flow = { ...flow, error: '该开发测试候选缺少官方推广链接，不能进入保管流程。' }; save(States.ERROR); return; } save(States.EVIDENCE_LOADING, { product }); })); }

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
function renderEvidence() { const { evidence } = flow; shell(`<section><p class="eyebrow">开发测试数据 · 克制消费证据</p><h1>给决定多一点时间</h1>${productSummary(flow.product)}${evidenceBlock('专业 / 专家类提醒', evidence.expert, '本次未找到专业类证据。')}${evidenceBlock('真实经验类提醒', evidence.experience, '本次未找到经验类证据。')}<p class="notice">这些均是本地开发样例，不是知乎真实搜索结果。证据不足仍可继续保管，但不替你作决定。</p><div class="decision-row"><button class="primary" data-action="custody">继续设置保管时间</button><button class="secondary" data-action="products">返回重选商品</button></div></section>`); }

function renderCustody() { shell(`<section><p class="eyebrow">开发演示时间</p><h1>这次想保管多久？</h1>${productSummary(flow.product)}<p>正式产品计划对应 24 / 48 / 72 小时；本阶段分别压缩为 24 / 48 / 72 秒。</p><div class="duration-list">${DemoDurations.map((seconds) => `<button class="duration" data-duration="${seconds}"><b>${seconds} 秒</b><span>对应 ${seconds} 小时</span></button>`).join('')}</div><p class="notice">封存后以绝对到期时间计算；刷新、页面恢复或后台返回时都会重新计算。</p></section>`); root.querySelectorAll('[data-duration]').forEach((button) => button.addEventListener('click', () => { const record = repository.seal({ product: flow.product, duration: Number(button.dataset.duration), evidence: flow.evidence }); flow = repository.getFlow(); flow.recordId = record.id; render(); })); }

function renderSealed(record) { const update = () => { const synced = repository.syncExpiry(record.id); if (synced.status === States.EXPIRED) { flow = repository.getFlow(); render(); return; } const left = remainingSeconds(synced.expiresAt); const counter = root.querySelector('#countdown'); if (counter) counter.textContent = `${left} 秒`; }; shell(`<section class="sealed"><p class="eyebrow">已封存 · 开发演示</p><h1>先把它放在这里。</h1>${productSummary(record.product)}<div class="countdown" id="countdown" aria-live="polite">${remainingSeconds(record.expiresAt)} 秒</div><p>封存时间：${new Date(record.createdAt).toLocaleTimeString('zh-CN')} · 预计到期：${new Date(record.expiresAt).toLocaleTimeString('zh-CN')}</p><p class="notice">当前为 sessionStorage 中的临时开发测试状态，不是正式愿望持久化。</p></section>`); update(); timer = setInterval(update, 500); }
function equalButtons() { return `<div class="decision-row equal"><button class="decision" data-decision="purchase">我还是想买</button><button class="decision" data-decision="abandon">这次不买了</button></div>`; }
function renderExpired(record) { shell(`<section><p class="eyebrow">保管时间到了</p><h1>现在，你想怎么决定？</h1>${productSummary(record.product)}<p>没有默认选择；两个决定的权重相同。</p>${equalButtons()}</section>`); root.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', () => { const result = repository.decide(record.id, button.dataset.decision); flow = repository.getFlow(); flow.recordId = result.id; render(); })); }
function renderPurchase(record) { shell(`<section><p class="eyebrow">决定购买 · 开发测试占位</p><h1>保留给淘宝页面的最后确认</h1>${productSummary(record.product)}<p>具体价格及优惠以淘宝结算页面为准。阶段 2 不打开真实推广链接，也不代表订单已完成。</p><a class="primary fake-link" href="#fixture-purchase" id="fixture-purchase">开发测试：模拟打开淘宝</a><p id="purchase-message" class="notice"></p><button class="secondary" data-action="wishes">查看我的愿望</button></section>`); root.querySelector('#fixture-purchase').addEventListener('click', () => { root.querySelector('#purchase-message').textContent = '开发测试占位已触发；不产生外跳或订单。'; }); }
function renderAbandoned(record) { const total = abandonedTotal(repository.list()); shell(`<section><p class="eyebrow">已放弃 · 计划支出记录</p><h1>这次先不买，也是一种决定。</h1>${productSummary(record.product)}<p class="metric">本次避免的计划支出：${displayPrice(plannedSpend(record))}</p><p>当前开发测试记录累计：${displayPrice(total)}。这不是实际到账收益。</p><button class="secondary" data-action="wishes">查看我的愿望</button></section>`); }
function renderWishes() { shell(`<section><p class="eyebrow">开发测试记录</p><h1>我的愿望</h1><p>这是独立页面视图，不会修改当前愿望的生命周期。正式持久化仍由阶段 1 Supabase 链路承担。</p><button class="secondary" id="seed-history">载入五种状态样例</button><div class="filter-row"><label>筛选状态 <select id="wish-filter"><option value="all">全部</option>${Object.entries(statusNames).map(([status, name]) => `<option value="${status}">${name}</option>`).join('')}</select></label></div><div id="wish-list"></div><button class="quiet-button" data-action="home">开始新的开发测试流程</button></section>`); const list = root.querySelector('#wish-list'); const paint = () => { const selected = root.querySelector('#wish-filter').value; const rows = repository.list().filter((wish) => selected === 'all' || wish.status === selected); list.innerHTML = rows.length ? rows.map((wish) => `<article class="wish-row"><span class="status">${statusNames[wish.status] ?? wish.status}</span><strong>${escape(wish.product.title)}</strong><span>${displayPrice(wish.priceSnapshot.estimatedPrice)}</span>${wish.status === States.SEALED ? `<button class="secondary" data-open-wish="${wish.id}">恢复保管</button>` : ''}</article>`).join('') : '<p class="empty">暂无符合筛选条件的开发测试愿望。</p>'; list.querySelectorAll('[data-open-wish]').forEach((button) => button.addEventListener('click', () => { invalidateTasks(); const record = repository.syncExpiry(button.dataset.openWish); if (!record) return; flow = openWishFlow(record); repository.saveFlow(flow); view = Views.FLOW; render(); })); }; root.querySelector('#seed-history').addEventListener('click', () => { repository.seedHistory(); paint(); }); root.querySelector('#wish-filter').addEventListener('change', paint); paint(); }
function renderError() { shell(`<section class="error-state"><p class="eyebrow">开发测试错误状态</p><h1>这一步不能继续</h1><p>${escape(flow.error ?? '发生了未分类错误。')}</p><button class="primary" data-action="home">返回首页</button></section>`); }

function handleAction(event) { event.preventDefault(); const action = event.currentTarget.dataset.action; if (action === 'home') { invalidateTasks(); view = Views.FLOW; repository.clearFlow(); flow = repository.getFlow(); render(); } if (action === 'wishes') { invalidateTasks(); view = Views.WISHES; render(); } if (action === 'products') { view = Views.FLOW; save(States.PRODUCT_SELECTING); } if (action === 'custody') { view = Views.FLOW; save(States.CUSTODY_CONFIG); } }
function recover() { if (!isDevelopment || !flow.recordId) return; const record = repository.syncExpiry(flow.recordId); if (record?.status === States.EXPIRED && flow.state === States.SEALED) { flow = repository.getFlow(); render(); } else if (flow.state === States.SEALED) render(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) recover(); }); window.addEventListener('pageshow', recover); render();
