import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { Scanner } from '../src/scanner.js';
import { SOURCES } from '../src/config.js';
import { collectAntigravityFile, antigravityUsage } from '../src/collectors/antigravity.js';

export async function testAntigravityUsage(ok) {
  const dir = mkdtempSync(join(tmpdir(), 'antigravity-usage-'));
  const store = new Store(join(dir, 'usage.db'));
  const row = (step, fields = {}) => ({ type: 'PLANNER_RESPONSE', status: 'DONE', step_index: step,
    created_at: '2026-10-14T00:00:00Z', content: 'abcd', ...fields });
  const path = (sid, full = false) => join(dir, 'brain', sid, '.system_generated/logs', full ? 'transcript_full.jsonl' : 'transcript.jsonl');
  const write = (p, rows) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); };
  const event = (sid, step) => store.db.prepare('SELECT * FROM events WHERE dedup_key = ?').get(`antigravity:anty-${sid}:${step}`);
  const collect = async (p, state, offset = 0) => {
    const staged = store.stageWrites();
    const r = await collectAntigravityFile(staged.store, { tool: 'antigravity', path: p, fileId: 'transcript', offset, state, version: 3 });
    store.db.exec('BEGIN');
    try { r.inserted = staged.replay(); store.db.exec('COMMIT'); }
    catch (e) { store.db.exec('ROLLBACK'); throw e; }
    return r;
  };
  const vi = n => { const b = []; do { let v = n % 128; n = Math.floor(n / 128); if (n) v |= 128; b.push(v); } while (n); return Buffer.from(b); };
  const ld = (n, b) => Buffer.concat([vi(n * 8 + 2), vi(b.length), b]);
  const vf = (n, nval) => Buffer.concat([vi(n * 8), vi(nval)]);
  const metadata = (sid, values) => {
    mkdirSync(join(dir, 'conversations'), { recursive: true });
    const d = new DatabaseSync(join(dir, 'conversations', sid + '.db'));
    try {
      d.exec('CREATE TABLE IF NOT EXISTS gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
      for (const [step, count] of values) d.prepare('INSERT OR REPLACE INTO gen_metadata VALUES (?, ?)').run(step, ld(1, Buffer.concat([
        ld(9, ld(10, vf(1, count))), ld(19, Buffer.from('Gemini 3.8 Flash')),
        ld(20, Buffer.concat([ld(1, Buffer.from('last_step_index')), ld(2, Buffer.from(String(step - 1)))])),
      ])));
    } finally { d.close(); }
  };
  try {
    const raw = { input_tokens: 1000, cache_read_tokens: 5000, output_tokens: 200, thinking_tokens: 150 };
    write(path('exact'), [row(1, { content: 'x'.repeat(100000), thinking: 'y'.repeat(100000), ...raw })]);
    const first = await collect(path('exact'));
    const e = event('exact', 1);
    ok('Antigravity 实数优先、输入不减缓存、思维不重复相加',
      e.input_tokens === 1000 && e.cached_input === 5000 && e.output_tokens === 200
      && e.reasoning_tokens === 150 && e.total_tokens === 6200 && e.usage_quality === 3);
    ok('Antigravity 新增事件通过写入代理正确计数', first.inserted === 1);
    await collect(path('exact'), first.state, first.newOffset);
    ok('Antigravity 二次扫描幂等', event('exact', 1).total_tokens === 6200);

    // 估算可以大于实数，不能沿用通用“大输出才更新”的限制。
    write(path('upgrade'), [row(1, { content: 'z'.repeat(10000) })]);
    const est = await collect(path('upgrade'));
    appendFileSync(path('upgrade'), JSON.stringify(row(1, raw)) + '\n');
    const upgraded = await collect(path('upgrade'), est.state, est.newOffset);
    ok('Antigravity 同 step 的晚到实数覆盖更大的旧输出估算', event('upgrade', 1).output_tokens === 200 && event('upgrade', 1).total_tokens === 6200);
    ok('Antigravity 升级实数后清掉 pending', upgraded.state.pending.length === 0);
    write(path('upgrade', true), [row(1, { content: 'q'.repeat(20000) })]);
    metadata('upgrade', [[1, 50000]]);
    await collect(path('upgrade', true));
    ok('Antigravity full/metadata 的旧估算不能覆盖实数', event('upgrade', 1).usage_quality === 3 && event('upgrade', 1).total_tokens === 6200);

    write(path('active'), [row(1, { ...raw, status: 'ACTIVE' }), row(1, raw), row(1, raw)]);
    await collect(path('active'));
    ok('Antigravity ACTIVE 不抢占 DONE，重复 DONE 不双计', store.db.prepare("SELECT COUNT(*) n FROM events WHERE session_id='anty-active'").get().n === 1 && event('active', 1).total_tokens === 6200);
    write(path('zero'), [row(1, { input_tokens: 0, cache_read_tokens: 0, output_tokens: 0 })]);
    await collect(path('zero'));
    ok('Antigravity 全零实数仍覆盖字符估算', event('zero', 1).usage_quality === 3 && event('zero', 1).total_tokens === 0);
    ok('Antigravity 不把缺失、负数、字符串或 Infinity usage 当实数',
      [undefined, -1, '1', Infinity].every(v => antigravityUsage({ ...raw, input_tokens: v }) === null));
    ok('Antigravity 总量溢出时不采为实数', antigravityUsage({ ...raw, input_tokens: Number.MAX_SAFE_INTEGER }) === null);

    write(path('full-context', true), [row(0, { type: 'USER_INPUT', content: 'x'.repeat(800) }), row(1)]);
    write(path('full-context'), [row(0, { type: 'USER_INPUT', content: 'abcd' }), row(1)]);
    await collect(path('full-context', true));
    await collect(path('full-context'));
    ok('Antigravity 同质量副本保留完整字符上下文，不被截短副本覆盖', event('full-context', 1).input_tokens === 200);

    write(path('legacy'), [row(1), row(3), row(5)]);
    metadata('legacy', [[1, 10000], [3, 11000], [5, 8000]]);
    await collect(path('legacy'));
    ok('Antigravity 旧日志完整上下文计量，增长和压缩均不做差分',
      event('legacy', 1).input_tokens === 10000 && event('legacy', 3).input_tokens === 11000 && event('legacy', 5).input_tokens === 8000);
    ok('Antigravity 旧日志输出含估算思维一次', event('legacy', 1).total_tokens === event('legacy', 1).input_tokens + event('legacy', 1).output_tokens);

    const p = path('late');
    write(p, [row(1), row(3), row(5)]);
    metadata('late', [[1, 10000], [5, 12000]]);
    const late = await collect(p);
    const before = statSync(p);
    store.saveFile({ path: p, tool: 'antigravity', session_id: 'transcript', size: before.size, mtime_ms: before.mtimeMs,
      offset: late.newOffset, state_json: JSON.stringify(late.state) });
    metadata('late', [[3, 11000]]);
    const originals = SOURCES.slice();
    try {
      SOURCES.splice(0, SOURCES.length, { tool: 'antigravity', collector: 'antigravity', version: 3, kind: 'jsonl', roots: [join(dir, 'brain/late')] });
      const scanner = new Scanner(store);
      let notifications = 0;
      scanner.on('update', () => notifications++);
      await scanner.scanAll({ quiet: true });
      ok('Antigravity transcript 不变时重试晚到 metadata', event('late', 3).input_tokens === 11000);
      ok('Antigravity 补正旧轮不倒退或改变后轮输入', event('late', 5).input_tokens === 12000);
      const state = JSON.parse(store.getFile(p).state_json);
      ok('Antigravity metadata 到位后 pending 清空', state.pending.length === 0);
      ok('Antigravity 仅补正已有事件也通知面板刷新', notifications === 1);
      const totals = store.byTool()[0].total;
      await scanner.scanAll({ quiet: true });
      ok('Antigravity 静默补正后再次扫描幂等', store.byTool()[0].total === totals);
    } finally { SOURCES.splice(0, SOURCES.length, ...originals); }

    // 旧库历史没有 quality，版本重扫也必须能缩减旧估算。
    const old = { ...e, dedup_key: 'antigravity:anty-old:1', session_id: 'anty-old', output_tokens: 99999, total_tokens: 99999 };
    store.insertEvent(old);
    write(path('old'), [row(1, raw)]);
    await collect(path('old'));
    ok('Antigravity 版本重扫覆盖所有旧 usage 列，即使输出变小', event('old', 1).total_tokens === 6200 && event('old', 1).cached_input === 5000);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
