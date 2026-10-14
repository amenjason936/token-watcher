# Claude Desktop 用量覆盖调查（2026-10-14）

## 结论与边界

反馈涉及 Windows 上的 Chat、Code、Cowork 三种模式。用户补充说明版本不明、暂时无法询问；此前提供的 `1.8.2` 未确认指哪个软件，Claude Desktop 版本和 Code 执行位置均按未知处理，不等待补询。本次将 token-watcher 1.8.2 作为发布版本对照，不将其当成反馈者已确认安装的版本。

已下载 npm 实际发布的 token-watcher 1.8.2，并核对源码与其 gitHead；该版本和已发布 1.9.3 的 Claude 采集器完全相同，默认 root 都只有 `~/.claude/projects`，没有完整 Desktop 接入。**仅升级到已发布 1.9.3 不能补齐三种模式。**本次修复纳入 1.9.4，不能将其等同于 registry 的 1.9.3 安装包。

已复现历史 macOS Cowork 的漏扫与 audit 格式问题，也发现当前扩展目录功能对 Windows 绝对路径的校验错误。普通 Chat 在获准检查的本机存储副本中未找到可用的精确 token 记录。Windows 用户的 Code 是否也因目录、远端执行或具体日志格式漏采，还需要该用户的日志结构证据；不能将本机旧 Cowork 的原因当成三种模式的共同原因。

| 模式 | 调查对象发布包的覆盖 | 本次证据与限制 |
|---|---|---|
| Claude Code CLI，或 Desktop Code 写到已配置目录的本机会话 | 可统计标准 transcript | `src/config.js` 默认只有 `~/.claude/projects`；自定义 CLAUDE_CONFIG_DIR 须另登记 |
| Desktop Code 的 Cloud/SSH/WSL 会话 | 不自动统计未镜像到本机的远端日志 | 官方区分本机、云端和远端环境；需要实际日志位置/同步策略验证 |
| 历史本地 Cowork / local-agent | 默认漏扫 | 已找到 Desktop 数据目录内标准 transcript 与 audit，两者均不在生效扫描 roots 中 |
| 普通 Chat，及逐步上线的 Chat/Cowork 合并云端体验 | 没有已验证的精确 token 明细采集源 | 获准检查的 IndexedDB/Local Storage 副本未发现常见逐请求 token 字段；本机样本不能代替 Windows 实机或云端数据验证 |

Claude 各产品同一账号共享订阅用量限额，见 [官方用量限制](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)。本项目的官方 Claude 配额卡复用 Claude Code OAuth，显示窗口百分比；它不生成 Chat/Desktop 的 token 事件或按天费用。Desktop-only 用户没有该凭证时会跳过配额轮询。百分比不能直接换算为精确 token 或费用。

## 1.9.4 修复实现

