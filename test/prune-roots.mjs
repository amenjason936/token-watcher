/**
 * 已消失文件的游标清理按"路径段"归属 root，而不是字符串前缀：
 * root `~/.foo` 不能认领 `~/.foo-bar` 下的文件，否则清理会删掉兄弟 root 的游标行。
 */
import { posix, win32 } from 'node:path';

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
}
