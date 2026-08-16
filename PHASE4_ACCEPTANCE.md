# 阶段 4 验收记录

> 记录日期：2026-08-16  
> 状态：阶段 4 本地实现完成，等待独立远程验收；阶段 5 未开始。

## 代码完成

- `zhihu-search` 每次商品选择并行执行专业、体验两次知乎站内搜索；每路 `Count=5`，无重试、无直答、无全网搜索。
- 商品标题清洗、查询生成、知乎 URL 白名单、摘要纯文本与 Unicode 截断、两层筛选/排序/去重均在共享纯函数内完成。
- 服务端只返回稳定双层卡片结构；单层失败保留另一层，双层失败返回稳定非 2xx 错误。
- 前端使用 `zhihu-service` 处理匿名会话、Functions HTTP context 与白名单错误码；不会回退 fixture。
- 页面使用 DOM API 和 `textContent` 渲染外部内容；原文链接使用 `target=_blank` 与 `rel=noopener noreferrer`，不自动打开。
- 本地 `evidenceTest` 显式测试情景仅在开发构建有效；无真实接口调用。
- 部署文件与设置见 `PHASE4_DEPLOY_MANIFEST.md`，要求 `verify_jwt=true`。

## 本地检查

- `npm test`：33/33 通过（原有 24 项持续通过）。
- `npm run check`：通过；含阶段 1/2/3/4 静态检查、源码与构建产物密钥扫描。
- `npm run build`：通过。
- `git diff --check`：通过。

## 外部与远程边界

- 真实知乎调用：0 次。
- 未部署 `zhihu-search`，未操作 Supabase 插件、远程项目、Secrets、Auth、数据库或 RLS。
- 本地知乎 CLI 未认证，不阻塞本地实现；独立验收方应使用 Supabase 插件和既有 Secret 部署并验收。
- 未调用淘宝或转链接口；未推送、合并或部署 Pages；阶段 5 未开始。

## 本地浏览器验收

- `both`：通过，专业解读与真实体验各有可点击但不自动打开的知乎原文链接。
- `expert-only`、`experience-only`、`empty`：通过，准确显示资料不足而非失败。
- `expert-error`、`experience-error`：通过，准确显示单层失败，另一层仍可见。
- `timeout`、`permission`、`invalid`：通过，显示稳定的用户友好错误。
- `html`：通过，`<em>`、脚本片段与恶意属性字符串作为普通文字显示，未执行；控制台错误为 0。
- 证据加载时进入“我的愿望”：通过，旧回调未覆盖阶段 5 边界页。
- 宽度：320、375、390、430px 及桌面 1024px 无横向溢出；这是受控桌面浏览器尺寸验证，不等同于微信或知乎真实 WebView。
