/**
 * 已消失文件的游标清理按"路径段"归属 root，而不是字符串前缀：
 * root `~/.foo` 不能认领 `~/.foo-bar` 下的文件，否则清理会删掉兄弟 root 的游标行。
 */
import { posix, win32, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

export async function testPruneRoots(ok) {
  console.log('\n[prune] root 归属按路径段匹配');
  const { isUnderRoot } = await import('../src/scanner.js');
  const P = (p, r) => isUnderRoot(p, r, posix);
  ok('root 自身属于 root（sqlite 源的 root 就是文件）', P('/h/.zcode/db.sqlite', '/h/.zcode/db.sqlite'));
  ok('root 下的文件属于 root', P('/h/.foo/a/x.jsonl', '/h/.foo'));
  ok('同前缀的兄弟目录不属于 root', !P('/h/.foo-bar/x.jsonl', '/h/.foo'));
  ok('同前缀的兄弟文件不属于 root', !P('/h/.foox', '/h/.foo'));
  ok('root 带尾部分隔符也成立', P('/h/.foo/x.jsonl', '/h/.foo/') && !P('/h/.foo-bar/x.jsonl', '/h/.foo/'));
  const W = (p, r) => isUnderRoot(p, r, win32);
  ok('Windows 路径：root 下的文件属于 root', W('C:\\h\\.qoder\\projects\\a.jsonl', 'C:\\h\\.qoder\\projects'));
  ok('Windows 路径：同前缀兄弟不属于 root', !W('C:\\h\\.qoder-cn\\projects\\a.jsonl', 'C:\\h\\.qoder'));

  // 清理本身：root `.foo` 的未见文件被清，兄弟 root `.foo-bar` 的游标行与全部 events 保留
  const { Scanner } = await import('../src/scanner.js');
  const { Store } = await import('../src/store.js');
  const T = mkdtempSync(join(tmpdir(), 'tw-prune-'));
  const store = new Store(join(T, 'x.db'));
  try {
    const live = join(T, '.foo'), gone = join(live, 'a', 'x.jsonl');
    const seen = join(live, 'seen.jsonl'), sibling = join(T, '.foo-bar', 'b', 'y.jsonl');
    for (const p of [gone, seen, sibling]) store.saveFile({ path: p, tool: 'claude', size: 1, mtime_ms: 1, offset: 1 });
    store.insertEvent({ ts: 1, tool: 'claude', total_tokens: 7, dedup_key: 'prune-roots:e1' });
    const n = new Scanner(store)._pruneMissingFiles('claude', new Set([seen]), [live]);
    const rows = new Set(store.db.prepare('SELECT path FROM files').all().map(r => r.path));
    ok('清理删掉 root 下未见的游标行', n === 1 && !rows.has(gone), `n=${n}`);
    ok('清理保留同前缀兄弟 root 的游标行', rows.has(sibling) && rows.has(seen));
    ok('清理不动 events', store.db.prepare('SELECT COUNT(*) n FROM events').get().n === 1);
  } finally {
    store.close();
    rmSync(T, { recursive: true, force: true });
  }
}
