# 阶段 5 验收记录

> 状态：阶段 5 本地返工完成，远程数据库/Auth/OTP 验收仍未执行；阶段 6 未开始。

## 代码完成

- 新增共享愿望领域模型：受控时长、商品快照、绝对到期、状态分组、分页、实时统计与一次性放弃金额。
- 新增集中 Auth 服务：匿名会话初始化去重、匿名邮箱绑定、已有保管箱 OTP（固定 `shouldCreateUser:false`）与退出设备。
- 首次访问的 `AuthSessionMissingError` 现在视为正常无会话状态，继续创建匿名身份；已有匿名会话和已绑定邮箱会话会复用。
- 新增正式 RPC 服务：创建、列表、决定、删除、清空与匿名迁移调用；浏览器不提交 `owner_id`、任意到期时间或决定金额。
- SQL 设计稿撤销浏览器对 `wishes` 的直接 INSERT/UPDATE/DELETE，改为固定 `search_path`、`auth.uid()` 校验、锁后幂等查询的受控 RPC；列表返回 `items`、`nextOffset`、`hasMore` 和全量 `summary`。
- 新增本地 `delete-my-account` Edge Function；未部署、未调用。
- 开发测试参数 `wishTest` 只在 Vite 开发构建中被识别，明确显示“阶段 5 开发测试情景”，不调用 Supabase、邮件、淘宝、知乎或转链接口。

## 静态检查

- `npm test`：47/47 通过。
- `npm run check`：通过（含密钥扫描、47 项单元测试、阶段 1–5 静态基线、生产构建和构建产物扫描）。
- `npm run build`：通过；生产构建不含 `wishTest` 的 Vite 开发分支。
- `git diff --check`：通过。

## 外部接口验证

N/A。本轮真实淘宝、知乎、转链、Supabase 远程数据库、Auth、邮件与 Edge Function 调用均为 0 次。

## 浏览器验证

本地 Vite 受控浏览器已逐项打开 20 个 `wishTest` 场景，均未请求外部服务且控制台错误为 0；分页从 20 条加载至 22 条通过。创建、封存与“到期后购买”操作已验证；四个宽度 320/375/390/430px 均无横向溢出。`refresh-restore` 在开发模式仅用 `sessionStorage` 固定非敏感测试时钟，重复加载保留相同 `expiresAt`；正式模式不使用该存储，而是从服务端活动愿望恢复绝对到期。上述仅是本地开发情景，不代表真实 Supabase、SMTP、跨浏览器或 WebView 验收。

## 数据库 / RLS 验证

未执行远程验证。`PHASE5_SCHEMA_DRAFT.sql` 提供普通 A/B 用户会话的 RLS 验收设计；因 Supabase CLI 未安装，尚未生成正式 migration 文件，不能宣布阶段 5 整体完成。

## 邮件与跨浏览器验证

未执行真实 OTP、邮箱绑定、匿名迁移、跨浏览器或真实 WebView；等待独立验收。

## 阻塞项

- Supabase CLI 缺失：正式 `phase5_wish_lifecycle` migration 尚未生成。
- 未获远程变更授权：RPC、RLS、函数、Cron、SMTP、Auth 和测试数据均未操作。
- 30 天匿名用户清理保留为部署设计，尚未启用 Cron 或执行用户删除。

## 本轮查阅的官方文档

- [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)：已有邮箱 OTP 使用 `shouldCreateUser:false`。
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：普通用户会话验收 UPDATE 的 `USING` 与 `WITH CHECK`。
- [Cron](https://supabase.com/docs/guides/cron)：30 天匿名账户清理须在独立部署时重新审查。
- [Supabase changelog](https://supabase.com/changelog?types=breaking-change)：部署方须在远程验收前再次核对破坏性变更。
