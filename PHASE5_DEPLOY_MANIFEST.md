# 阶段 5 部署清单（仅供独立验收方执行）

本轮未执行任何远程部署、迁移、Secret 读取或远程测试。Supabase CLI 当前未安装，因此 `PHASE5_SCHEMA_DRAFT.sql` 是待审查设计稿，不是已生成的正式 migration。

## 迁移与数据库

1. 独立部署方先运行 `supabase migration new phase5_wish_lifecycle`。
2. 审查后将 `PHASE5_SCHEMA_DRAFT.sql` 迁入 CLI 新生成的 migration 文件；不要直接把设计稿当成迁移历史。
3. 部署前核对 public Data API 暴露与 `authenticated` 权限；所有业务表必须保持 RLS 强制启用。
4. 审查并执行 RPC：`create_custody_wish`、`list_my_custody_wishes`、`decide_custody_wish`、`delete_my_custody_wish`、`clear_my_custody_wishes`。
5. 对普通用户 A/B 会话验收 RLS：越权读取、更新、删除均应为零记录；UPDATE 同时检验 `USING` 与 `WITH CHECK`。

## Edge Functions

| 函数 | 入口 | 完整本地依赖 | verify_jwt |
|---|---|---|---|
| `delete-my-account` | `supabase/functions/delete-my-account/index.ts` | 入口、`supabase/functions/_shared/http.ts` | `true` |
| `migrate-anonymous-wishes` | `supabase/functions/migrate-anonymous-wishes/index.ts` | 入口、`supabase/functions/_shared/http.ts` | `true` |

部署时复用项目既有 Supabase 默认运行时变量与既有自定义 CORS 配置；不得在命令、日志、报告或源码中写入任何值。删除账户函数需要受控服务端权限，只允许由当前 JWT 所属用户请求删除自身账户。

## Auth、邮件与迁移验收

- 需普通匿名会话、已绑定邮箱会话、第二浏览器匿名会话共至少 3 个独立会话；不得用 service-role 代替用户验收。
- 验收绑定邮箱后身份归属不变、原愿望仍在；已有邮箱 OTP 使用 `shouldCreateUser:false`；不存在邮箱不被自动注册。
- 迁移只在第二浏览器确有匿名愿望时进行；分别记录成功、失败保留源数据与重试幂等。
- 真实邮件、真实迁移和真实账户删除均会产生或删除测试数据，必须由独立验收方事先确认、结束后清理。

## 保留期和 Cron

- 当前 Auth 文档确认匿名标识可通过 JWT 的 `is_anonymous` claim 区分；但 30 天清理涉及 Auth Admin 删除与 Cron 权限，需独立部署方在当前项目版本核对后再实现。
- 远程启用 `pg_cron`、创建清理函数、安排每日任务均不属于本轮；未部署前不得声称已启用 30 天清理。

## 建议顺序与停止条件

1. 生成并审查正式 migration；执行 SQL 语法、安全与 RLS 审计。
2. 部署上述两项函数并确认 `verify_jwt=true`、CORS 仅允许既有来源。
3. 用普通用户会话完成创建上限、幂等创建、到期、并发决定、统计、删除、绑定与迁移验收。
4. 最后单独核对 SMTP OTP、第二浏览器和真实 WebView。

若 RPC 结果、RLS 越权、迁移原子性、删除账户级联或邮箱 OTP 任一项不通过，立即停止，不启用 Cron 或对外部署 Pages。回滚方式为停止部署新函数并回退该正式 migration；不要删除真实用户或历史愿望作为“修复”。
