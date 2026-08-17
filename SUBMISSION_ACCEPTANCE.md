# 交稿版 Release Candidate 验收记录

> 状态：本地发布前收口已完成，等待项目负责人授权正式发布。本报告不是阶段 7/8 完成声明，也不替代公网、真实 WebView 或真实邮箱验收。

## 冻结视觉与代码完成

- 首页最终视觉基线为 `fa8798a`（`fix: preserve approved homepage artwork`）。`public/assets/kanshan-home/home-reference-original.png` 的 SHA-256 为 `71954e1c57623fba2ac25e18862513a255d7bf04296d9136ad19427d17fca545`。
- 首页仍直接使用该定稿图；只保留既有真实输入、提交、愿望入口与局部遮罩覆盖层，没有重新设计、拆图或新增首页统计、字符计数、营销文案和动画。
- 正式页已移除面向测试者的阶段号、研发术语和可交互的未验收邮箱操作；本地测试 URL 仍明确显示“开发测试”。
- 购物卡、愿望状态、金额统计与链接安全边界保持不变：只使用愿望快照中的安全官方推广链接，不重搜、不转链、不自动外跳。
- GitHub Pages 工作流名称已更新为正式产品名称；构建时固定使用 `/kanshan-wish-custodian/` 子路径，公开 Supabase 配置仍只从 GitHub Environment Variables 注入。

## 静态检查

- `npm test`：56/56 通过。
- `npm run check`：通过，包括阶段 1–6 静态控制、测试、构建和构建产物扫描。
- `npm run build`：通过。
- `VITE_BASE_PATH=/kanshan-wish-custodian/ npm run build`：通过；构建产物使用该子路径，未发现错误的根路径首页资源引用。
- `git diff --check`：通过。
- 源码与构建产物密钥扫描：均通过；未发现 Secret、App Secret、service-role、SMTP 密码或 Access Secret。

## 外部接口验证

N/A。本轮未调用淘宝、知乎、转链接、邮件或 Supabase 接口。

## 浏览器验证

仅在本地 Vite 的明确开发测试情景中完成；不代表公网通过：

- 首页空输入：显示可恢复校验提示；正常输入进入候选页；“我的愿望”入口可点击。
- 购买：购物卡显示保存的链接，`href` 与快照一致；未打开外部淘宝页面。
- 无效链接：不生成外跳按钮，保留诚实提示和返回入口。
- 放弃：显示本次与累计计划支出；购买意向不计入放弃累计。
- 刷新恢复：完整 reload 前后 `expiresAt` 相同，倒计时由 72 秒继续至 71 秒。
- 图片失败：显示安全占位，不阻断流程。
- 320、375、390、430px：无横向溢出；320px 首页输入框高度为 44px。
- 控制台：上述流程未处理错误为 0。

## 生产构建验证

- 生产构建不自动启用 fixture 或开发测试面板。
- 首页定稿图通过 `import.meta.env.BASE_URL` 解析，适配 GitHub Pages 项目子路径。
- 未进行 GitHub Pages 公网部署或正式来源浏览器验证。

## 尚未执行的公网验证与延期项

- GitHub Pages 正式来源完整浏览器流程与公网实时接口回归。
- 真实邮箱 OTP、匿名愿望跨浏览器找回、微信/知乎真实 WebView 和完整 iOS/Android 浏览器矩阵。
- 30 天匿名清理、删除账户远程功能、运营后台、年度账单、复杂动画和完整无障碍审计。
- 阶段 7/8 未开始。

## 发布前授权

在项目负责人单独授权前，不得推送、合并 `main`、触发 GitHub Pages 部署、修改 Supabase、Secrets、数据库、RLS、迁移或 Edge Functions。
