/**
 * 会话钻取 /api/session/:sid 回归（F8）。
 * - 会话 ID 原样来自上游：uuid、codex 的 rollout-<时间>-<uuid>、anty-<uuid>、session_<uuid>、
 *   上游库里的不透明 ID，以及文件名 stem / dsh 目录名——后两者可含 `.`、`:` 等任意文件名字符。
 * - /api/sessions 按 (tool, session_id) 分组，钻取必须带上 tool，否则两个工具同名会话会被合并。
 * - 坏输入一律 400：空 ID、超长、控制字符、残缺的百分号编码（decodeURIComponent 会抛 → 曾是 500）。
 * 服务在临时 HOME + 离线的子进程里起（startServer 会读写数据目录），子进程逐条回报。
 * 单独运行：node test/session-drilldown.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '..');

/** 各采集器实际产生的会话 ID 形态（见 src/collectors/*，含文件名 stem 回落） */
export const REAL_IDS = [
  '0f8e5c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b',                              // claude-code / ccmr / workbuddy / qoder / pi
  'rollout-2026-10-12T10-20-30-0f8e5c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b', // codex 文件 stem
  'anty-0f8e5c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b',                        // antigravity
  'session_0f8e5c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b',                     // kimi 会话目录
  'ses_3a9f0c2be1ffe',                                                 // opencode
  'agent-a1b2c3d4',                                                    // claude 子代理文件 stem
  'proj.v2.session',                                                   // 文件 stem / dsh 目录名带点
  'host:1234:abc',                                                     // 上游自定 ID 带冒号
  'my session (copy)',                                                 // 文件名可含空格、括号
  '会话-1',                                                             // 非 ASCII 文件名
  'x'.repeat(256),                                                     // 上限
];

