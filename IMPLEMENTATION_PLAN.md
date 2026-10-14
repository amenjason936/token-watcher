# 修复 token 统计与官方口径的三处偏差

## 2026-10-14 发布 Antigravity 与模型价格修复（1.9.2）

用户已授权将本轮修复一起提交、推送 GitHub 并发布新版本。

1. [x] 核对远端 main、GitHub/npm 版本和发布流程，确定补丁版本 1.9.2；整理公开修复与恢复说明。
2. [x] 完成版本回归、macOS universal 构建、打包与干净安装验证；820 项回归、67 个包内文件与源码逐字节匹配、干净安装的 CLI/实数采集/Flash 与 Argon 计价及 8 个资源端点通过。
3. [ ] 提交推送本轮修复，确认多平台 CI；准备标签、GitHub Release 和 npm 发布包。
4. [ ] 发布并核对 GitHub、npm registry、安装包校验值和 Homebrew 更新结果。

npm 预检：当前会话返回 E401，registry 发布需要账户持有者恢复登录并完成验证。测试沿用本轮已授权的隔离目录和清理范围。本机数据库备份、逐键对账及个人用量证据保留本地，不进入公开发行包。

发布候选：token-watcher-1.9.2.tgz，SHA-256=76ba2ed8528e5020082e75ff96e2e15215c8d9fa8175ec393c24dcff65579679；菜单栏 universal 为 x86_64 + arm64。package-lock 与 package.json 统一为 1.9.2，公开恢复与价格说明包含在包内。

## 2026-10-14 已完成的 Antigravity 与模型定价修复

- [x] 按逐轮真实 usage 记录非缓存输入、缓存读和含思维输出；旧日志改用完整上下文估算，标明质量。
- [x] 修复晚到 usage/metadata、重复/full 日志、ACTIVE/DONE 及仅更新已有记录时的面板通知；采集版本升至 v3。
- [x] 按用户授权完成正式库一致备份与 Antigravity 历史回填；独立逐键、逐字段核对和重复扫描幂等通过，其他来源不受回填影响。
- [x] 补齐 Argon 与 11 个原缺价名称的官方价/来源别名（含 2 个免费名称），保留未知路由名称的缺价提示。
- [x] 修复缓存写价、优惠截止和 Cursor MAX/Grok Fast 模式；费用卡、按天图与 ROI 共用同一解析链路。
- [x] 完整隔离回归 820 项通过；只读实库费用试算、在线 API 与实际 ECharts 悬浮明细一致，Antigravity 健康正常。

公开说明：docs/ANTIGRAVITY-AUDIT-2026-10-14.md、docs/ANTIGRAVITY-RECOVERY-2026-10-14.md、docs/MODEL-PRICING-AUDIT-2026-10-14.md。

## 2026-10-10 合并 PR #2 并发布 1.8.4

用户明确授权合并 PR #2、提交推送补充修复并发布新版本；沿用本轮已确认的隔离合成数据库测试与临时文件清理范围。

1. [x] 核对远端 main、PR 提交、GitHub/npm 版本和发布账号状态；目标为补丁版本 1.8.4。
2. [x] 完成 PR CI 并合并；提交日期窗口等补充修复，保留本地 Cursor 修复和贡献者提交历史。
3. [x] 完成版本回归、universal 菜单栏构建、打包与干净安装验证，推送代码并检查 CI。
4. [x] 创建 v1.8.4 标签和 GitHub Release，上传安装包及校验文件；恢复 npm 认证、发布并核对 registry。

预检：npm latest 为 1.8.3，GitHub 最近 Release 为 v1.8.0；npm whoami 返回 E401，须在产物就绪后重新认证。PR #2 的首次贡献者 CI 已获准运行。

发布预验收：PR #2 三平台/Node 22.13 与 24 的 10 个 CI 任务全部通过，已通过保留提交历史的 merge 合并为 `f722222ff26cf5b93aed0b0aa545d2c139e1716c`。1.8.4 本地完整回归 644 项通过；prepack 构建 arm64 + x86_64，61 个包内文件逐字节匹配工作区，干净安装后的 CLI 版本及 8 个资源/API 端点通过。安装包与 SHA256SUMS 位于 `/private/tmp/token-watcher-pr2-KyI6bp/release/`。

