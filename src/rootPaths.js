import path from 'node:path';

/** Shared CLI/config validation; pathMod also lets tests exercise Windows on POSIX. */
export function normalizeExtraRoot(value, home, pathMod = path) {
  if (typeof value !== 'string' || !(value = value.trim())) return null;
  if (value.startsWith('~/') || (pathMod.sep === '\\' && value.startsWith('~\\'))) {
    value = pathMod.join(home, value.slice(2));
  }
  return pathMod.isAbsolute(value) ? pathMod.normalize(value) : null;
}
