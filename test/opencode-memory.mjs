import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { collectOpencodeDb } from '../src/collectors/opencode.js';

const SCHEMA = `
CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT);
CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);`;
const T = Date.parse('2026-10-14T00:00:00Z');
const tokens = { input: 10, output: 5, reasoning: 2, cache: { read: 1, write: 3 } };

function makeDb(file, { messages = [], parts = [] }) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  db.exec("INSERT INTO session VALUES ('s1', '/work/projO')");
  const im = db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)');
  const ip = db.prepare('INSERT INTO part VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  for (const [id, data] of messages) im.run(id, 's1', T, T, typeof data === 'string' ? data : JSON.stringify(data));
  for (const [id, data] of parts) ip.run(id, 's1', T, typeof data === 'string' ? data : JSON.stringify(data));
  db.exec('COMMIT');
  db.close();
}

async function collect(store, path, state) {
  const staged = store.stageWrites();
  const r = await collectOpencodeDb(staged.store, { tool: 'opencode', path, state, version: 2 });
  store.db.exec('BEGIN');
  try { r.inserted = staged.replay(); store.db.exec('COMMIT'); }
  catch (err) { store.db.exec('ROLLBACK'); throw err; }
  return r;
}

/**
 * OpenCode 的 part.data 是完整工具输出；首次全量扫描曾把整表 data 列 .all() 进 JS 堆，
 * 大库直接 OOM（StatementSync.All → ColumnToValue）。字段改在 SQLite 里取之后，
 * 堆占用不再随 data 列体积增长。
 */
export async function testOpencodeMemory(ok) {
  console.log('\n[opencode] large part.data stays out of the JS heap / malformed rows skipped');
  const root = mkdtempSync(join(tmpdir(), 'tw-opencode-'));
  const check = async (name, fn) => {
    try { await fn(); ok(name, true); } catch (err) { ok(name, false, err.stack); }
  };
  try {
    await check('malformed / non-tool / user rows are skipped, watermark reaches MAX(rowid)', async () => {
      const file = join(root, 'semantics.db');
      makeDb(file, {
        messages: [
          ['m1', { role: 'assistant', modelID: 'GPT-5', time: { created: T + 1 }, tokens }],
          ['m2', { role: 'user', time: { created: T + 2 } }],
          ['m3', '{not json'],
          ['m4', { role: 'assistant', time: { created: T + 4 }, tokens: { input: 0, output: 0 } }],
        ],
        parts: [
          ['p1', { type: 'tool', tool: 'bash', callID: 'c1', state: { time: { start: T + 1 } } }],
          ['p2', { type: 'text', text: 'hello' }],
          ['p3', '{not json'],
          ['p4', { type: 'tool', tool: 'read', state: { time: { start: T + 4 } } }],
          ['p5', { type: 'tool' }],
        ],
      });
      const store = new Store(join(root, 'semantics-store.db'));
      try {
        const r = await collect(store, file);
        const ev = store.db.prepare("SELECT * FROM events WHERE tool = 'opencode'").all();
        assert.equal(ev.length, 1);
        assert.equal(ev[0].dedup_key, 'opencode:m1');
        assert.equal(ev[0].total_tokens, 19);
        assert.equal(ev[0].reasoning_tokens, 2);
        assert.equal(ev[0].ts, T + 1);
        assert.equal(ev[0].project, 'projO');
        const tc = store.db.prepare("SELECT name, dedup_key FROM tool_calls ORDER BY dedup_key").all()
          .map(x => `${x.name}:${x.dedup_key}`);
        assert.deepEqual(tc, ['bash:opencode:tc:c1', 'read:opencode:tc:p4']);
        assert.equal(r.state.partMaxRowid, 5);
        const again = await collect(store, file, r.state);
        assert.equal(again.inserted, 0);
        assert.equal(store.db.prepare("SELECT COUNT(*) n FROM tool_calls").get().n, 2);
      } finally { store.close(); }
    });

    await check('first scan of a large part table fits a 48 MiB heap', async () => {
      const file = join(root, 'large.db');
      const big = 'x'.repeat(256 * 1024);
      const n = 400; // ~100 MiB of part.data
      makeDb(file, {
        messages: Array.from({ length: n }, (_, i) => [`m${i}`, { role: 'assistant', modelID: 'gpt-5', time: { created: T + i }, tokens }]),
        parts: Array.from({ length: n }, (_, i) => [`p${i}`, { type: 'tool', tool: 'bash', callID: `c${i}`, state: { time: { start: T + i }, output: big } }]),
      });
      const src = (rel) => pathToFileURL(join(import.meta.dirname, '..', rel)).href;
      const script = `
        const { Store } = await import(${JSON.stringify(src('src/store.js'))});
        const { collectOpencodeDb } = await import(${JSON.stringify(src('src/collectors/opencode.js'))});
        const store = new Store(${JSON.stringify(join(root, 'large-store.db'))});
        const staged = store.stageWrites();
        await collectOpencodeDb(staged.store, { tool: 'opencode', path: ${JSON.stringify(file)}, version: 2 });
        store.db.exec('BEGIN'); staged.replay(); store.db.exec('COMMIT');
        const e = store.db.prepare("SELECT COUNT(*) n FROM events").get().n;
        const t = store.db.prepare("SELECT COUNT(*) n FROM tool_calls").get().n;
        console.log(JSON.stringify({ e, t }));`;
      const res = spawnSync(process.execPath, ['--max-old-space-size=48', '--disable-warning=ExperimentalWarning',
        '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      assert.equal(res.status, 0, `exit ${res.status} ${res.signal ?? ''}\n${(res.stderr || '').slice(0, 600)}`);
      assert.deepEqual(JSON.parse(res.stdout.trim().split('\n').pop()), { e: n, t: n });
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
