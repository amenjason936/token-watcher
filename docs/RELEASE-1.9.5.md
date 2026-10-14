# Token Watcher 1.9.5

本版本包含 Antigravity 名称显示调整，以及 PR [#15](https://github.com/luwill/token-watcher/pull/15) 和 [#14](https://github.com/luwill/token-watcher/pull/14) 的修复。

- **Antigravity**：移除工具名后固定的「≈」，避免真实用量也被标成估算。页面底部的 Antigravity 悬浮说明解释计量口径：优先读取真实 token 字段，旧日志缺少字段时按完整上下文和字符估算。名称调整不改变统计数值。
- **OpenCode**：大库扫描在 SQLite 内提取所需字段，逐行读取，避免完整工具输出进入 JS 堆；迭代器持有预编译语句，修复 Node 22.13 下 GC 提前释放语句造成的 `statement has been finalized`。坏 JSON 跳过、更新回看、水位和去重规则保持。
- **会话详情**：空数据或失败时清除旧图；请求序号保护渲染与清理，迟到成功、失败和 JSON 解析不会覆盖最新选择，包括同 ID 重试。无会话 ID 的行不挂点击，标题加入工具名。

验证覆盖 Node 22.13/24 完整离线回归、查询循环内强制 GC、约 100 MiB 工具输出表在 48 MiB JS 堆下扫描，以及可控迟到响应的会话回归。原问题分别在旧代码上失败，修复后通过。没有新增依赖，最低支持版本仍为 Node 22.13。

本版本不改变数据库结构或采集版本；旧 Antigravity 日志的估算性质仍保留。OpenCode 的反馈者原始堆栈没有 JS 调用帧，本地合成复现支持修复方向，不代表已在反馈者实机验收。

升级：`npm install -g token-watcher@1.9.5`。
