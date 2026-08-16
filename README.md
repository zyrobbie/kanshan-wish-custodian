# 看山·愿望保管员 Demo

“看山”帮助用户把购买冲动变成可回看的愿望，并在等待后由用户自己决定购买或放弃。

阶段 4 知乎双层内容已通过远程接口与本地真实模式浏览器验收并冻结；阶段 5 已完成本地返工复验（服务端恢复设计、行为型本地 wishTest、SQL 权限草案与账户删除边界），正式 migration 与远程验收仍待独立执行，阶段 6 未开始。正式页仅在本地开发 `?fixture=1`、显式 `?productTest=success&evidenceTest=...` 或 `?wishTest=...` 情景使用明确标识的测试数据；真实模式与生产构建不会回退或伪装测试数据。阶段 1 身份与部署诊断保留为独立入口。

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
- [阶段 3 验收](PHASE3_ACCEPTANCE.md)
- [阶段 4 验收](PHASE4_ACCEPTANCE.md)

阶段 3 冻结代码基线为 `8908331`。阶段 4 冻结代码基线为 `07b6a4d`，远程 `zhihu-search`、三类商品真实双层接口与一条本地真实模式浏览器完整流程均已通过。阶段 5 本地代码与 SQL 设计稿见 `PHASE5_ACCEPTANCE.md`、`PHASE5_DEPLOY_MANIFEST.md`；未部署 GitHub Pages、未推送、未合并，也未进入阶段 6。
