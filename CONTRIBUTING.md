# Contributing to Notavia

感谢你参与 Notavia。提交代码前请先创建 Issue，说明问题、用户价值和建议方案；小型缺陷修复可以直接提交 PR。

## 本地验证

要求 Node.js 22、pnpm 9、Go 1.26、Docker Compose。

```bash
pnpm install --frozen-lockfile
pnpm --filter web lint
pnpm --filter web build
cd apps/server && go test ./...
bash scripts/persistence_test.sh
docker compose config --quiet
```

提交信息使用 `Feat: 中文说明`、`Fix: 中文说明` 或 `Refactor: 中文说明`。PR 必须说明结果、验证命令、配置或迁移影响；界面变更附截图，API 变更附请求和响应示例。不要提交真实素材、数据库、上传文件、密钥或构建产物。

提交贡献即表示你同意按照项目的 AGPL-3.0 许可证发布该贡献。
