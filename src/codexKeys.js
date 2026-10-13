import { dirname, join } from 'node:path';

/** 兼容已规范化的 Codex 键，避免回退后把同一事件重新入账。 */
export function canonicalCodexKey(key) {
  if (key.startsWith('codex:file:') || key.startsWith('codex:tc:file:')) return key;
  const m = key.match(/^codex:(tc:)?(.+\.jsonl(?:\.(?:zst|zstd))?):(.+)$/i);
  if (!m) return key;
  const stem = m[2].replaceAll('\\', '/').split('/').pop().replace(/\.jsonl(?:\.(?:zst|zstd))?$/i, '');
  return `codex:${m[1] || ''}file:${stem}:${m[3]}`;
}

const MIGRATION_KEY = 'migration:codex-keys:v1';
const ARCHIVE_TABLE = 'codex_key_migration_backup';
const ARCHIVE_DB_FILE = 'codex-key-migration-backup.db';
const ARCHIVE_COLUMNS = `table_name TEXT NOT NULL, source_rowid INTEGER NOT NULL, row_json TEXT NOT NULL,
            PRIMARY KEY (table_name, source_rowid)`;

/** 恢复归档的落地文件：与统计库同目录，独立成库后不再被每日快照复制。 */
export function codexKeyArchivePath(dbPath) {
  return join(dirname(dbPath), ARCHIVE_DB_FILE);
}

/**
 * 旧版按绝对路径去重，新版按文件名去重。一次性原子迁移防止归档/重扫重复入账。
 * 所有改动前的完整行保存在 codex_key_migration_backup（不参与统计），
 * 包含旧版留下的额外列。冲突时保留输出更多的完整快照，输出相同则取总量更多；
 * 不把两个快照相加，也不逐字段取最大值。完全相同时优先已规范化的记录。
 */
export function migrateCodexKeys(db) {
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(MIGRATION_KEY)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    // 另一个 CLI/服务可能刚完成迁移；拿到写锁后再确认。
    if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(MIGRATION_KEY)) {
      let archive;
      const preserve = (table, row) => {
        if (!archive) {
          db.exec(`CREATE TABLE IF NOT EXISTS ${ARCHIVE_TABLE} (${ARCHIVE_COLUMNS})`);
          archive = db.prepare(`INSERT OR IGNORE INTO ${ARCHIVE_TABLE} VALUES (?, ?, ?)`);
        }
        const { source_rowid, ...record } = row;
        archive.run(table, source_rowid, JSON.stringify(record));
      };
      // table 是固定内部白名单，不接受外部输入。
      for (const table of ['events', 'tool_calls']) {
        const legacy = db.prepare(`SELECT rowid AS source_rowid, * FROM ${table}
          WHERE tool = 'codex' AND dedup_key NOT LIKE 'codex:file:%'
            AND dedup_key NOT LIKE 'codex:tc:file:%' ORDER BY rowid`).all();
        const find = db.prepare(`SELECT rowid AS source_rowid, * FROM ${table} WHERE dedup_key = ?`);
        const rename = db.prepare(`UPDATE ${table} SET dedup_key = ? WHERE rowid = ?`);
        const remove = db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
        for (const row of legacy) {
          const key = canonicalCodexKey(row.dedup_key);
          if (key === row.dedup_key) continue;
          preserve(table, row);
          const existing = find.get(key);
          if (existing) {
            if (existing.tool !== 'codex') throw new Error(`Codex key migration: conflicting tool in ${table}`);
            preserve(table, existing);
            const oldWins = table === 'events' && (row.output_tokens > existing.output_tokens
              || (row.output_tokens === existing.output_tokens && row.total_tokens > existing.total_tokens));
            remove.run(oldWins ? existing.source_rowid : row.source_rowid);
            if (!oldWins) continue;
          }
          rename.run(key, row.source_rowid);
        }
      }
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(MIGRATION_KEY, '1');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * 把一次性迁移归档从统计库搬到同目录的独立库。
 *
 * 归档只在首次打开旧库时写入一次，之后没有任何查询读它，也没有留存策略，于是它一直留在
 * 热库里。而每日备份是整库 `VACUUM INTO` 快照并保留 7 份（src/server.js 的 scheduleBackup），
 * 这张只写不读的表因此被复制 7 份：实测一个 1232 MB 的库里它占 954 MB（77%），而真实数据
 * 只有 events 87 MB + tool_calls 55 MB，每份日备被它从约 0.15 GB 撑到 1.2 GB。
 *
 * 搬成独立文件后恢复归档照旧可查（ATTACH 即可），但不再进热库、也不再进每日快照。
 * 先整表复制并逐行核对落地，再删原表：任何一步失败都保持原样，下次启动重试。
 */
export function offloadCodexKeyArchive(db, dbPath) {
  const present = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ARCHIVE_TABLE);
  if (!present) return { moved: 0 };
  const target = codexKeyArchivePath(dbPath);
  // ATTACH 不能在事务内执行；migrateCodexKeys 已提交，此处没有活动事务。
  db.exec(`ATTACH DATABASE '${target.replace(/'/g, "''")}' AS keyarchive`);
  let moved = 0;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS keyarchive.${ARCHIVE_TABLE} (${ARCHIVE_COLUMNS})`);
    const total = db.prepare(`SELECT count(*) AS c FROM main.${ARCHIVE_TABLE}`).get().c;
    db.exec(`INSERT OR IGNORE INTO keyarchive.${ARCHIVE_TABLE}
      SELECT table_name, source_rowid, row_json FROM main.${ARCHIVE_TABLE}`);
    // WAL 下跨库事务对各库分别原子、整体不原子，所以不靠事务：核对每一行都已按原样落地再删。
    const landed = db.prepare(`SELECT count(*) AS c FROM main.${ARCHIVE_TABLE} AS b
      WHERE EXISTS (SELECT 1 FROM keyarchive.${ARCHIVE_TABLE} AS a
                     WHERE a.table_name = b.table_name AND a.source_rowid = b.source_rowid
                       AND a.row_json = b.row_json)`).get().c;
    if (landed !== total) throw new Error(`codex 键迁移归档只落地 ${landed}/${total} 行：${target}`);
    db.exec(`DROP TABLE main.${ARCHIVE_TABLE}`);
    moved = total;
  } finally {
    db.exec('DETACH DATABASE keyarchive');
  }
  // 腾出的页要 VACUUM 才还给文件系统；失败只是主库文件暂时不缩（空闲页仍会被后续写入复用），
  // 日备是 VACUUM INTO 的紧凑副本，不受影响。
  try { db.exec('VACUUM'); } catch { /* 并发占锁：留给文件内空闲页复用 */ }
  return { moved, path: target };
}