- `claude-code` 采集版本升至 v3，增加 macOS Cowork 数据目录、Windows Roaming 与已安装 Claude MSIX 包的数据目录。只收已验证的 `agent/local_ditto_*/audit.jsonl` 与其 `.claude/projects/**` transcript；遍历时剪枝 outputs、插件和其他目录。Cowork 用量显示在现有 Claude Code 工具项。
- audit 识别 `_audit_timestamp` 与 `session_id`，没有会话身份的 audit 行不会入账。普通 Chat、云端未镜像日志和未经确认的新 Cowork 结构仍不在本轮支持范围内。
- 官方 Claude 消息共用 `claude-code:message:<message.id>` 去重键，不依赖 audit 缺少的 requestId。标准 transcript 优先于 audit，即使其输出小于 audit；同优先级保留更完整输出和输入，来源优先级写入 usage_quality，重开数据库后仍保持。工具调用继续按调用 ID 去重。ccmr 保留原去重和流式补齐规则。
- 只合并本次重扫确实观察到的消息旧键，保留来源文件已消失、其他消息及其他工具的历史。合并、删除旧别名与保存游标由 Scanner 的同一文件事务提交；解析或保存失败全部回滚。重复扫描没有有效变更时不触发面板更新。
- CLI 与配置加载共用宿主平台的绝对路径归一：支持 Windows 盘符、UNC、`~/` 和 Windows `~\`，拒绝相对路径及 `C:relative`。不新增依赖。
- `result.modelUsage` 的累计区间和额外模型覆盖仍未验证，未与逐消息 usage 相加，不能声称已经恢复全部 Cowork 模型费用。

验证：macOS、Node 24.14.0 下，30 项定向检查和 863 项完整隔离回归全部通过。覆盖两种日志单独/共存、正反扫描、镜像和缺 requestId、晚到输出/输入、半行续写、重开后来源优先级、旧键合并、保留缺源历史、源文件删除及事务失败重试。Windows 盘符/UNC/MSIX 的路径检查使用 win32 模拟与跨平台夹具；CLI/config 集成在本机宿主运行，未获得反馈者 Windows 实机结果。

历史实数验证仍限定于 2026-03-25、CLI 2.1.78 的样本。新解析器只读日志至内存，独立按原始 usage 逐字段核对；两份日志合并、反向扫描及重复重放均得到 113 个唯一消息和 117 个唯一工具调用，所有 input/cache/output/total 字段一致。没有将真实会话写入测试库，公开报告不包含其 token 合计或私人正文。

升级到 1.9.4 后，首次扫描会因 v3 重扫仍可访问的 Claude 历史并合并旧键。部署和正式回填前应先做一致的 SQLite 备份，再停止旧采集进程、安装修复版本并启动，避免两套采集器并发写库。没有可读取日志的历史无法凭空恢复。本机全局安装、正式服务和用量库不在本次 1.9.4 发布范围内。

## 可复现的本地发现

本机证据是 2026-03-25、Claude Code 2.1.78、entrypoint=`local-agent` 的旧会话，不能代替最新版客户端或其他用户的验证。正式 `/Applications/Claude.app` 与 ASAR 未找到，因此本次未完成 REA 的现行客户端静态分析；采用已有日志、仓库源码及官方文档核对。

macOS 的历史本地入口：

```text
~/Library/Application Support/Claude/local-agent-mode-sessions/
  .../.claude/projects/.../<session>.jsonl
  .../audit.jsonl
