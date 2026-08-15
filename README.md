# 看山·愿望保管员 Demo

“看山”帮助用户把购买冲动变成可回看的愿望，并在等待后由用户自己决定购买或放弃。

阶段 3 淘联真实商品搜索已完成本地实现，等待独立验收；阶段 4 未开始。正式页仅在本地开发 `?fixture=1` 显式模式使用明确标识的 fixture；真实模式与生产构建不会回退或伪装 fixture。阶段 1 身份与部署诊断保留为独立入口。

```bash
npm run dev
npm test
npm run check
npm run build
```

- 正式产品页：`/`
- 阶段 1 诊断页：`/diagnostic.html`
- [规格书](PROJECT_SPEC.md)
- [交接文档](PROJECT_HANDOFF.md)
- [阶段 1 验收](PHASE1_ACCEPTANCE.md)
- [阶段 2 验收](PHASE2_ACCEPTANCE.md)

阶段 3 不调用知乎或转链接口；不部署 GitHub Pages、不推送、不合并，也未进入阶段 4。真实 `products-search` 函数部署与淘联接口验收仍待既有 Supabase CLI 可用。
