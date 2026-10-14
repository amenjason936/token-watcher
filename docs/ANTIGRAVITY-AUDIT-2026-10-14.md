# Antigravity 用量统计审计与修复（2026-10-14）

修复前的采集器忽略新版 CLI 已写入的逐轮 usage，以相邻上下文差分和字符估算代替输入/输出，并将缓存读固定为零。1.9.2 改为优先读取真实字段；旧日志继续估算且保留质量标记。发现与验证基于 CLI 1.3.4 的本地格式，不能推广为所有 IDE 版本都提供真实 usage。

## 字段口径

新版 `PLANNER_RESPONSE` 的 `input_tokens` 不含 `cache_read_tokens`，`output_tokens` 已含 `thinking_tokens`。本项目统一总量为 input + cache_read + output，思维只作诊断列，不额外相加。上游 total 的口径可能不含缓存，不能原样照搬。

合成最小例：input=1000、cache_read=5000、output=200、thinking=150，应入账总量 6200，而不是 6350。正文字符长度不能覆盖这些明确的实数。缺失、负数、字符串、非有限值或溢出字段不视为真实 usage；三项全零仍是有效的完成记录。

## 修复前的问题与对应验证

1. **忽略实数并漏缓存**：采集器现优先读取逐轮数值，常规/full/重放日志使用同一会话与步骤键。
2. **上下文差分少计输入**：旧日志的连续请求上下文为 10000、11000 时，应保留每轮完整上下文，而不是第二轮只记 1000。上下文缩短也不归零；缓存拆分未知时仍明确属于估算。
3. **晚到 metadata 倒退全局基线**：现按事件本身补正，不依赖后续轮的基线。旧估算无法覆盖已记录的真实 usage；真实 usage 即使小于旧估算也应覆盖。
4. **会话结束后的静默补正被跳过**：pending 存在时，即使 transcript 的大小和 mtime 不变，Scanner 仍重试 metadata；仅更新已有事件也通知面板刷新。
5. **占位或副本抢占去重键**：ACTIVE 不抢占最终 DONE；重复 DONE 不双计，较短的旧副本不削弱完整上下文估算。

源码定位：`src/collectors/antigravity.js`、`Store.upsertAntigravityEvent()`、`Store.stageWrites()`、`Scanner.scanAll()`。数据质量标记为 usage_quality：0=历史尚未分类，1=字符估算，2=完整 metadata 上下文与估算输出，3=逐轮真实 usage。

## 可复现验证

`test/antigravity-usage.mjs` 覆盖缓存/思维口径、非法值和溢出、全零、实数覆盖较大估算、重复/full 日志、ACTIVE/DONE、完整上下文、晚到 metadata、静默重试、通知及版本重扫。运行 `npm test` 会在独立 HOME/XDG 和临时合成数据库中执行；本轮完整套件 820 项通过。

另以固定真实日志快照做独立逐键、逐字段对账；重算与重复重算一致，其他来源与非 Antigravity 账本不受回填影响。私人路径、会话与账户数字留在本地，公开仓库只包含合成夹具和方法。

## token、额度与费用

真实 usage 仅证明日志中的处理 token。旧 CLI/IDE 日志仍可能只有估算，质量标记继续保留；工具名统一显示 Antigravity，具体计量口径见页面底部的数据源悬浮说明。这些 token 和按 API 现价估算的成本不代表 Google 账号剩余额度、订阅扣减或实付账单。

官方依据：

- [Headless / JSON 与 stream-json usage](https://antigravity.google/docs/cli/headless/)
- [状态栏 token 与 quota 字段](https://antigravity.google/docs/cli/statusline/)
- [官方模型额度面板 /usage](https://www.antigravity.google/docs/cli/commands/usage/)
- [套餐、baseline quota 和 overages](https://antigravity.google/docs/plans/)

升级重扫前的备份步骤见 [恢复说明](ANTIGRAVITY-RECOVERY-2026-10-14.md)，模型价格与别名见 [价格核对](MODEL-PRICING-AUDIT-2026-10-14.md)。
