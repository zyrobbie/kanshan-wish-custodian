# 看山·愿望保管员 Demo

“看山”帮助用户把购买冲动变成可回看的愿望，并在等待后由用户自己决定购买或放弃。

阶段 3 淘联真实商品搜索已完成并冻结；阶段 4 未开始。正式页仅在本地开发 `?fixture=1` 或显式 `?productTest=...` 情景使用明确标识的测试数据；真实模式与生产构建不会回退或伪装测试数据。阶段 1 身份与部署诊断保留为独立入口。

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

阶段 3 已完成远程 `products-search` 部署、真实淘宝接口和本地真实模式浏览器验收；冻结代码基线为 `8908331`。未调用知乎或转链接口，未部署 GitHub Pages、未推送、未合并，也未进入阶段 4。