```

- 标准 transcript 含 `type=assistant`、`timestamp`、`message.id/model/usage`，真实 input/cache read/cache creation/output 字段能由现有 `collectClaudeFile` 解析。默认源 roots 没有这个 Desktop 目录，因此不会被 Scanner 枚举。
- audit 的 assistant 记录含 `_audit_timestamp`、`session_id`，没有解析器要求的 `timestamp`，也缺少标准 transcript 中的 `requestId`。直接喂给现有解析器会跳过全部 assistant usage。
- 直接调用现有解析器，把结果放入内存 sink；标准 transcript 的输出与独立按消息 ID 合并流式分片的结果一致，audit 发出零条事件。验证不打开、不写入任何真实数据库。
- 两份日志共享消息与会话 ID，部分 `output_tokens` 不一致。若给 audit 补时间字段后仍沿用 `msg.id + requestId`，audit 缺少 requestId 会造成与标准 transcript 不同的去重键，存在双计风险。
- audit 的 `result.modelUsage` 还包含 assistant transcript 中没有出现的模型用量。结果汇总不能与逐请求记录直接相加；目前不能声称只添加标准 transcript 就覆盖全部 Cowork 模型费用。
- `plan-usage-history.json` 仅观察到 `version`、`samples[].t/org/u` 与缩写用量项，没有逐消息 input/output/cache/model 字段。缩写语义未独立验证，不能据此填充精确 token。

官方 [会话存储说明](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored)确认默认 CLI transcript 路径与 CLAUDE_CONFIG_DIR 可迁移，且内部格式会随版本变化。[Desktop 文档](https://code.claude.com/docs/en/desktop)区分本机、Cloud、SSH 与 WSL；不能假定所有桌面会话都在同一个本地目录。

## 1.8.2 与 Windows 的补充核对

- npm 发布包的 gitHead 为 `c5a84fcc4a3ea63fb46a44a860b164999b9f7748`，下载包 SHA-1 与 registry 一致。Claude 的 `src/config.js` 条目及 `src/collectors/claude.js` 与已发布 1.9.3 逻辑一致；没有 Chat/Cowork 专用事件源。
- 用 1.8.2 原采集器重新运行同一份历史 Cowork 样本，标准 transcript 可解析、audit 发出零条事件、两份文件均不在扫描 roots，结果与已发布 1.9.3 一致。该复现仍是 macOS 历史样本，不是 Windows 客户端实测。
- 1.8.2 尚无 `extra-roots` 功能。已发布 1.9.3 虽有此功能，但 `src/extraRoots.js` 和 `src/config.js` 使用 `startsWith('/')` 判断绝对路径，拒绝合法 Windows 盘符与 UNC 路径。在 macOS 上以 `path.win32.isAbsolute` 确认合成路径合法，再调用旧 CLI 处理函数复现了拒绝，发生在配置写入之前；旧配置加载同样有该校验。此验证不是 Windows 实机运行；本次源码补丁已统一校验并覆盖回归。
- 本机 `main.log` 的 29 条 `claude-code-sessions` 路径引用均为目录缺失错误；目前不存在该目录。这只能提供入口线索，不能证明该目录保存了用量，也不能证明 Windows 的所有 Code 会话都落在这里。

Windows 路径候选需检查当前账号的 `%USERPROFILE%\.claude\projects`、`%APPDATA%\Claude`，以及已安装 Claude MSIX 包对应的 `LocalCache\Roaming\Claude`。Desktop 数据目录下可检查 `claude-code-sessions` 与 `local-agent-mode-sessions`；它们是待验证入口，不能仅凭目录名判断包含 token 明细。Anthropic [Windows 部署文档](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows)确认 MSIX 安装形式和 `Get-AppxPackage -Name Claude` 版本检查，但未承诺这些目录的 transcript 结构。SSH/WSL/Cloud 的日志还应在执行环境内核对。

下面的 PowerShell 检查仅输出版本、目录是否存在、JSONL 文件数与最近写入时间；不读取数据库、会话正文或凭证，不进行扫描入库。按当前用户运行；不要提升权限或在此阶段复制整个 Desktop 数据目录。

```powershell
token-watcher --version
Get-AppxPackage -Name Claude | Select-Object Name, Version

