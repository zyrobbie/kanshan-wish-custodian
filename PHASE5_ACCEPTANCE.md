# 阶段 5 验收记录

> 状态：阶段 5 本地返工完成，远程数据库/Auth/OTP 验收仍未执行；阶段 6 未开始。此前“本地返工完成”的记录曾在本轮复验前暂时恢复为“进行中”，以下证据为本轮复验结果。

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
- SQL 草案使用空 `search_path` 与完全限定的 `public` 对象；推广 URL、金额转换/上限、锁后幂等查询和函数默认 `PUBLIC` 权限均已收紧。该文件仍不是正式 migration。
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

未执行远程验证。`PHASE5_SCHEMA_DRAFT.sql` 提供普通 A/B 用户会话的 RLS 验收设计，增加 `s.click.taobao.com`、`detail.tmall.com`、`e.tb.cn` 通过和伪域名、HTTP、userinfo、控制字符拒绝向量；金额要求可转换为 `numeric(12,2)`、非负且不溢出。因 Supabase CLI 未安装，尚未生成正式 migration 文件，不能宣布阶段 5 整体完成。

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
- [Database functions](https://supabase.com/docs/guides/database/functions)：`SECURITY DEFINER` 使用空 `search_path`、完整 schema 限定，且显式撤销默认 `PUBLIC` 执行权限。
- [Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout)：删除账户前尝试全局撤销刷新会话。
- [Sessions](https://supabase.com/docs/guides/auth/sessions)：访问 JWT 在自身过期前仍可能验证；远程验收必须实际确认删除后不可读取、创建或迁移愿望。
