import path from 'node:path';
import { readdirSync } from 'node:fs';

/** Desktop Cowork data roots. No SQLite/LevelDB or credential access. */
export function coworkRoots(home, {
  platform = process.platform, env = process.env, pathMod = path, readDir = readdirSync,
} = {}) {
  const bases = [];
  if (platform === 'darwin') bases.push(pathMod.join(home, 'Library/Application Support/Claude'));
  if (platform === 'win32') {
    bases.push(pathMod.join(env.APPDATA || pathMod.join(home, 'AppData/Roaming'), 'Claude'));
    const packages = pathMod.join(env.LOCALAPPDATA || pathMod.join(home, 'AppData/Local'), 'Packages');
    let entries = [];
    try { entries = readDir(packages, { withFileTypes: true }); } catch { /* no MSIX install */ }
    for (const entry of entries) {
      if (entry.isDirectory() && /^Claude_[^/\\]+$/i.test(entry.name)) {
        bases.push(pathMod.join(packages, entry.name, 'LocalCache/Roaming/Claude'));
      }
    }
  }
  return [...new Set(bases.map(base => pathMod.join(base, 'local-agent-mode-sessions')))];
}

/** Recognize the observed agent/local_ditto layout, excluding outputs and arbitrary JSONL. */
export function isCoworkUsagePath(file, pathMod = path) {
  const parts = pathMod.normalize(file).split(pathMod.sep);
  const index = parts.lastIndexOf('local-agent-mode-sessions');
  if (index < 0) return false;
  const rest = parts.slice(index + 1);
  if (rest[2] !== 'agent' || !/^local_ditto_.+/.test(rest[3] || '')) return false;
  return (rest.length === 5 && rest[4] === 'audit.jsonl') ||
    (rest[4] === '.claude' && rest[5] === 'projects' && rest.length >= 8 && file.endsWith('.jsonl'));
}

export function matchClaudeFile(name, file) {
  if (!name.endsWith('.jsonl')) return false;
  // CLI / manually mirrored roots keep their existing discovery behavior.
  return !path.normalize(file).split(path.sep).includes('local-agent-mode-sessions') || isCoworkUsagePath(file);
}

/** Prune generated outputs, plugins and other Desktop data before recursive traversal. */
export function descendClaudeDir(dir, pathMod = path) {
  const parts = pathMod.normalize(dir).split(pathMod.sep);
  const index = parts.lastIndexOf('local-agent-mode-sessions');
  if (index < 0) return true;
  const rest = parts.slice(index + 1);
  if (rest.length <= 2) return true;
  if (rest[2] !== 'agent') return false;
  if (rest.length === 3) return true;
  if (!/^local_ditto_.+/.test(rest[3])) return false;
  if (rest.length === 4) return true;
  return rest[4] === '.claude' && (rest.length === 5 || rest[5] === 'projects');
}
