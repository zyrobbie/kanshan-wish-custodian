# 阶段 3 `products-search` 部署清单

> 本清单只用于独立验收方通过既有 Supabase 插件部署；不包含项目地址、项目 ID、JWT、PID 或任何 Secret 值。

## 函数与设置

- Edge Function 名称：`products-search`
- 入口：`supabase/functions/products-search/index.ts`
- 部署设置：`verify_jwt=true`
- 不安装 Supabase CLI；不要以本地 `.env` 文件、浏览器环境变量或源码内嵌值代替既有 Supabase Secrets。

## 必须一并可解析的本地文件

1. `supabase/functions/products-search/index.ts`
2. `supabase/functions/_shared/http.ts`
3. `supabase/functions/_shared/taobao-product.js`

`products-search/index.ts` 的相对导入只指向以上共享文件；部署工具必须保留该目录结构，以便解析 `../_shared/...`。

## 既有 Secrets（只核对名称）

部署前在远程项目中确认已有以下 Secret 名称；不要读取、打印、复制或记录其值：

- `TAOBAO_APP_KEY`
- `TAOBAO_APP_SECRET`
- `TAOBAO_PID`
- `TAOBAO_ADZONE_ID`
- `ALLOWED_ORIGINS`

## 部署后验收边界

- 最多进行 4 次真实商品搜索验收，先确认允许的正式来源与本地验收来源设置正确。
- 只接受服务端返回的 `ProductCard`；官方推广链接优先 `coupon_share_url`，缺失时使用 `click_url`。
- 函数日志只能记录事件类别、成功/失败、结果数量和耗时；不得记录完整推广链接、搜索词、App Secret、PID、JWT、任何凭证或淘宝原始响应。
- 不调用 `taoke-convert`，不进入阶段 4，不修改 Auth、数据库或 RLS。
