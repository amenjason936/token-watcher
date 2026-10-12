/**
 * 订阅 ROI 缺价：有用量却查不到牌价时比值未知（不是 ×0），部分缺价标注下限；
 * 积分制工具不算缺价；榜单 ROI 只合计比值有意义的条目。面板与 CLI 同口径展示。
 * 读订阅 / 牌价的用例在临时 HOME 子进程里跑，不碰宿主 ~/.tokenmeter。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const SELF = fileURLToPath(import.meta.url);

/** 子进程（临时 HOME）里跑 ROI，牌价与订阅都来自 fixture */
async function roiChild() {
  const { Store } = await import('../src/store.js');
  const { computeRoi } = await import('../src/roi.js');
  const { buildLeaderboardReport } = await import('../src/leaderboard.js');
  const st = new Store(join(process.env.HOME, '.tokenmeter', 'tokenmeter.db'));
  const now = Date.now();
  const ev = (tool, model, k) => st.insertEvent({ ts: now - 1000, tool, model,
    input_tokens: 1_000_000, output_tokens: 1_000_000, total_tokens: 2_000_000, dedup_key: `roi:${k}` });
  ev('kimi', 'kimi-k3', 'priced');                 // 种子表有价：20 + 100 = ¥120
  ev('pi', 'mystery-model-zz', 'unpriced');         // 无价
  ev('qoder', 'kimi-k3', 'mix-priced');             // 部分有价
  ev('qoder', 'mystery-model-zz', 'mix-unpriced');
  // 积分制工具：有积分账，又混进无牌价 token 事件 → 仍按积分展示，不标缺价
  st.insertCredit({ ts: now - 1000, tool: 'workbuddy', amount: 12.5, dedup_key: 'roi:credit' });
  ev('workbuddy', 'qmodel_38max', 'credit-unpriced');
  const r = await computeRoi(st.db, { rate: 7 });
  const by = Object.fromEntries(r.entries.map(e => [e.tool, e]));
  assert.equal(by.kimi.ratio, 120 / 49, 'priced ratio');
  assert.equal(by.kimi.price_missing ?? null, null, 'priced has no gap');
  assert.equal(by.pi.ratio, null, 'unpriced ratio must be unknown, not 0');
  assert.equal(by.pi.price_missing, 'all', 'unpriced flagged');
  assert.equal(by.qoder.price_missing, 'partial', 'partial flagged');
  assert(by.qoder.ratio > 0, 'partial keeps a lower-bound ratio');
  assert.equal(by.workbuddy.credits, 12.5, 'credit tool keeps its credits');
  assert.equal(by.workbuddy.price_missing, null, 'credit tool is not "missing price"');
  assert.equal(by.workbuddy.ratio, null, 'credit tool ratio stays n/a');
  // 榜单 ROI 不把"全缺价"的 0 掺进分子分母
  const rep = await buildLeaderboardReport(st, { now, roiFn: async () => r });
  assert.equal(rep.roi_ratio, Math.round(((120 + by.qoder.api_cny) / (49 + 30)) * 10) / 10, 'leaderboard ROI excludes unpriced');
  st.close();
}

