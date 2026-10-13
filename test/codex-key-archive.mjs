/**
 * 一次性 Codex 键迁移归档不该长住热库。
 *
 * 归档写入一次后没有任何查询读它，也没有留存策略；而每日备份是整库 `VACUUM INTO`
 * 快照并留 7 份，于是它被复制 7 份。实测一个 1232 MB 的库里归档占 954 MB（77%），
 * 真实数据只有 events 87 MB + tool_calls 55 MB。这里断言它搬去了独立库、不再进快照，
 * 且搬家本身不丢行。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { codexKeyArchivePath } from '../src/codexKeys.js';

const ARCHIVE = 'codex_key_migration_backup';
const hasTable = (db, name) => !!db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

/** 建一个「迁移还没跑过、且存在旧键」的库：含一条待改名、一对待合并。 */
function legacyDb(dir) {
  const dbPath = join(dir, '.tokenmeter', 'tokenmeter.db');
  new Store(dbPath).close();                       // 建表（顺带落下迁移标记）
  const db = new DatabaseSync(dbPath);
  db.exec("DELETE FROM settings WHERE key = 'migration:codex-keys:v1'");
  const ev = db.prepare(`INSERT INTO events
    (ts, tool, model, session_id, project, input_tokens, cached_input, cache_write,
     output_tokens, reasoning_tokens, total_tokens, dedup_key)
    VALUES (?, 'codex', 'gpt-5.4', 's1', 'projA', ?, 0, 0, ?, 0, ?, ?)`);
  // 只需改名：规范键在库里没有对手
  ev.run(1000, 10, 5, 15, 'codex:/a/b/rollout-solo.jsonl:1');
  // 冲突合并：旧键规范化后撞上已规范的行，输出更多的那条留下，两条都进归档
  ev.run(2000, 20, 99, 119, 'codex:/a/b/rollout-dup.jsonl:2');
  ev.run(2000, 20, 1, 21, 'codex:file:rollout-dup:2');
  const tc = db.prepare(
    "INSERT INTO tool_calls (ts, tool, name, session_id, dedup_key) VALUES (?, 'codex', 'shell', 's1', ?)");
  tc.run(3000, 'codex:tc:/a/b/rollout-solo.jsonl:9');
  db.close();
  return dbPath;
}

