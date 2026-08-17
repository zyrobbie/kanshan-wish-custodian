# 看山·愿望寄存处 Demo

“看山”帮助用户把购买冲动变成可回看的愿望，并在等待后由用户自己决定购买或放弃。

阶段 4 知乎双层内容已通过远程接口与本地真实模式浏览器验收并冻结；阶段 5 的数据库核心远程验收已通过，`migrate-anonymous-wishes` v6 已部署；阶段 6 已完成本地购物卡与提交版视觉，购物卡只使用创建愿望时保存的官方推广链接且不会自动外跳。本分支当前为交稿版 Release Candidate：首页最终视觉基线为 `fa8798a`，本地检查和生产子路径构建均已完成，等待项目负责人授权发布。真实邮箱 OTP、正式 Pages 浏览器流程、WebView、Cron 与删除账户远程功能仍待独立验收，阶段 7/8 未开始。正式页仅在本地开发 `?fixture=1`、显式 `?productTest=success&evidenceTest=...` 或 `?wishTest=...` 情景使用明确标识的测试数据；真实模式与生产构建不会回退或伪装测试数据。阶段 1 身份与部署诊断保留为独立入口。

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
- [阶段 5 验收](PHASE5_ACCEPTANCE.md)
- [阶段 6 验收](PHASE6_ACCEPTANCE.md)
- [交稿版验收](SUBMISSION_ACCEPTANCE.md)

阶段 3 冻结代码基线为 `8908331`。阶段 4 冻结代码基线为 `07b6a4d`，远程 `zhihu-search`、三类商品真实双层接口与一条本地真实模式浏览器完整流程均已通过。阶段 5 的最新远程事实见 `PHASE5_ACCEPTANCE.md`、`PHASE5_DEPLOY_MANIFEST.md`；阶段 6 与本次交稿版验收分别见 `PHASE6_ACCEPTANCE.md`、`SUBMISSION_ACCEPTANCE.md`。未部署 GitHub Pages、未推送、未合并，也未进入阶段 7/8。