$twRoots = @(@{ Label = 'code-default'; Path = (Join-Path $env:USERPROFILE '.claude\projects') })
$twDesktop = @(@{ Label = 'desktop-roaming'; Path = (Join-Path $env:APPDATA 'Claude') })
foreach ($twPkg in @(Get-AppxPackage -Name Claude)) {
    $twDesktop += @{ Label = 'desktop-msix'; Path = (Join-Path $env:LOCALAPPDATA "Packages\$($twPkg.PackageFamilyName)\LocalCache\Roaming\Claude") }
}
foreach ($twRoot in $twDesktop) {
    foreach ($twSub in @('claude-code-sessions', 'local-agent-mode-sessions')) {
        $twRoots += @{ Label = "$($twRoot.Label)/$twSub"; Path = (Join-Path $twRoot.Path $twSub) }
    }
}
foreach ($twRoot in $twRoots) {
    $twExists = Test-Path -LiteralPath $twRoot.Path -PathType Container
    $twFiles = @()
    if ($twExists) {
        $twFiles = @(Get-ChildItem -LiteralPath $twRoot.Path -Recurse -Force -File -Filter '*.jsonl' -ErrorAction SilentlyContinue)
    }
    [pscustomobject]@{
        Root = $twRoot.Label
        Exists = $twExists
        JsonlCount = $twFiles.Count
        LatestWrite = ($twFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
    }
}
```

该片段尚未在反馈者 Windows 实机执行。文件枚举忽略无法访问的目录，因此结果为零还需区分日志不存在与访问失败；CLI 标准目录可能由 CLAUDE_CONFIG_DIR 更改。JSONL 数量不能证明存在合格 usage。后续日志样本只需脱敏的字段结构，不应提交账号/会话 ID、提示词、响应正文或认证信息。

## 获准的浏览器存储副本检查

经用户明确授权，仅复制 macOS Claude 的 `IndexedDB/https_claude.ai_0.indexeddb.leveldb` 与 `Local Storage/leveldb` 至此前批准的隔离目录，副本目录权限 0700、文件 0600。复制前后及解码后核对文件 SHA-256：原库保持一致，副本也未被解码工具修改。没有打开 Cookies、凭证数据库或外部账号接口。

使用固定提交的 [CCL Chromium Reader](https://github.com/cclgroupltd/ccl_chromium_reader) 离线解码 LevelDB/Snappy、Local Storage 字符串及 IndexedDB 的 Blink/V8 记录。该库只用于本地调查，没有添加到项目依赖；跳过凭证名称，禁止输出任意记录键、值或异常正文。只统计允许列表中的用量字段。

- Local Storage：解码 79 个现存脚本键值，未发现允许列表中的 input/output/cache/total token 或 modelUsage 字段，解码错误为零。
- IndexedDB：识别 5 个数据库、4 个 object store，解码 5 条数据记录，未发现上述字段，解码错误为零。
- 检查了 snake_case、camelCase 和 prompt/completion 等常见字段。未读取外部 blob；没有验证未知编码、其他存储位置、其他客户端版本或云端网络响应。

因此，本次样本没有提供可直接接入的 Chat 精确用量源。这个负结果不证明产品任何版本都无法提供 token，也不允许将配额百分比或文本长度伪装为真实用量。

## 后续范围与部署

1. 本次已实现已验证的 Cowork 结构和 Windows 路径校验；其他 Windows/Linux 数据布局仍须用相应客户端样本确认，不能扩大成扫描全部 Desktop 数据。
2. 标准 transcript 优先、audit 回退与跨格式去重已实现并通过回归；不同客户端出现新字段或结构时仍须独立验收。
3. 独立核对 `result.modelUsage` 的覆盖区间、额外模型与累计语义，再决定汇总补差；不把汇总伪装为逐请求明细，不简单叠加。
4. 区分官方账号配额和本地日志 token。Chat/云端模式若没有经验证的明细源，就在支持说明与健康视图中明确边界；正式回填前先备份并获得数据库写入授权。

本次回归已覆盖两种日志单独/共存、重复扫描、缺时间/请求 ID、晚到输出、排除多模型 result、已删源文件及不完整日志。其他来源的完整回归通过；正式部署后仍需对账 UI、模型费用和日志新鲜度。

1.8.2 无 `extra-roots` 命令，已发布 1.9.3 的 Windows 盘符/UNC 校验仍有缺陷；1.9.4 已包含 Windows 扩展目录修复。扩展目录只能接入已经核实格式的日志，不能取得云端聊天明细或安全推断 result 汇总差额。修改实际采集配置及正式回填应另行实施，本次补丁没有改正式用量库或服务。

## 当前版本变化

Anthropic 官方说明 [Chat 与 Cowork 正在合并](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)，按账号逐步上线，复杂任务可在云端继续运行。本地旧 VM/local-agent 日志不能代表所有新会话。官方 [数据导出说明](https://support.claude.com/en/articles/9450526-export-your-claude-data)只承诺账号与聊天历史；本次没有拿到包含精确 usage 的 Chat 导出样本，不能将导出历史当成已证实的计费数据。
