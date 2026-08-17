# 阶段 5 部署与验收记录

已实际应用的远程迁移：`20260817044635 phase5_wish_lifecycle`、`20260817045332 phase5_legacy_shape_compatibility`。`PHASE5_SCHEMA_DRAFT.sql` 保留为审计设计稿：旧愿望由 `idempotency_key is null` 兼容，新 RPC 愿望保持完整商品结构，直接 TRUNCATE 权限已撤销；不要再次把它作为迁移执行。

## 迁移与数据库

远程数据库/RPC 核心验收已完成：旧记录保留、生命周期更新、RPC 创建/列表/幂等、到期前拒绝决定、A/B 隔离和直接写权限撤销均已通过，且测试数据已清理。

## Edge Functions

已部署的 `migrate-anonymous-wishes` 维持 `verify_jwt=true`（v6，ACTIVE）。

| 函数 | 入口 | 完整本地依赖 | verify_jwt |
|---|---|---|---|
| `migrate-anonymous-wishes` | `supabase/functions/migrate-anonymous-wishes/index.ts` | 入口、`supabase/functions/_shared/http.ts` | `true`（v6，ACTIVE） |
| `delete-my-account` | `supabase/functions/delete-my-account/index.ts` | 入口、`supabase/functions/_shared/http.ts` | 未部署 |

部署时复用项目既有 Supabase 默认运行时变量与既有自定义 CORS 配置；不得在命令、日志、报告或源码中写入任何值。删除账户函数需要受控服务端权限，只允许由当前 JWT 所属用户请求删除自身账户。删除 Auth 用户不等同于立即让既有 JWT 失效；客户端成功后必须执行本地 sign-out。

## Auth、邮件与迁移验收

- 仍需普通匿名会话、已绑定邮箱会话、第二浏览器匿名会话共至少 3 个独立会话；不得用 service-role 代替用户验收。
- 验收绑定邮箱后身份归属不变、原愿望仍在；已有邮箱 OTP 使用 `shouldCreateUser:false`；不存在邮箱不被自动注册。
- 迁移只在第二浏览器确有匿名愿望时进行；分别记录成功、失败保留源数据与重试幂等。
- 真实邮件、真实迁移和真实账户删除均会产生或删除测试数据，必须由独立验收方事先确认、结束后清理。

## 保留期和 Cron

- 当前 Auth 文档确认匿名标识可通过 JWT 的 `is_anonymous` claim 区分；但 30 天清理涉及 Auth Admin 删除与 Cron 权限，需独立部署方在当前项目版本核对后再实现。
- 远程启用 `pg_cron`、创建清理函数、安排每日任务均不属于本轮；未部署前不得声称已启用 30 天清理。

## 建议顺序与停止条件

1. 保持已应用迁移不变；后续变更必须先形成新的独立审查记录。
2. 仅对尚未验收的真实 OTP、第二浏览器、正式 Pages 浏览器和真实 WebView 做独立验收。
3. Cron 与删除账户远程功能必须单独授权、部署和验收。

若 RPC 结果、RLS 越权、迁移原子性、删除账户级联或邮箱 OTP 任一项不通过，立即停止，不启用 Cron 或对外部署 Pages。回滚方式为停止部署新函数并回退该正式 migration；不要删除真实用户或历史愿望作为“修复”。
