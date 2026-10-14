import { basename } from 'node:path';
import { readLinesFrom } from './lines.js';
import { normalizeModel } from '../models.js';
import { isCoworkUsagePath } from '../claudePaths.js';

/**
 * Claude Code transcript 采集器（同时服务官方订阅 ~/.claude 与 ccmr 隔离目录
 * ~/.claude-gateway，格式完全一致，仅 tool 标签不同）。
 *
 * 每条 type=assistant 记录的 message.usage 即一次 API 调用用量；
 * 官方 Claude 按 message.id 跨 transcript/audit 去重，标准 transcript 优先。
 * ccmr 保持 message.id + requestId 的既有行为。
 * model="<synthetic>" 是本地合成消息（无真实用量），跳过。
 */
export async function collectClaudeFile(store, { tool, path, fileId, offset }) {
  let inserted = 0;

  const { newOffset } = await readLinesFrom(path, offset, (line) => {
    // 廉价预过滤：绝大多数行不含 usage（~800MB 总量下避免无谓 JSON.parse）
    if (!line.includes('"usage"') || !/"type"\s*:\s*"assistant"/.test(line)) return;
    let rec;
    try { rec = JSON.parse(line); } catch { return; }
    const msg = rec?.message;
    const usage = msg?.usage;
    if (rec?.type !== 'assistant' || !usage || !msg?.id) return;
    if (tool === 'claude-code' && (typeof msg.id !== 'string' || msg.id.includes(':'))) return; // legacy-key separator
    const model = msg.model;
    if (!model || model === '<synthetic>') return;
    const audit = tool === 'claude-code' && ('_audit_timestamp' in rec ||
      (basename(path) === 'audit.jsonl' && isCoworkUsagePath(path)));
    const ts = Date.parse(rec.timestamp || (audit ? rec._audit_timestamp : ''));
    if (!Number.isFinite(ts)) return;

    // Audit-only rows need an explicit session identity; "audit" is not a session.
    if (audit && !rec.session_id && !rec.sessionId) return;
    if (tool === 'claude-code' && (Array.isArray(usage) || typeof usage !== 'object' ||
        !['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens']
          .some(k => usage[k] !== undefined) ||
        ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens']
          .some(k => usage[k] !== undefined && (!Number.isSafeInteger(usage[k]) || usage[k] < 0)))) return;
    const input = usage.input_tokens || 0;
    const cached = usage.cache_read_input_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const output = usage.output_tokens || 0;
    const thinking = usage.output_tokens_details?.thinking_tokens;
    const reasoning = tool === 'claude-code'
      ? (Number.isSafeInteger(thinking) && thinking >= 0 ? thinking : 0)
      : (thinking || 0);
    // Anthropic 口径：input_tokens 不含缓存，total = 四项之和
    const total = input + cached + cacheWrite + output;
    if (tool === 'claude-code' && !Number.isSafeInteger(total)) return;

    const event = {
      ts,
      tool,
      model: normalizeModel(model),
      session_id: rec.sessionId || rec.session_id || fileId,
      project: rec.cwd ? basename(rec.cwd) : null,
      input_tokens: input,
      cached_input: cached,
      cache_write: cacheWrite,
      output_tokens: output,
      reasoning_tokens: reasoning,
      total_tokens: total,
      dedup_key: tool === 'claude-code' ? `${tool}:message:${msg.id}` : `${tool}:${msg.id}:${rec.requestId ?? ''}`,
    };
    if (tool === 'claude-code') {
      inserted += store.upsertClaudeEvent({ ...event, usage_quality: audit ? 1 : 2 }, msg.id);
    } else inserted += store.insertEvent(event);

    // 同一条 assistant 消息的 content 里可能带 tool_use 块 → 工具活动统计
    if (Array.isArray(msg.content)) {
      for (let i = 0; i < msg.content.length; i++) {
        const block = msg.content[i];
        if (block?.type !== 'tool_use' || !block.name) continue;
        store.insertToolCall({
          ts,
          tool,
          name: block.name,
          session_id: rec.sessionId || rec.session_id || fileId,
          dedup_key: `${tool}:tc:${block.id || `${msg.id}:${i}`}`,
        });
      }
    }
  });

  return { newOffset, inserted };
}
