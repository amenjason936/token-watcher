# v1.9.2 — 补齐 Antigravity 真实用量与模型价格

Antigravity 新版 CLI 已提供逐轮 usage，旧采集器仍用上下文差分与字符估算，导致缓存遗漏和历史少计。此版本优先读取真实输入、缓存读与含思维输出；旧日志按完整上下文估算，保留质量标记。v3 会在升级后自动重扫现存日志，实数可以补正较大或较小的旧估算。

修复会话结束后的晚到 metadata、ACTIVE/DONE 与常规/full/重放日志去重，以及仅更新已有记录时的面板通知。增加数据质量保护，估算无法覆盖已有实数。

费用侧增加官方价格回退及来源限定别名，覆盖 Gemini 4 Argon、Antigravity Gemini 3.8 Flash、Step 5 Preview、Cursor Opus 5.5 MAX、Grok 4.7 Fast/Build、Kimi K3、Hy4 与 OpenRouter 完整模型 ID；明确免费名称按零价处理，未知自动路由名称仍标缺价。缓存读写分别计费，Google 优惠截止、Cursor 模式加价和 Grok 上下文档位有独立回归。用户价格继续优先，费用卡、按天图与 ROI 使用相同计算链路。

验证：820 项完整隔离回归通过；固定日志逐键逐字段对账与重扫幂等通过；真实费用 API 与独立计算一致，实际 ECharts 图表已显示新增模型。

升级：`npm install -g token-watcher@1.9.2`。首次 v3 重扫前请暂停采集并备份 SQLite；细节见 [恢复说明](ANTIGRAVITY-RECOVERY-2026-10-14.md)。保留 ≈ 标记，因为旧日志可能仍为估算。费用为现价 API 等值估算；Cursor/Grok 多调用汇总无法还原单次长上下文档位，按标准档估算，不代表订阅或积分实付。

- [Antigravity 字段口径与复现](ANTIGRAVITY-AUDIT-2026-10-14.md)
- [官方价格、别名与计价边界](MODEL-PRICING-AUDIT-2026-10-14.md)
