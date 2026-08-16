# 阶段 4 部署清单：知乎双层内容

状态：仅供独立验收方部署前核对；本地实现完成，尚未部署或调用真实知乎接口。

## Edge Function

- 函数名：`zhihu-search`
- 入口：`supabase/functions/zhihu-search/index.ts`
- 部署设置：`verify_jwt=true`
- 已有 Secrets：`ZHIHU_ACCESS_SECRET`、`ALLOWED_ORIGINS`。部署者只能使用既有值，不读取、打印或写入其值。

## 必须随函数部署的完整本地文件集合

1. `supabase/functions/zhihu-search/index.ts`
2. `supabase/functions/_shared/http.ts`
3. `supabase/functions/_shared/zhihu-evidence.js`

所有导入均为上述目录内的相对路径；无 npm 依赖、无其他本地运行时文件。

## 独立远程验收边界

- 最多验证 3 类商品；每类恰好 2 次知乎站内搜索（专业、体验各一次）。
- 仅调用知乎站内搜索；不调用直答、全网搜索、本人数据接口或淘宝/转链接口。
- 保持 `verify_jwt=true`、既有精确 `ALLOWED_ORIGINS` 与现有 Supabase 配置。
- 不修改数据库、Auth、RLS、Secrets 或其他函数。
- 日志不得记录商品标题、查询词、知乎原文/摘要/链接、Access Secret、JWT 或用户标识。