export async function testRoiPriceGaps(ok) {
  console.log('\n[ROI] 缺价 / 积分制 / 榜单比值 / 面板与 CLI');
  const home = mkdtempSync(join(tmpdir(), 'tw-roi-'));
  mkdirSync(join(home, '.tokenmeter'), { recursive: true });
  writeFileSync(join(home, '.tokenmeter', 'subscriptions.json'), JSON.stringify({ monthly: {
    kimi: { price_cny: 49 }, pi: { price_cny: 100 }, qoder: { price_cny: 30 }, workbuddy: { price_cny: 20 } } }));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SELF, 'roi'], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, TOKENMETER_OFFLINE: '1', TOKENMETER_NO_KEYCHAIN: '1' } });
  ok('ROI：无牌价显示未知并标注缺价，部分缺价保留下限并标注，榜单 ROI 不掺缺价条目',
    r.status === 0, (r.stderr || r.stdout).slice(0, 400));
  // CLI 展示同一份 ROI：同一临时 HOME 下跑真实的 tokenwatcher roi
  const cli = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning',
    fileURLToPath(new URL('../bin/tokenwatcher.js', import.meta.url)), 'roi'], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, TOKENMETER_OFFLINE: '1', TOKENMETER_NO_KEYCHAIN: '1' } });
  ok('CLI roi 对全缺价显示"缺价"、对部分缺价标注偏低',
    cli.status === 0 && cli.stdout.includes('缺价（模型无牌价）') && cli.stdout.includes('部分缺价，偏低') && !/×0\.0/.test(cli.stdout),
    (cli.stdout + cli.stderr).slice(0, 400));
  rmSync(home, { recursive: true, force: true });

  // 面板真实渲染路径接到 roiBadge（旧的内联三元式会把全缺价画成 "—"）
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const roiSection = app.slice(app.indexOf('// 订阅 ROI：'), app.indexOf("} else if (roi?.hint)"));
  // 渲染级：在 vm 里执行面板真实的 ROI 片段，喂真实 computeRoi 形状的条目，看最终 HTML
  {
    const vm = await import('node:vm');
    const { esc, roiBadge: badgeFn } = await import('../web/lib/format.js');
    const ctx = vm.createContext({ esc, roiBadge: badgeFn, lastSummary: { roi: { configured: true, entries: [
      { tool: 'kimi', name: 'Kimi 会员', api_cny: 120, credits: null, paid_cny: 49, ratio: 120 / 49, price_missing: null },
      { tool: 'pi', name: 'Pi 订阅', api_cny: 0, credits: null, paid_cny: 100, ratio: null, price_missing: 'all' },
      { tool: 'qoder', name: 'Qoder', api_cny: 120, credits: null, paid_cny: 30, ratio: 4, price_missing: 'partial' },
    ] } } });
    vm.runInContext(`var whtml = '';\n${roiSection}}`, ctx);
    const html = ctx.whtml;
    const piRow = html.split('q-meta').find(x => x.includes('Pi 订阅')) || '';
    ok('面板渲染：全缺价条目在列且显示"无牌价 / 缺价"而非 ¥0 或 ×0',
      piRow.includes('缺价') && piRow.includes('无牌价') && !/¥0\.0000|×0\.0/.test(piRow), piRow.slice(0, 300));
    ok('面板渲染：三条订阅都在、部分缺价有标注、有价条目照常',
      ['Kimi 会员', 'Pi 订阅', 'Qoder'].every(n => html.includes(n)) && html.includes('部分缺价') && html.includes('×2.4 划算'),
      html.slice(0, 300));
  }
  ok('面板 ROI 卡逐条用 roiBadge 渲染', /roi\.entries\.map\(e => \{[\s\S]*const badge = roiBadge\(e\);[\s\S]*\$\{badge\}/.test(roiSection)
    && !/e\.ratio == null \? '<span class="dim">—<\/span>'/.test(roiSection), roiSection.slice(0, 160));

  // 前端：缺价徽标
  const { roiBadge } = await import('../web/lib/format.js');
  ok('前端 roiBadge 已导出', typeof roiBadge === 'function');
  if (typeof roiBadge === 'function') {
    ok('全缺价显示"缺价"而非 ×0', roiBadge({ paid_cny: 100, ratio: null, price_missing: 'all' }).includes('缺价'));
    ok('部分缺价标注偏低', /部分缺价/.test(roiBadge({ paid_cny: 100, ratio: 1.5, price_missing: 'partial' })));
    ok('月费未填照旧', roiBadge({ paid_cny: null, ratio: null }).includes('月费未填'));
    ok('有价划算照旧', roiBadge({ paid_cny: 10, ratio: 2 }).includes('×2.0'));
  }

}

if (process.argv[2] === 'roi') {
  try { await roiChild(); process.exit(0); }
  catch (err) { console.error(err); process.exit(1); }
}
