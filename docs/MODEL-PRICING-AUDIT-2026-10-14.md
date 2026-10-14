# 全模型漏配价核对（2026-10-14）

本轮只读核对正式用量库，修复价格解析。本轮核对中补齐 11 个原缺价名称，其中 2 个是有依据的免费模型；未公开身份或自动路由的名称继续缺价。沿用当前牌价重估历史 API 等值成本的项目口径；这些数字不能直接替代订阅、积分、活动资格或账户账单。未改历史 token、模型名、去重键或用户 pricing.json。

## 已补齐的名称和官方价格

单位均为每百万 token。USD 按面板当前汇率折人民币，CNY 不再乘汇率。缓存写栏为默认 5 分钟价格；日志无法还原缓存时长时不推断为 1 小时。

| 日志模型名及来源 | 价格解释 | 币种 | 输入未命中 | 缓存读 | 输出 | 缓存写 | 官方来源 |
|---|---|---|---:|---:|---:|---:|---|
| gemini-3.8-flash-n / Antigravity | Gemini 3.8 Flash | USD | 0.75 | 0.075 | 3.75 | 0 | [Google](https://ai.google.dev/gemini-api/docs/pricing) |
| step-5-preview / ccmr | 现行公开价格 | CNY | 7 | 0.70 | 20 | 0 | [Step](https://platform.stepfun.com/docs/zh/guides/pricing/details) |
| claude-opus-5-5-max / Cursor | Opus 5.5 API 价加 20% | USD | 4.8 | 0.24 | 24 | 6 | [Cursor](https://cursor.com/docs/models-and-pricing)、[Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) |
| grok-4.7-high-fast / Cursor | Grok 4.7 Fast 标准档 | USD | 4 | 1 | 12 | 0 | [xAI](https://docs.x.ai/developers/pricing) |
| grok-4.7-build / Grok Build | 同代 Grok 4.7 标准档 API 等值价 | USD | 2 | 0.5 | 6 | 0 | [xAI](https://docs.x.ai/developers/pricing) |
| k3 / Kimi Code | kimi-k3 | CNY | 20 | 2 | 100 | 20 | [Kimi](https://platform.kimi.com/docs/pricing/chat) |
| kimi-k3-1 / WorkBuddy | 配置显示 Kimi-K3，名称不是 K3.1 | CNY | 20 | 2 | 100 | 20 | [Kimi](https://platform.kimi.com/docs/pricing/chat) |
| hy4-preview-f / WorkBuddy | 官方试用配置 targetModelId=hy4-preview | CNY | 6 | 0.3 | 18 | 0 | [腾讯](https://cloud.tencent.com/act/pro/tokenplan) |
| mimo-v2.5-free / OpenCode | 官方免费 ID | USD | 0 | 0 | 0 | 0 | [OpenCode](https://opencode.ai/v2/docs/console/models/) |
| stealth/union-alpha / OpenCode | 旧 stealth 免费 ID 已退役；保留其历史免费口径 | USD | 0 | 0 | 0 | 0 | [OpenRouter](https://openrouter.ai/stealth/union-alpha) |
| deepseek/deepseek-v4-flash-0731 / Pi | 完整 OpenRouter ID 的实时目录价 | USD | 0.016 | 0.016 | 0.64 | 0 | [OpenRouter API](https://openrouter.ai/api/v1/models) |

直接访问各厂商原始页面；Kimi、腾讯和 OpenRouter 的动态表格/目录通过浏览器读取。OpenRouter 精确 ID 采用实时 API 的 prompt/completion/input_cache_read 字段，优先于滞后的搜索摘要；不套用 DeepSeek 直连峰谷折扣。

Gemini 别名通过本机 Antigravity CLI 的模型列表，以及冻结日志中 “Gemini 3.8 Flash (Medium)” 的选择记录与对应 gen_metadata 的 `gemini-3.8-flash-n` 一并确认。Kimi Code 的本机模型配置将 k3 指向 kimi-k3；WorkBuddy 下载的官方产品配置明确 Kimi-K3 显示名与 Hy4 试用映射。别名只在对应来源内启用，避免自定义网关同名模型被误认。

## 缓存、模式和日期边界

- Google Flash 的当前优惠截至 2026-12-31；2027-01-01 起为 USD 1.50 / 0.15 / 7.50。此前已修复的 Argon 截至 2026-11-30 为 USD 2 / 0.10 / 10，2026-12-01 起为 4 / 0.20 / 20。程序的日期切换按 UTC 边界处理，仍以计算时的现价重估历史。
- Cursor MAX 对 Opus 5.5 加 20%，与 Anthropic 的 fast mode 分开处理。基础 Opus 5.5 的 5 分钟缓存写为 USD 5；MAX 对应 USD 6。
- Grok 4.7/4.6 单次输入含缓存达到 200k 后为 USD 4 / 1 / 12；Fast 长上下文为 6 / 1.5 / 18。Grok 4.5 则为 2 / 0.3 / 6 与 4 / 0.6 / 12。**Cursor CSV、Grok turn 是多次调用汇总，不能用汇总 token 数套高档价**；这两类来源按标准档 API 等值价估算，无法还原其真实长上下文费用。
- Step 在 2026-10-14 00:30（UTC+8）起新客户缓存读价为 CNY 0.70；此前已有资格的客户保留 0.35。代码使用现行公开价，不凭日志猜账户资格；有资格的用户可在 pricing.json 显式设 input_hit=0.35。
- Kimi K3 官方缓存写为 CNY 20（5 分钟）或 40（1 小时）；本项目默认前者。旧三项价格文件缺少 input_write 时补官方默认写价，用户明确设 input_write=0 时仍尊重零价。
- Union Alpha 旧免费名称用于历史免费记录。官方后续揭示为 Unbiased Pareto 并结束免费期，新付费 ID 不与旧免费记录合并。

## 保留缺价的 6 个名称

| 名称 | 保留原因 |
|---|---|
| water18-0910 | 本机自定义名称，未获得官方模型身份和对应价 |
| codex-auto-review | 审查记录占位名，无可核实的固定底层模型及单价 |
| auto | 自动路由涉及不同模型，不能赋予一个固定 API 模型价 |
| grok-bot-automation | Bot 的工作类型标签，缺少逐次底层模型身份 |
| grok-bot-cua | 同上 |
| grok-bot-default | 同上 |

这些记录继续进入 token 用量和 unpriced 提示，不冒充免费模型，也不影响已知模型的正常计价。

## 验证与实现

新增 `src/officialPricing.js` 的有来源价格表与别名解析；费用卡、按天费用、订阅 ROI 和余额对账共用解析优先级：原始名称用户价 → 规范名称用户价 → 官方回退 → LiteLLM。累计聚合包含缓存写 token，按天查询保留工具维度，防止不同来源同名模型误混价。

完整隔离回归 **820 项通过，0 失败**，覆盖 11 个名称、币种、缓存读写、优惠截止、MAX/Fast、200k 边界、汇总粒度、别名来源限制、用户覆盖、免费与缺价区别，以及按天图/费用卡一致性。源码检出后运行 `npm test` 可复现合成场景。

在本机固定快照上，新增计价名称的费用 API 与独立公式逐项一致；Flash 按天之和与累计费用一致。实际 ECharts 已显示 `gemini-3.8-flash-n` 系列和悬浮金额，Antigravity 健康状态正常、解析错误为零。私人路径、会话和实测用量保留本地。

本轮补价不需要重新写入 token 历史。升级后的费用面板使用新解析链路重估；Antigravity 用量采集升级的备份与重扫步骤见 [恢复说明](ANTIGRAVITY-RECOVERY-2026-10-14.md)。