export async function testCodexKeyArchive(ok) {
  console.log('\n[codex] 迁移归档不长住热库');
  const check = (name, fn) => {
    try { fn(); ok(name, true); }
    catch (err) { ok(name, false, err.message); }
  };

  /* --- 搬家后：热库里没了，独立库里有，行数与内容保全 --- */
  const root = mkdtempSync(join(tmpdir(), 'tw-keyarchive-'));
  const dbPath = legacyDb(root);
  const sidePath = codexKeyArchivePath(dbPath);

  // fixture 会让迁移归档这些行：events 两条旧键 + 被撞的那条规范行，tool_calls 一条旧键
  const expected = 4;

  const store = new Store(dbPath);
  const db = store.db;

  check('热库里不再有归档表', () => assert.equal(hasTable(db, ARCHIVE), false));
  check('独立归档库已生成', () => assert.equal(existsSync(sidePath), true));

  let side;
  check('独立库里有归档表', () => {
    side = new DatabaseSync(sidePath);
    assert.equal(hasTable(side, ARCHIVE), true);
  });
  check(`归档行一条没丢（${expected} 行）`, () =>
    assert.equal(side.prepare(`SELECT count(*) AS c FROM ${ARCHIVE}`).get().c, expected));
  check('归档保留完整原行（含旧 dedup_key 与用量列）', () => {
    const row = side.prepare(
      `SELECT row_json FROM ${ARCHIVE} WHERE table_name = 'events' ORDER BY source_rowid`).get();
    const r = JSON.parse(row.row_json);
    assert.equal(r.dedup_key, 'codex:/a/b/rollout-solo.jsonl:1');
    assert.equal(r.total_tokens, 15);
    assert.equal(r.tool, 'codex');
  });
  check('两张表的旧行都归了档', () => {
    const byTable = Object.fromEntries(side.prepare(
      `SELECT table_name, count(*) AS c FROM ${ARCHIVE} GROUP BY table_name`).all()
      .map(r => [r.table_name, r.c]));
    assert.deepEqual(byTable, { events: 3, tool_calls: 1 });
  });

  /* --- 回归守卫：每日 VACUUM INTO 快照里不该再有这张表 --- */
  check('每日快照不再复制归档表', () => {
    const snap = join(root, 'daily.db');
    db.exec(`VACUUM INTO '${snap}'`);
    const s = new DatabaseSync(snap);
    assert.equal(hasTable(s, ARCHIVE), false);
    s.close();
  });

  /* --- 迁移结果本身没被搬家动过 --- */
  check('旧键已规范化，冲突按输出更多者保留', () => {
    const keys = db.prepare("SELECT dedup_key FROM events ORDER BY dedup_key").all().map(r => r.dedup_key);
    assert.deepEqual(keys, ['codex:file:rollout-dup:2', 'codex:file:rollout-solo:1']);
    assert.equal(db.prepare(
      "SELECT output_tokens AS o FROM events WHERE dedup_key = 'codex:file:rollout-dup:2'").get().o, 99);
  });

  side.close();
  store.close();

  /* --- 幂等：再开一次不报错、不重复搬 --- */
  check('重开不报错且归档库行数不变', () => {
    const again = new Store(dbPath);
    assert.equal(hasTable(again.db, ARCHIVE), false);
    again.close();
    const s = new DatabaseSync(sidePath);
    assert.equal(s.prepare(`SELECT count(*) AS c FROM ${ARCHIVE}`).get().c, expected);
    s.close();
  });
  rmSync(root, { recursive: true, force: true });

  /* --- 搬不过去时绝不先删：归档必须原样留在热库，且启动不被拦住 --- */
  const root2 = mkdtempSync(join(tmpdir(), 'tw-keyarchive-broken-'));
  const dbPath2 = legacyDb(root2);
  check('独立库不可用时归档留在热库，不丢行也不拦启动', () => {
    // 侧库路径上放个非 SQLite 文件：ATTACH 过得去，建表时报 "file is not a database"
    writeFileSync(codexKeyArchivePath(dbPath2), 'not a sqlite file');
    const s2 = new Store(dbPath2);
    assert.equal(hasTable(s2.db, ARCHIVE), true, '归档表被提前删掉了');
    assert.equal(s2.db.prepare(`SELECT count(*) AS c FROM ${ARCHIVE}`).get().c, expected);
    // 迁移本身仍然生效
    assert.equal(s2.db.prepare(
      "SELECT count(*) AS c FROM events WHERE dedup_key LIKE 'codex:file:%'").get().c, 2);
    s2.close();
  });
  rmSync(root2, { recursive: true, force: true });

  /* --- 侧库残留同键脏行：INSERT OR IGNORE 会静默跳过，核对必须拦住删表 --- */
  const root3 = mkdtempSync(join(tmpdir(), 'tw-keyarchive-stale-'));
  const dbPath3 = legacyDb(root3);
  check('侧库有同键异内容的脏行时不删热库归档', () => {
    const stale = new DatabaseSync(codexKeyArchivePath(dbPath3));
    stale.exec(`CREATE TABLE ${ARCHIVE} (table_name TEXT NOT NULL, source_rowid INTEGER NOT NULL,
      row_json TEXT NOT NULL, PRIMARY KEY (table_name, source_rowid))`);
    // 上次搬到一半留下的半成品：键占住了，内容是错的
    stale.exec(`INSERT INTO ${ARCHIVE} VALUES ('events', 1, '{"truncated":true}')`);
    stale.close();
    const s3 = new Store(dbPath3);
    assert.equal(hasTable(s3.db, ARCHIVE), true, '核对没通过却还是删了热库归档');
    assert.equal(s3.db.prepare(`SELECT count(*) AS c FROM ${ARCHIVE}`).get().c, expected);
    s3.close();
  });
  rmSync(root3, { recursive: true, force: true });
}
