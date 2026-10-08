/**
 * 模型名归一化：跨源合并同一模型的大小写变体
 * （ZCode 记 GLM-5.3-Flash、WorkBuddy 记 glm-5.3-flash → 统一小写）。
 * 同时与 rates / pricing 的键（全小写）对齐。
 */
// 同一模型的不同 id（路由事实，来源 ccmr models.yaml / 厂商公告）
const ALIASES = {
  'deepseek-flash': 'deepseek-v4.1-flash',     // V4.1 Flash 沿用旧 id
  'deepseek-v4-flash': 'deepseek-v4.1-flash',  // V4 Flash 线已下线，请求路由至 V4.1 Flash
};

// Cursor 账单的两个 id 习惯，都归并到各自主模型：
//  1. 自营代理模型带 cursor- 前缀（cursor-grok-4.6-medium → grok-4.6-…）
//  2. 把 reasoning effort 档写进模型 id（-low/-medium/-high，含 -medium-high 组合）；
//     各厂 effort 档不改变单价，保留后缀既配不上价也无法跨工具合段。
// 迭代剥除以覆盖组合档位；(.+) 保证 'medium'/'-medium' 这类残名不被剥成空串。
const CURSOR_PREFIX = /^cursor-(.+)$/;
const EFFORT_SUFFIX = /^(.+)-(?:low|medium|high)$/;

export function normalizeModel(m) {
  if (typeof m !== 'string') return m;
  let n = m.trim().toLowerCase();
  if (!n) return null;
  n = n.replace(CURSOR_PREFIX, '$1');
  let prev;
  do { prev = n; n = n.replace(EFFORT_SUFFIX, '$1'); } while (n !== prev);
  return ALIASES[n] ?? n;
}