async function cases(ok) {
  const { Store } = await import('../src/store.js');
  const { startServer } = await import('../src/server.js');
  const { EventEmitter } = await import('node:events');
  const dir = mkdtempSync(join(tmpdir(), 'tw-sess-'));
  const st = new Store(join(dir, 's.db'));
  const now = Date.now();
  let n = 0;
  const ev = (tool, sid, total) => st.insertEvent({
    ts: now - 1000 * ++n, tool, session_id: sid, input_tokens: total, total_tokens: total, dedup_key: `sd${n}` });
  for (const id of REAL_IDS) ev('claude-code', id, 10);
  ev('codex', 'shared-id', 100); ev('codex', 'shared-id', 101); ev('claude-code', 'shared-id', 7);
  const scanner = new EventEmitter(); scanner.stats = {};
  const poller = { start() {}, status() { return []; } };
  let server;
  try {
    server = await startServer({ store: st, scanner, port: 0,
      balancePoller: poller, claudePoller: poller, cursorPoller: poller, zcodePoller: poller });
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path) => {
      const r = await fetch(base + path);
      let body = null; try { body = await r.json(); } catch { /* 非 JSON */ }
      return { status: r.status, body };
    };

    // C1：真实 ID 形态都能打开
    for (const id of REAL_IDS) {
      const { status, body } = await get(`/api/session/${encodeURIComponent(id)}`);
      ok(`会话 ID 可钻取：${id.length > 40 ? `${id.slice(0, 24)}…(${id.length})` : id}`,
        status === 200 && body?.session_id === id && body?.events?.length === 1, `${status} ${JSON.stringify(body).slice(0, 120)}`);
    }

    // C2：同名会话按 tool 分开
    const codex = await get('/api/session/shared-id?tool=codex');
    ok('tool=codex 只返回 codex 的事件',
      codex.status === 200 && codex.body?.events?.length === 2 && codex.body.events.every(e => e.total_tokens >= 100),
      JSON.stringify(codex.body));
    const claude = await get('/api/session/shared-id?tool=claude-code');
    ok('tool=claude-code 只返回 claude-code 的事件',
      claude.status === 200 && claude.body?.events?.length === 1 && claude.body.events[0].total_tokens === 7,
      JSON.stringify(claude.body));
    const merged = await get('/api/session/shared-id');
    ok('不带 tool 时保持旧行为（全部工具）', merged.status === 200 && merged.body?.events?.length === 3,
      JSON.stringify(merged.body));

    // C3：坏输入 400，不是 500 也不是 200
    const bad = {
      '空 ID': '/api/session/',
      '超长 257': `/api/session/${'x'.repeat(257)}`,
      '控制字符 \\n': '/api/session/a%0Ab',
      '控制字符 DEL': '/api/session/a%7Fb',
      '残缺百分号编码': '/api/session/%E0%A4%A',
    };
    for (const [name, path] of Object.entries(bad)) {
      const { status, body } = await get(path);
      ok(`坏输入返回 400：${name}`, status === 400 && !body?.events, `${status} ${JSON.stringify(body)}`);
    }
  } finally {
    if (server) await new Promise(r => server.close(r));
    st.close(); rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 面板侧：把 web/app.js 里真实的 loadSessions / showSessionDetail 源码放进 vm 执行，DOM 与 fetch
 * 用最小桩替代。行元素的 dataset 从渲染出的 HTML 属性解析（含实体反转义），点击后记录详情请求 URL。
 */
async function dashboardCases(ok) {
  const src = readFileSync(join(ROOT, 'web/app.js'), 'utf8');
  const start = src.indexOf('async function loadSessions(');
  const end = src.indexOf('\ndocument.getElementById(\'sess-date\')', start);
  ok('app.js 中找到会话钻取函数', start >= 0 && end > start);
  if (start < 0 || end < 0) return;
  const { esc } = await import(pathToFileURL(join(ROOT, 'web/lib/format.js')).href);
  const unesc = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const sessions = [
    { session_id: 'shared-id', tool: 'codex', first_ts: 1, last_ts: 2, calls: 2, total: 201, peak: 101, models: '', project: null },
    { session_id: 'shared-id', tool: 'claude-code', first_ts: 1, last_ts: 2, calls: 1, total: 7, peak: 7, models: '', project: null },
    { session_id: 'proj.v2:"x"&y', tool: 'grok', first_ts: 1, last_ts: 2, calls: 1, total: 5, peak: 5, models: '', project: null },
  ];
  const requests = [];
  const els = {};
  const el = (id) => (els[id] ??= {
    id, value: '', textContent: '', style: {}, _html: '', rows: [],
    set innerHTML(h) {
      this._html = h;
      this.rows = [...h.matchAll(/<tr class="sess-row"([^>]*)>/g)].map(([, attrs]) => {
        const dataset = {};
        for (const [, k, v] of attrs.matchAll(/data-([a-z]+)="([^"]*)"/g)) dataset[k] = unesc(v);
        const tr = { dataset, style: {}, handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
        return tr;
      });
    },
    get innerHTML() { return this._html; },
    querySelectorAll(sel) { return sel === '.sess-row' ? this.rows : []; },
  });
  const context = vm.createContext({
    document: { getElementById: el },
    fetch: async (u) => {
      requests.push(u);
      const body = u.startsWith('/api/sessions') ? { sessions } : { events: [{ ts: 1, total_tokens: 1 }] };
      return { json: async () => body };
    },
    esc, encodeURIComponent, Date, JSON, Promise,
    TOOL_LABEL: {}, prettyModel: (m) => m, fmt: String, fmtShort: String,
    charts: { sess: { resize() {}, setOption() {} } },
    cssVar: () => '', chartTooltip: (_k, o) => o, isLight: () => false,
  });
  vm.runInContext(`${src.slice(start, end)}\nglobalThis.__load = loadSessions;`, context);
  await context.__load('2026-10-12');
  const rows = el('sessions').rows;
  ok('会话列表渲染出每一行', rows.length === sessions.length, String(rows.length));
  for (const [i, s] of sessions.entries()) {
    requests.length = 0;
    rows[i]?.handlers.click?.();
    await new Promise(r => setImmediate(r));
    const want = `/api/session/${encodeURIComponent(s.session_id)}?tool=${encodeURIComponent(s.tool)}`;
    ok(`点击 ${s.tool} 行只请求该 (tool, 会话)`, requests.length === 1 && requests[0] === want, `${JSON.stringify(requests)} ≠ ${want}`);
  }
}

export async function testSessionDrilldown(ok) {
  await dashboardCases(ok);
  console.log('\n[会话钻取] /api/session/:sid');
  const home = mkdtempSync(join(tmpdir(), 'tw-sess-home-'));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SELF, 'child'], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, TOKENMETER_OFFLINE: '1', TOKENMETER_NO_KEYCHAIN: '1' } });
  rmSync(home, { recursive: true, force: true });
  const lines = r.stdout.split('\n').filter(l => /^(PASS|FAIL)\t/.test(l));
  ok('会话钻取子进程正常结束', r.status === 0 && lines.length >= REAL_IDS.length + 8, (r.stderr || '').slice(0, 400));
  for (const l of lines) { const [verdict, name, detail = ''] = l.split('\t'); ok(name, verdict === 'PASS', detail); }
}

if (process.argv[2] === 'child') {
  const ok = (name, cond, detail = '') =>
    console.log(`${cond ? 'PASS' : 'FAIL'}\t${name}\t${String(detail).replace(/[\t\n]/g, ' ')}`);
  try { await cases(ok); process.exit(0); }
  catch (err) { console.error(err); process.exit(1); }
} else if (process.argv[1] === SELF) {
  // 单独运行：自带计数与退出码
  let failed = 0;
  const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${name}`);
    else { failed++; console.error(`  ✗ ${name} ${detail}`); }
  };
  await testSessionDrilldown(ok);
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
}
