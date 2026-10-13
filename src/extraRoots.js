import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES, HOME, DATA_DIR } from './config.js';

/**
 * `token-watcher extra-roots list|add|remove` —— 多机合并镜像目录的登记台。
 * 只编辑 ~/.tokenmeter/extra-roots.json，校验规则与 config.js 的 applyExtraRoots
 * 一致（工具须已登记且非轮询源；路径须绝对或 ~ 开头）。改完须重启 serve 生效。
 */
const FILE = join(DATA_DIR, 'extra-roots.json');

const readMap = () => {
  try {
    const map = JSON.parse(readFileSync(FILE, 'utf8'));
    return (typeof map === 'object' && map !== null && !Array.isArray(map)) ? map : null;
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`extra-roots.json 无法解析：${err.message}（修复或删除后再操作）`);
    return {};
  }
};

const writeMap = (map) => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(map, null, 2) + '\n');
};

const normalize = (p) => (p.startsWith('~/') ? join(HOME, p.slice(2)) : p);

const usage = (log) => log('用法：tokenwatcher extra-roots list | add <tool> <路径> | remove <tool> <路径>');

export function extraRootsCommand(positionals, { log }) {
  const [sub, tool, rawPath] = positionals;
  try {
    if (sub === 'list' || sub === undefined) {
      const map = readMap();
      const entries = Object.entries(map ?? {}).flatMap(([t, roots]) =>
        (Array.isArray(roots) ? roots : []).map((r) => [t, r]));
      if (!entries.length) {
        log('未配置扩展 root（多台机器用量合并的镜像目录，配方见 README「extra roots」）');
        return true;
      }
      for (const [t, r] of entries) {
        const ok = SOURCES.find(s => s.tool === t && s.kind !== 'poller');
        const live = existsSync(normalize(String(r)));
        log(`${ok ? '' : '✗ 未登记工具 '}${t}  ${r}${ok ? (live ? '' : '（目录暂不存在，首次同步后生效）') : ''}`);
      }
      return true;
    }

    if (sub !== 'add' && sub !== 'remove') { usage(log); return false; }
    if (!tool || !rawPath) { usage(log); return false; }

    const src = SOURCES.find(s => s.tool === tool);
    if (!src) { log(`未登记的工具 "${tool}"（可用：${SOURCES.map(s => s.tool).join(' ')}）`); return false; }
    if (src.kind === 'poller') { log(`${tool} 是账号级轮询源，没有本地目录可扩展`); return false; }

    const path = normalize(rawPath);
    if (!path.startsWith('/')) { log(`路径须为绝对路径或 ~ 开头："${rawPath}"`); return false; }

    const map = readMap();
    const roots = Array.isArray(map[tool]) ? map[tool] : [];
    // remove 允许按文件里的原样（~/…）或展开后的绝对路径匹配
    const stored = roots.find((r) => r === rawPath || normalize(String(r)) === path);

    if (sub === 'add') {
      if (stored) { log(`${tool} 已登记过 ${stored}（无事可做）`); return true; }
      map[tool] = [...roots, rawPath];
      writeMap(map);
      log(`已登记 ${tool} → ${rawPath}（写入 ${FILE}）`);
      if (!existsSync(path)) log('目录暂不存在：先跑一次同步（rsync/Syncthing/手动拷贝），数据到位后自动入库');
    } else {
      if (!stored) { log(`${tool} 没有登记过 ${rawPath}`); return false; }
      map[tool] = roots.filter((r) => r !== stored);
      if (!map[tool].length) delete map[tool];
      writeMap(map);
      log(`已移除 ${tool} → ${stored}（已入库的该镜像历史用量不受影响）`);
    }
    log('重启服务后生效（launchd 托管：launchctl kickstart -k gui/$(id -u)/com.tokenmeter.server；手动运行则重启 serve）');
    return true;
  } catch (err) {
    log(err.message);
    return false;
  }
}
