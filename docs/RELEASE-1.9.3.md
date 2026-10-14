# v1.9.3 — 每日维护循环与受审核的 OIDC 发布

增加每日 09:00（Asia/Taipei）的维护协议和 PR/Issue/CI 增量队列扫描，完整分页读取并用快照避免重复处理。循环限定每轮分诊、修复数量和重试次数；自动修复以草稿 PR 交付，合并和正式发版由维护者确认。GitHub 云端扫描只处理元数据，本机 Codex 执行判断与有限修复。

发布工作流提供 verify、draft、publish 三种模式。验证版本标签、main 祖先关系与完整 CI 后构建 macOS universal 包，测试干净安装并保存校验文件。标签推送生成 Release 草稿；明确授权后使用 npm Trusted Publisher/OIDC 与 GitHub `npm-release` 审核发布，不保存长期 npm 发布令牌。

已有草稿的安装包与 SHA256SUMS 在 npm 发布前和公开 Release 前均逐字节核对。相同产物可复用并公开，已有公开版本、附件被替换/缺失或读取失败均停止。registry 安装包必须与验证产物一致后才公开 GitHub Release。

完整隔离回归 829 项通过。此版本保留 1.9.2 的 Antigravity 逐轮真实 usage、历史补正与模型计价修复；没有新增依赖。升级：`npm install -g token-watcher@1.9.3`。

- [每日维护协议与 CI/CD](MAINTENANCE-LOOP.md)
- [Antigravity 与模型价格修复](RELEASE-1.9.2.md)
