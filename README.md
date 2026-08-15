# 看山·愿望保管员 Demo

“看山”帮助用户把购买冲动变成可回看的愿望，并在等待后由用户自己决定购买或放弃。

当前处于阶段 2：本地静态产品流程。正式页仅在本地开发模式使用明确标识的 fixture；生产构建不会把 fixture 伪装成实时搜索结果。阶段 1 身份与部署诊断保留为独立入口。

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

阶段 2 不调用淘宝、知乎或转链接口；不部署、不推送，也未进入阶段 3。
