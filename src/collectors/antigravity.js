import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readLinesFrom } from './lines.js';
import { normalizeModel } from '../models.js';

/**
 * Antigravity（IDE / CLI）：新版 PLANNER_RESPONSE 的 input_tokens 不含 cache_read_tokens，
 * output_tokens 已包含思维；total 按本项目口径包含缓存，thinking 只作诊断列不重复相加。
 * 旧日志依次回落到 gen_metadata 的完整 contextTokens、完整 transcript 字符上下文；
 * 缓存拆分未知，输出/思维按字符估算，usage_quality 明确区分两种估算与实数。
 * 每次请求重新处理上下文，因此不能用相邻上下文差分冒充请求输入。
 * metadata 晚到时补正该轮完整上下文，不依赖前后轮基线；pending 由 Scanner 持续重试。
 * 常规/full/重放日志共用会话+step 键，高质量数据覆盖旧估算，估算不能覆盖实数。
 */

/* ---------- 极简 protobuf 扫描（只需 varint 与 length-delimited 两类） ---------- */

function readVarint(b, o) {
  let v = 0, s = 0;
  while (o < b.length) {
    const x = b[o++];
    v |= (x & 0x7f) << s;
    if (!(x & 0x80)) return [v, o];
    s += 7;
    if (s > 63) throw new Error('varint too long');
  }
  throw new Error('varint truncated');
}

function protoFields(buf) {
  const out = [];
  let o = 0;
  try {
    while (o < buf.length) {
      const [tag, next] = readVarint(buf, o);
      o = next;
      const num = tag >> 3, wt = tag & 7;
      if (wt === 0) {
        const [v, vNext] = readVarint(buf, o);
        o = vNext;
        out.push({ num, val: v });
      } else if (wt === 2) {
        const [len, lNext] = readVarint(buf, o);
        o = lNext;
        out.push({ num, val: buf.subarray(o, o + len) });
        o += len;
      } else if (wt === 1) o += 8;
      else if (wt === 5) o += 4;
      else break;
    }
  } catch { /* 截断的尾部：已解析的前缀仍可用 */ }
  return out;
}

const utf8 = (v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : null);

/** gen_metadata 行 → { model, contextTokens, lastStepIndex }；结构不认识返回 null */
export function extractGenInfo(buf) {
  if (!(buf instanceof Uint8Array) || buf.length === 0) return null;
  const f1 = protoFields(buf).find((f) => f.num === 1)?.val;
  if (!(f1 instanceof Uint8Array)) return null;
  const inner = protoFields(f1);

  const model = utf8(inner.find((f) => f.num === 19)?.val)?.trim() || null;

  let contextTokens = 0;
  const f9 = inner.find((f) => f.num === 9)?.val;
  if (f9 instanceof Uint8Array) {
    const f10 = protoFields(f9).find((f) => f.num === 10)?.val;
    if (f10 instanceof Uint8Array) {
      const tok = protoFields(f10).find((f) => f.num === 1)?.val;
      if (Number.isFinite(tok)) contextTokens = tok;
    }
  }

  let lastStepIndex = null;
  for (const f of inner) {
    if (f.num !== 20 || !(f.val instanceof Uint8Array)) continue;
    const kv = protoFields(f.val);
    const k = utf8(kv.find((x) => x.num === 1)?.val);
    const v = utf8(kv.find((x) => x.num === 2)?.val);
    if (k === 'last_step_index' && v != null) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) lastStepIndex = n;
    }
  }
  return { model, contextTokens, lastStepIndex };
}

/** conversations/<uuid>.db 的 gen_metadata → Map(该 gen 行覆盖到的下一步 step_index → 信息) */
function readGenMetadata(dbPath) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null; // db 不存在/被锁：全部走字符估算
  }
  try {
    let rows;
    try {
      rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx').all();
    } catch {
      return null; // 旧版本库无此表
    }
    const map = new Map();
    for (const r of rows) {
      const info = extractGenInfo(r.data);
      if (info && info.lastStepIndex != null && info.contextTokens > 0) {
        map.set(info.lastStepIndex + 1, info);
      }
    }
    return map.size > 0 ? map : null;
  } finally {
    db.close();
  }
}

/* ---------- 字符估算与模型名 ---------- */

const isCjk = (cp) => (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x4dbf)
  || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)
  || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x20000 && cp <= 0x2ffff);

export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  let cjk = 0, other = 0;
  for (const ch of text) (isCjk(ch.codePointAt(0)) ? cjk++ : other++);
  return cjk + Math.ceil(other / 4);
}

const estValue = (v) => (typeof v === 'string' ? estimateTokens(v)
  : v == null ? 0 : estimateTokens(safeJson(v)));
function safeJson(v) { try { return JSON.stringify(v); } catch { return ''; } }

/** 一步自身新产生的 token 量（响应/工具调用会成为下一轮的历史上下文） */
const estStep = (r) => {
  let t = estValue(r.content);
  if (r.type === 'PLANNER_RESPONSE') t += estValue(r.tool_calls);
  return t;
};

/** "changed setting `Model Selection` from X to Gemini 3.8 Flash (Medium)." → 规范 slug */
export function normalizeAntigravityModel(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  let slug = name.trim()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(thinking|xhigh|high|medium|low|fast)\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!slug) return null;
  for (const marker of ['gemini', 'claude', 'gpt']) {
    const i = slug.indexOf(marker);
    if (i >= 0) { slug = slug.slice(i); break; }
  }
  return /^(gemini|claude|gpt)-/.test(slug) ? slug : `antigravity-${slug}`;
}

