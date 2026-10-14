# v1.9.4 — 本地 Cowork 用量与 Windows 扩展目录修复

接入已验证的 Claude Desktop 本地 Cowork transcript/audit 日志，自动发现 macOS、Windows Roaming 与已安装 Claude MSIX 的数据目录。只扫描 agent/local_ditto 下的标准 transcript 和 audit，剪枝输出/插件目录；用量并入现有 Claude Code 工具项。

两种格式按同一消息 ID 去重，标准 transcript 优先于 audit 回退值。同优先级保留更完整的流式用量，来源优先级持久化，重复扫描、镜像与数据库重开不重复统计。仅迁移重扫时实际观察到的旧键；旧键合并、删除和游标提交保持同一事务，失败回滚，保留缺源历史。ccmr 保持既有去重与输出补齐规则。

修复 Windows 扩展目录校验：CLI 与配置加载共用宿主平台的绝对路径判断，支持盘符、UNC、`~/` 和 Windows `~\`，拒绝普通相对路径及 `C:relative`。

30 项定向检查、863 项完整隔离回归通过；历史 Cowork 样本逐字段核对及正反扫描、重复重放均无双计。没有新增依赖。Windows 路径有模拟与跨平台测试夹具，反馈者客户端版本未知，不能认定全部 Desktop 模式已覆盖。

普通 Chat、未镜像的云端会话和未经验证的新日志结构仍无精确明细采集；`result.modelUsage` 汇总不与逐消息 usage 相加，不能据此保证恢复全部 Cowork 模型费用。

升级：`npm install -g token-watcher@1.9.4`。启动前先做一致的 SQLite 备份并停止旧采集进程；v3 首次扫描会重扫可访问的 Claude 历史并迁移旧键。缺失的源日志不能凭空恢复。

- [覆盖范围、验证与部署说明](CLAUDE-DESKTOP-AUDIT-2026-10-14.md)
