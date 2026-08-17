# 阶段 5 验收记录

> 状态：阶段 5 数据库/RPC 核心远程验收已通过；真实 OTP、正式 Pages 浏览器流程、WebView、Cron 与删除账户远程功能仍未验收。阶段 6 尚未在本提交中开始。

## 代码完成

- 新增共享愿望领域模型：受控时长、商品快照、绝对到期、状态分组、分页、实时统计与一次性放弃金额。
- 新增集中 Auth 服务：匿名会话初始化去重、匿名邮箱绑定、已有保管箱 OTP（固定 `shouldCreateUser:false`）与退出设备。
- 首次访问的 `AuthSessionMissingError` 现在视为正常无会话状态，继续创建匿名身份；已有匿名会话和已绑定邮箱会话会复用。
- 新增正式 RPC 服务：创建、列表、决定、删除、清空与匿名迁移调用；浏览器不提交 `owner_id`、任意到期时间或决定金额。
- SQL 设计稿撤销浏览器对 `wishes` 的直接 INSERT/UPDATE/DELETE，改为固定 `search_path`、`auth.uid()` 校验、锁后幂等查询的受控 RPC；列表返回 `items`、`nextOffset`、`hasMore` 和全量 `summary`。
- 新增本地 `delete-my-account` Edge Function；未部署、未调用。
- 开发测试参数 `wishTest` 只在 Vite 开发构建中被识别，明确显示“阶段 5 开发测试情景”，不调用 Supabase、邮件、淘宝、知乎或转链接口。
- 正式恢复不再依赖刷新前内存中的 `flow.recordId`：身份初始化后读取服务端完整愿望列表；单条活动愿望恢复对应页面，多条活动愿望打开“我的愿望”，并沿用服务端原 `expiresAt`。
- 恢复导航现已区分完整加载与后台返回：完整加载按服务端活动愿望数量恢复单条或打开列表；后台返回只刷新已打开的保管/决定愿望或愿望列表。首页、商品搜索、候选选择、知乎证据和新愿望配置流程均保持当前视图，不会被旧愿望覆盖。
- `wishTest` 改为真实本地行为驱动器：幂等创建、决定竞争、删除、清空、绑定、已有邮箱登录、迁移及失败、OTP 稳定错误和两次确认删除账户均修改本地存储或 Auth stub，再显示结果。
- SQL 草案保留为后续审计参考：旧阶段 1 愿望以 `idempotency_key is null` 兼容较小快照；新阶段 5 RPC 愿望仍强制完整商品结构；直接 `TRUNCATE` 权限已撤销。
- 匿名迁移函数本地代码要求源身份为匿名、目标为不同且已验证邮箱的非匿名身份；日志只输出稳定事件、数量和错误码。
- 账户删除函数先尝试全局撤销刷新会话再删除账户。浏览器端在服务端删除成功后即使本地退出报告用户不存在也会清理本地页面状态；这不表示访问 JWT 立即失效。

## 静态检查

- `npm test`：52/52 通过。
- `npm run check`：通过（含密钥扫描、52 项单元测试、阶段 1–5 静态基线、生产构建和构建产物扫描）。
- `npm run build`：通过；生产构建不含 `wishTest` 的 Vite 开发分支。
- `git diff --check`：通过。

## 外部接口验证

N/A。本轮真实淘宝、知乎、转链、Supabase 远程数据库、Auth、邮件与 Edge Function 调用均为 0 次。

## 浏览器验证

本地 Vite 受控浏览器已逐项运行本轮行为型 `wishTest`：同键创建仅 1 条且 ID 相同；竞争决定保留第一次；清空仅保留活动愿望；单条删除数量下降；绑定保持 owner ID；已有邮箱固定 `shouldCreateUser:false`；迁移显示迁入 2 条、重跑 0 条；迁移失败源/目标数量保持；三类 OTP 均显示可重试稳定错误；删除账户必须两次本地确认后清空身份与愿望。分页从 20 条加载至 22 条通过。`refresh-restore` 完整 reload 前后读取到相同 `expiresAt`，并保持绝对到期时间；搜索第二件商品时触发本地“模拟后台返回”控制，页面先保持搜索中、随后自然进入第二件商品候选页，未恢复旧愿望。320/375/390/430px 均无横向溢出，控制台未处理错误为 0。上述仅是本地开发情景，不代表真实 Supabase、SMTP、跨浏览器或 WebView 验收。

## 数据库 / RLS 验证

已实际应用 `20260817044635 phase5_wish_lifecycle` 与 `20260817045332 phase5_legacy_shape_compatibility`。远程核心验收通过：原有 9 条阶段 1 愿望完整保留且可更新生命周期；RPC 创建、列表、幂等及到期前禁止决定均通过；普通 A/B 用户会话的跨账户读取、删除隔离通过；`anon` / `authenticated` 对 `wishes` 只保留 SELECT，INSERT、UPDATE、DELETE、TRUNCATE 均已撤销；验收测试愿望已清理。`PHASE5_SCHEMA_DRAFT.sql` 仍是本地审计设计稿，不应被当作需要再次执行的远程迁移。

`migrate-anonymous-wishes` v6 已部署且 ACTIVE，`verify_jwt=true`。本记录不将其部署状态等同于真实 OTP、跨浏览器迁移矩阵或 WebView 全流程通过。

## 邮件与跨浏览器验证

未执行真实 OTP、邮箱绑定、匿名迁移、跨浏览器或真实 WebView；等待独立验收。

## 延期项

- 真实邮箱 OTP、正式 GitHub Pages 来源上的完整浏览器流程、跨浏览器身份恢复以及微信/知乎真实 WebView 尚未验收。
- 30 天匿名用户清理 Cron 尚未启用。
- 删除账户远程功能尚未部署或验收；不得将本地 Edge Function 代码描述为远程能力。

## 本轮查阅的官方文档

- [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)：已有邮箱 OTP 使用 `shouldCreateUser:false`。
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：普通用户会话验收 UPDATE 的 `USING` 与 `WITH CHECK`。
- [Cron](https://supabase.com/docs/guides/cron)：30 天匿名账户清理须在独立部署时重新审查。
- [Supabase changelog](https://supabase.com/changelog?types=breaking-change)：部署方须在远程验收前再次核对破坏性变更。
- [Database functions](https://supabase.com/docs/guides/database/functions)：`SECURITY DEFINER` 使用空 `search_path`、完整 schema 限定，且显式撤销默认 `PUBLIC` 执行权限。
- [Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout)：删除账户前尝试全局撤销刷新会话。
- [Sessions](https://supabase.com/docs/guides/auth/sessions)：访问 JWT 在自身过期前仍可能验证；远程验收必须实际确认删除后不可读取、创建或迁移愿望。