function parseModelSelection(content) {
  if (typeof content !== 'string') return null;
  const m = content.match(/changed setting `Model Selection` from .*? to ([^`\n]+?)(?:\s*\([^)]*\))?\.(?:\s+|$)/i);
  return m ? normalizeAntigravityModel(m[1]) : null;
}

/* ---------- 路径推导 ---------- */

/** …/antigravity-cli/brain/<uuid>/.system_generated/logs/transcript.jsonl → variant 根 */
export function variantRootOf(transcriptPath) {
  const m = transcriptPath.match(/^(.*)[/\\]brain[/\\][^/\\]+[/\\]\.system_generated[/\\]logs[/\\]transcript.*\.jsonl$/);
  return m ? m[1] : null;
}

export function sessionUuidOf(transcriptPath) {
  const m = transcriptPath.match(/[/\\]brain[/\\]([^/\\]+)[/\\]/);
  return m ? m[1] : null;
}

/* ---------- 采集主流程 ---------- */

const tokenCount = (v) => Number.isSafeInteger(v) && v >= 0;
/** 三项必须都有实数，避免把缺失/字符串/负数当 0；全零也是有效完成记录。 */
export function antigravityUsage(r) {
  if (![r.input_tokens, r.cache_read_tokens, r.output_tokens].every(tokenCount)) return null;
  if (!Number.isSafeInteger(r.input_tokens + r.cache_read_tokens + r.output_tokens)) return null;
  const reasoning = tokenCount(r.thinking_tokens) ? Math.min(r.thinking_tokens, r.output_tokens) : 0;
  return { input_tokens: r.input_tokens, cached_input: r.cache_read_tokens,
    output_tokens: r.output_tokens, reasoning_tokens: reasoning,
    total_tokens: r.input_tokens + r.cache_read_tokens + r.output_tokens, usage_quality: 3 };
}

export async function collectAntigravityFile(store, { tool, path, fileId, offset, state, version }) {
  const st = state ?? { ctx: 0, model: null, pending: [], seen: [] };
  st._v = version;
  st.pending ??= [];
  st.seen ??= [];
  let inserted = 0;
  // 重放只跳过上下文累加；晚到的完成记录仍能补上该 step 的真实 usage。
  const seen = new Set(st.seen);

  const root = variantRootOf(path);
  const uuid = sessionUuidOf(path) ?? fileId;
  const sid = `anty-${uuid}`;

  const stepMap = root ? readGenMetadata(join(root, 'conversations', `${uuid}.db`)) : null;

  // variant 根的 settings.json 是模型兜底（每次现读：用户会改默认模型）
  if (!st.model && root) {
    try {
      const s = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
      if (typeof s.model === 'string') st.model = normalizeAntigravityModel(s.model);
    } catch { /* 无 settings / 解析失败 */ }
  }

  // 按事件本身补正，不把旧轮减去更新轮的基线；Store 的质量优先级防止覆盖实数。
  if (st.pending.length && stepMap) {
    for (let i = 0; i < st.pending.length; i++) {
      const p = st.pending[i];
      const info = stepMap.get(p.step);
      if (!p.event || !(info?.contextTokens > 0)) continue;
      store.upsertAntigravityEvent({ ...p.event,
        model: normalizeAntigravityModel(info.model) ?? p.event.model,
        input_tokens: info.contextTokens, total_tokens: info.contextTokens + p.event.output_tokens,
        usage_quality: 2,
      });
      st.pending.splice(i, 1); i--;
    }
  }

  const { newOffset } = await readLinesFrom(path, offset, (line) => {
    let r;
    try { r = JSON.parse(line); } catch { return; }
    if (!r || typeof r !== 'object') return;

    // ACTIVE 不是最终数；不消耗去重键，后到的 DONE 必须能计入。
    if (r.status === 'ACTIVE') return;
    const si = r.step_index;
    const replay = seen.has(si);
    if (Number.isFinite(si)) {
      if (!replay) { seen.add(si); st.seen.push(si); }
    }

    if (!replay && (r.type === 'USER_INPUT' || r.type === 'USER_SETTINGS_CHANGE')) {
      st.model = parseModelSelection(r.content) ?? st.model;
    }

    if (r.type !== 'PLANNER_RESPONSE') {
      if (!replay) st.ctx += estStep(r);
      return;
    }

    const ts = Date.parse(r.created_at);
    const usage = antigravityUsage(r);
    if (replay && !usage) return;
    const info = stepMap?.get(r.step_index) ?? null;
    if (info?.model) st.model = normalizeAntigravityModel(info.model) ?? st.model;
    const input = info?.contextTokens > 0 ? info.contextTokens : st.ctx;
    if (!replay) st.ctx += estStep(r); // 本步输出进入下一轮的完整历史上下文
    if (!Number.isFinite(ts) || !Number.isSafeInteger(si) || si < 0) return;
    const reasoning = estValue(r.thinking);
    const output = estValue(r.content) + estValue(r.tool_calls) + reasoning;

    const key = `antigravity:${sid}:${r.step_index}`;
    const event = {
      ts,
      tool,
      model: st.model ? normalizeModel(st.model) : null,
      session_id: sid,
      project: null,
      input_tokens: input,
      cached_input: 0,
      cache_write: 0,
      output_tokens: output,
      reasoning_tokens: reasoning,
      total_tokens: input + output,
      dedup_key: key,
      usage_quality: info?.contextTokens > 0 ? 2 : 1,
      ...usage,
    };
    const n = store.upsertAntigravityEvent(event);
    inserted += n;
    if (usage || info?.contextTokens > 0) {
      st.pending = st.pending.filter(p => p.step !== si);
    } else if (!st.pending.some(p => p.step === si)) {
      st.pending.push({ step: si, event });
    }
  });

  return { newOffset, inserted, state: st };
}