发布完成（2026-10-10）：补充修复提交 `6bd611f`，与 PR 历史整合后为 `dd0c6d2294888686ebce66e91610cb151927d1f3`，已推送 main；v1.8.4 标签指向该发布提交。最终代码 CI [38034740378](https://github.com/luwill/token-watcher/actions/runs/38034740378) 的 10 个任务全部成功。用户完成 npm 登录与发布双重验证后，registry 已确认 `version=1.8.4`、`latest=1.8.4`，SHA-1/SHA-512 与本地安装包一致。公开 [GitHub Release](https://github.com/luwill/token-watcher/releases/tag/v1.8.4) 含安装包和 SHA256SUMS；安装包 SHA-256 为 `176024561414c83a2ab08dc816c425b2bcb42b3c8b0ea249ab4db1b892dc9689`。本次不重启正式服务、不改真实数据库或云端历史。

## 2026-10-10 Codex 压缩日志与统计窗口反馈

1. [x] 核对 PR #2（`5e6f9f96fa5653a64f2a1bf77b837b6c4b74c87d`）、截图与本地/云端统计路径。
2. [x] 接入 PR 的压缩日志发现、解压、快照重扫和跨格式去重，保留本地已有 Cursor 修复。
3. [x] 统一本地近 N 天为含今天的本地自然日；排行榜客户端对齐服务端 UTC 自然日；增加压缩历史进入 7/30 天窗口的回归。
4. [x] 运行隔离合成数据测试、语法检查与 diff 检查，补充恢复步骤和云端边界说明。

截图中的私人数据数字属于用户提供的对账结果，本轮用可复现合成数据验证机制，不把这些数字当作本机实测。云端现有防伪造策略拒收过去日期，客户端修复不能自动回填过去的云榜数据。
用户已确认本轮隔离测试及临时文件清理：仅在 `/private/tmp/token-watcher-pr2-KyI6bp/` 下创建测试家目录、读写合成 SQLite 库并清理测试生成的临时文件；真实用量库及云端 D1 不在测试范围内。

验收（macOS，Node 24.14.0）：18 项定向检查、644 项完整回归均通过，0 失败。另有 52 个 JS/MJS 文件语法、三种文件后缀及 Windows 工具调用去重键、zstd CLI/Node 单帧与多帧安全检查、Asia/Taipei/UTC/纽约春秋夏令时边界、`git diff --check` 通过。`npm pack --dry-run --ignore-scripts` 确认 61 个打包文件中包含新模块及恢复说明。没有新增依赖，未变更发布版本。

完整回归使用独立 HOME/XDG/临时目录；CLI 子进程离线，父进程仅放行回环 HTTP，拦截真实外网 fetch，允许套件中的模拟网络用例运行。此前两次运行分别被沙箱禁止监听本机端口、测试运行器的全局离线开关干扰模拟请求；调整运行器后全量通过，业务代码未为此放宽网络规则。
日志：`/private/tmp/token-watcher-pr2-KyI6bp/focused.log`、`/private/tmp/token-watcher-pr2-KyI6bp/full.log`。恢复说明：`docs/CODEX-COMPRESSED-HISTORY.md`。本地验证阶段结束时尚未发行；后续合并与发布结果见上方 1.8.4 发布记录。

---

起因：2026-09-16 用户发现面板显示 DeepSeek V4.1 Flash 今日 ¥8.34，
而 DeepSeek 平台显示当日总消费 ¥58.24 / 2,585 请求 / 1.626 亿 tokens。
定位后确认定价表无误（USD 表 ×6.67 = 官方峰时价），问题全在数据进库之前。

对账（诊断时点）：

| | 请求 | tokens | 峰时价成本 |
|---|---|---|---|
| ccmr 现状 | 1,000 | 84.4M | ¥8.34 |
| ccmr 修正后 | 1,000 | 85.5M | ~¥17.10 |
| dsh（完全缺失） | 548 | 59.6M | ~¥8.20 |
| 小计 | 1,548 | 145.1M | ~¥25.3 |
| 平台实测 | 2,585 | 162.6M | ¥58.24 |
| 残差（沉浸式翻译 / ragflow / arteryflow） | ~1,037 | ~17.5M | ~¥33 |

残差摊薄约 ¥1.9/M ≈ 未命中单价 ¥2/M，符合"翻译类调用零缓存命中"的特征，账能对上。

## 阶段 1：ccmr 输出 token 丢失 94.5%

Claude Code transcript 把一次 API 响应按 content block 拆成多行（`apiBlockIndex` 0..n），
共享 `message.id`，input/cached 每行重复，**`output_tokens` 只有终结块是真值，前面全是 0**。
`dedup_key = ${tool}:${msg.id}:${requestId ?? ''}`，而网关不写 `requestId`
（今日 3416 行全 undefined；官方 Claude Code 936 行全有），四个 block 塌成同一个 key，
`INSERT OR IGNORE` 留下第一条 = output 0。

- [x] 测试：ccmr 夹具加一条无 requestId 的多 block 响应，断言取到终结块的 output
      （RED 实录：`ccmr 终结块输出 500 而非 0 [{"o":200},{"o":0}]`）
- [x] 实现：改在 store 层——"输出更大的后来者补齐该行"
- [x] 决策：放弃"跳过 `stop_reason == null`"。它会新增一条静默丢弃路径，
      某个源不写该字段就整源归零，正是本次要修的事故类型；现有两个夹具
      恰好都没写这个字段，说明该字段确实容易被省略
- [x] ccmr 升 version 3 触发全量重扫，补正存量行（claude-code 已验证无恙，不动）

## 阶段 2：dsh 自 2026-08-14 起完全停采

dsh 升级会话格式，采集器只认旧结构，打开文件后一条也匹配不上，返回 0 且不报错。

| | 采集器认的 | v3 实际 |
|---|---|---|
| 文件名 | `session.jsonl.zstd` | `session.v3.jsonl.zstd` |
| 记录类型 | `assistant/chunk` + `chunk.type=='usage'` | `assistant/message` |
| usage 路径 | `data.chunk.usage` | `data.usage` |
| 字段名 | `inputTokens` 等 | 不变 |

- [x] 测试：v3 + 旧格式各一份夹具（zstd CLI 压缩，缺失时守卫跳过）
      （RED 实录：`dsh 1800 → {"t":320,"n":1}`，v3 文件颗粒无收，
      旧格式两条断言通过，证明向后兼容当时是好的）
- [x] 实现：解析 `assistant/message` + `data.usage`，补 `cacheWriteTokens`，
      模型优先 `data.message.source.model`，回落 `request/header`
- [x] dedup_key 隔离：v3 的键加文件名（`dsh:${fileId}:${file}:${seq}`），
      旧结构的键保持原样，避免历史事件重扫时被当成新行再插一遍。
      这点因阶段 1 的补登逻辑变得更要紧：撞键不再只是被丢弃，而会覆写旧行
- [x] dsh 升 version 2 触发全量重扫，补回 8-14 以来的用量

## 阶段 3：峰谷价未实现

`pricing.js` 只有注释写着"峰时价（谷时减半）"，没有任何代码，谷时用量被高估一倍。
方向与前两个 bug 相反，此前被掩盖。

- [x] 查证官方定义（api-docs.deepseek.com/quick_start/pricing，2026-09-16 核对）：
      **峰时 = UTC 周一至周五 01:00-04:00 与 06:00-10:00**，其余一切时段为谷时，减半。
      与"北京时间半夜打折"的想当然完全不同，幸好没凭记忆写：按 UTC、跳过整个周末、
      两段峰时之间 04:00-06:00 还有个空档，三处都容易错，各钉了一条用例
- [x] 同页确认种子表就是峰时价（flash $0.006/$0.3/$1.2，pro $0.044/$1.32/$3.96），无需改价
- [x] 实现：`PEAK_SQL` 片段，让分组与计价共用同一份判定；三处聚合（费用卡、
      按天堆叠图、余额对账）统一带上
- [x] `off_peak` 缺失时回落种子表——老用户的 pricing.json 没这个字段，
      若"缺失即不打折"，峰谷价对他们是个静默空操作（变异测试已验证此用例能变红）

## 约束

- 改采集器须升 `version` → 触发全量重扫、重写正式库（已获用户确认）
- 每个 commit 独立通过全部测试

## 阶段 4（重扫后才暴露）：守护进程解不开 zstd

面板健康自检报 `dsh=error / zstd not installed`，但 zstd 确实装着。原因是常驻服务由
launchd 拉起，其 PATH 是系统默认、不含 `/opt/homebrew/bin`，而 zstd 只装在那里。
于是守护进程从来解不开任何 dsh 快照，只有人在交互 shell 里手跑 `scan` 才正常——
这是个独立的既有 bug，不修的话阶段 2 在面板上等于白修。

- [x] 测试：清空 PATH 精确复现 launchd 环境（RED：`zstd not installed` + 0 事件）
- [x] 实现：优先用 Node 内置 zstd（≥23.8），旧版 Node 回落 CLI 并显式试常见绝对路径
- [x] 变异自检：只禁内置分支时测试仍绿（绝对路径兜住了，两条机制冗余是预期的）；
      两条同时禁掉才变红，说明断言盯的是对外契约而非某一条实现路径

## 收尾

- [x] 三个 commit 各自独立通过全部测试（detached worktree 逐个验证）
- [x] 正式库全量重扫（ccmr v3 / dsh v2 触发），补正存量数据。重扫前已备份至
      `~/.tokenmeter/backup-before-rescan-*`（确认无误后可删）
- [x] 对账验收：
      - ccmr 今日输出 64,828 → **1,169,337**，合计 **85,488,178**，与独立解析原始
        transcript 的预测值完全一致
      - dsh 逐 dedup_key 对账：原始 791 = 库内 791，漏采 0 / 多记 0 / 数值不符 0
      - dsh 全库 165 条 → 1,268 条（+1.7 亿 tokens）

## 2026-09-22 产品与代码评审（不修改实现）

1. [x] 梳理功能、架构、既有评审与当前工作区改动。
2. [x] 使用隔离测试与最小复现验证数据正确性、健康状态和运行边界。
3. [x] 输出按优先级排序的产品与代码评审，说明验证范围和限制（docs/REVIEW-2026-09-22.md）。

本次隔离数据库测试已获用户确认；不操作真实用量库，保留已有 web/app.js 修改。

## 2026-09-22 堆叠柱状图接缝修复

1. [x] 核对截图像素与现有堆叠布局，确认接缝为抗锯齿混色。
2. [x] 两张堆叠图改为 SVG + crispEdges，柱段统一直角，保持数据、配色与交互。
3. [x] 合成数据浏览器验证：760/1100/1600px 宽度、100%/125% CSS 缩放、悬浮提示、图例切换、日期钻取通过；最终版本 407 条回归检查全部通过，git diff --check 通过。

像素验收：样例柱中心扫描，消耗图颜色数 8 → 5、费用图 12 → 5（5 个真实系列，无混色接缝）。截图在 /private/tmp/token-{stack,cost}-{before,after}.png；浏览器使用静态服务与模拟 API，未访问真实用量库。

## 2026-09-22 项目成本与会话归因

1. [x] 数据基础：完整项目路径、历史回填与 Codex 跨路径去重。
2. [x] 项目 API：共用计价链路、覆盖率、趋势、会话与异常标记。
3. [x] 前端：项目榜、详情和逐请求钻取，接入全局时间范围。
4. [x] 验证：全量回归与 9 个新增行为测试通过；桌面/390px 窄屏、搜索、排序、502 条分页、XSS 转义、500 错误恢复、快速范围切换通过。
5. [x] 文档与交付：README 中英文与架构说明已更新；功能代码完成，用户确认后正式库已备份迁移、回填并启用。

沿用本任务已有的隔离数据库测试授权；正式库迁移与重扫在实现验证完成后单独确认。

正式启用验收（2026-09-22）：
- 用户明确允许正式备份、迁移、删除确认重复副本与重启。
- 迁移前/后 96,709 条、15,710,631,740 tokens 完全一致；确认重复副本为 0。
- 回填扫描 2,462 个文件，新增 3 条（进行中的日志）；131 个项目、91,398 / 96,712 条事件有完整路径，无解析错误，quick_check=ok。
- 备份：~/.tokenmeter/tokenmeter.db.before-projects-1790058578097.db。
- 按原有独立进程方式重启 8787（未新增 LaunchAgent），日志仍为 /private/tmp/tokenwatcher-dev.log。
- 正式 /api/projects?days=7 返回 200，抽样 41ms；51 个具名项目及 1 个未归属组；浏览器项目 → 16 条会话 → 500 条请求首屏钻取成功，无面板渲染错误。
- 隔离全量回归 415 条检查通过，另含 9 个项目分析行为测试；真实数据验证不替代上游源账单对账。

## 2026-09-22 撤回项目分析功能

- [x] 将完整功能实现和 diff 存档，移除项目分析界面/API/采集扩展与文档。
- [x] 保留此前柱状图接缝修复及用户原有前端改动。
- [x] 不恢复旧数据库，不丢弃新用量；仅保留已迁移 Codex 键的写入兼容。已有 project_path 列暂留但不使用。
- [x] 回归测试、重启正式服务并确认旧界面恢复。

回退验收：隔离回归全部通过，包含已迁移 Codex 事件/工具调用重扫去重测试；git diff --check 通过。正式 8787 已重启，项目面板不存在、项目 API 返回 404、summary 返回 200，两张按天图仍使用 SVG，无面板渲染错误。数据库 quick_check=ok，重启前 96,734 条，重扫后 96,739 条，未出现大量重复入账；旧备份未覆盖当前数据。

存档：/private/tmp/token-project-feature-20260922-143643

## 2026-09-24 社区排行榜评审与云端部署

1. [x] 审查客户端、Worker、数据库结构、前端与隐私边界，记录可复现问题。
2. [x] 修复上线阻塞项，补充 Worker 行为验证；保留现有工作区改动。最终隔离回归 494 项通过。
3. [x] 核实 Cloudflare 账号、免费部署配置，完成隔离测试与构建。
4. [x] 创建专用云端数据库并部署，验证端点，记录 URL、版本及限制。

本次不读取或上传真实用量库。用户已明确确认专用 D1 创建/初始化、合成数据测试与清理、30 天 GC、隔离测试及其临时文件清理、已有账号登录及 Cloudflare 条款。

当前进展：Wrangler 4.138.0 dry-run 构建成功，本地 workerd + D1 的健康/上报/日周榜/429/413/cron 验证通过。
用户已指定 ygnjd2016@gmail.com 并登录成功；确认该账号 Workers 尚无项目，子域为 ygnjd2016.workers.dev，Workers Free（$0）为当前计划。
用户明确授权 Wrangler 后，已用最小权限 OAuth 完成部署。
线上地址：https://token-watcher-leaderboard.ygnjd2016.workers.dev
Worker 版本：ea1d541e-9172-4f2c-a1cf-7dabb616b1bd；D1 为专用 token-watcher-leaderboard（WNAM）；cron 为每天 03:17 UTC。
线上合成数据验收脚本 cloud/smoke.mjs 的 8 项检查通过；测试行已按随机 UUID 精确删除，真实客户端函数验证榜单为空且个人记录不存在。
src/leaderboard.js 默认 URL 已更新。未发布 npm 包、未重启本地服务、未开启真实用量上传。
部署记录和源码 SHA-256：cloud/deployment.json。Chrome 打开公开接口遇到 net::ERR_BLOCKED_BY_CLIENT；直接 HTTPS 及项目客户端请求均成功。
评审：docs/REVIEW-LEADERBOARD-2026-09-24.md。完整回归日志：/private/tmp/token-leaderboard-review-tests.log。

## 2026-09-24 社区排行榜顶部切换

1. [x] 核对页面结构，切换范围限定为 Token 活动图以上；保留现有视觉样式。
2. [x] 顶部新增社区排行榜入口，与时间范围互斥切换上方概览；活动图以下保持显示。
3. [x] 用合成数据验证切换、时间筛选、主题/导出互不干扰和窄屏布局，完成现有检查。

仅改本地前端，无数据库和云端服务变更。
验收：Chrome 桌面/390px 窄屏、50 人榜单/空榜/服务失败、30/90 天切回、日/周榜、浅深主题和 CSV 原日期范围通过；浏览器无控制台错误。隔离临时 HOME 的完整回归 497 项通过，日志 /private/tmp/token-leaderboard-tabs-tests.log。

## 2026-09-24 社区近 30 日榜

1. [x] 核对口径：滚动 30 天总 Token；主力模型按后续要求改为跟随所选周期。
2. [x] 扩展客户端、Worker、数据库迁移及前端，兼容旧客户端缺失月统计。
3. [x] 隔离回归、浏览器验证；用户明确确认后完成迁移部署和实际榜单验证。

30 日榜本地验收：完整回归 512 项通过（/private/tmp/token-leaderboard-month-tests.log）；随后补充旧服务周期不匹配提示，Worker/UI 定向 34 项通过。Wrangler dry-run 成功；Chrome 桌面和 390px 窄屏通过、无控制台错误。云端迁移及更新上报等待本轮明确确认，尚未部署。

## 2026-09-24 主力模型跟随榜单周期

1. [x] 确认今日使用 UTC 日，与日榜一致；7/30 日为滚动窗口，各取 Token 总量第一名。
2. [x] 客户端按周期聚合，Worker 返回所选周期模型；旧记录缺失时明确提示，不跨期代用。
3. [x] 合成数据验证不同周期有不同主力、边界和旧记录兼容；已授权完成云端迁移与更新上报。

最终上线：用户确认近 30 日榜及周期模型两字段迁移、部署和真实聚合上报。D1 两份增量迁移成功，原参与者保留；Worker 版本 505ae204-2403-44b7-a619-f286acd8db1e。完整回归 525 项、线上合成烟测 9 项通过，测试行精确清理后仍为 1 位真实参与者。本地 launchd 服务已重启，新格式上报成功。实际三个周期 models_period 正确，Chrome 日榜显示 claude-opus-5.5，30 日榜及周期切换正常。日志 /private/tmp/token-leaderboard-model-period-tests.log；线上回执 /private/tmp/token-model-period-live-smoke.json、/private/tmp/token-model-period-live-verification.json。

## 2026-09-24 提交与发布就绪评审

1. [x] 清点待提交改动、发布配置和已有验收证据。
2. [x] 核验升级兼容、CLI/统计边界及 npm 打包/依赖风险，复现必要问题。
3. [x] 输出提交/发布结论，区分阻断项与后续优化；不执行提交或发布。

发布评审结论：暂不建议发布；4 项 P1 已复现（保留字昵称误执行、旧 Codex 键升级重复、days=0 漏历史、stream 回调异常逃逸），另列必要 P2 与版本/依赖收尾。详见 docs/RELEASE-READINESS-2026-09-24.md。本轮仅新增报告/计划，不修改业务代码、真实数据库、云端服务，不提交/发布。

## 2026-09-24 修复四项发布阻断

1. [x] 核对四项复现与调用路径，限定为本地代码及已获授权的临时合成数据库测试。
2. [x] 修复命令位置解析、Codex 旧键事务迁移、全历史参数与流异常传播。
3. [x] 补回归：保留字昵称、旧/新/混存数据库与回滚、HTTP 全历史、扫描失败恢复。
4. [x] 运行隔离完整回归，更新发布评审；不操作真实数据库、不重启线上服务、不提交发布。

验收：完整回归 550 项检查通过（不计最终汇总行），含新增 24 项阻断回归及新增模块语法/import 检查；git diff --check 通过。Codex 迁移原始行在同库归档、冲突取完整快照，临时库验证回滚/重试成功。日志 /private/tmp/token-release-blockers-tests.log。四项 P1 已关闭，P2 和发布收尾保持待办。

## 2026-09-24 发布 1.8.0

用户已明确授权 Git 提交、推送和发布。

1. [x] 核对远端 main、已有版本和登录状态，准备 1.8.0 元数据与发布说明。
2. [x] 完成隔离回归、macOS universal 构建、真实打包和干净安装验收。
3. [x] 提交并推送 main，三平台 CI 的 10 个任务全部通过。
4. [ ] GitHub Release 已公开并核对产物；npm 1.8.0 等待账号持有人完成发布双重验证，完成后核对 registry。

P2 已知限制随发布说明披露，不在本轮扩展重构；不重启用户本机服务，不再执行云端迁移。

发布预验收：1.8.0 完整回归 550 项通过；prepack 构建 x86_64 + arm64，真实包 54 个文件与当前源码逐文件一致，无凭证/数据库/账号配置。临时 consumer 安装成功，CLI 版本及 8 个资源/API 端点通过。产物和日志：/private/tmp/token-watcher-release-1.8.0/。

发布进度（2026-09-25）：提交 1aa534c 已推送 origin/main，v1.8.0 标签指向该提交。CI：https://github.com/luwill/token-watcher/actions/runs/36024063487 。GitHub Release：https://github.com/luwill/token-watcher/releases/tag/v1.8.0 ，包含 npm 格式安装包及 SHA256SUMS；已注明 npm 尚未发布。npm 登录已恢复到 louwill，发布命令等待官方双重验证，浏览器工具不允许操作该安全验证页面，由用户自行完成。未修改真实用量库或重启本机服务。
