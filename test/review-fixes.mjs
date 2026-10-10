/**
 * 回归：
 *  1. 采集写入先记下、事务内同步回放——解析期间同一连接上的轮询器写入
 *     不会落进采集事务、随它的回滚一起消失（此前 saveQuota 会被回滚掉）
 *  2. 榜单公开展示的模型 / 工具名不能成为绕过昵称清洗的自由文本通道；昵称剥除双向控制符
 *  3. Cursor CSV 引号字段内的换行 / 逗号不切分记录
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import * as client from '../src/leaderboard.js';
import * as cloud from '../cloud/lib.js';
import { parseCursorCsv } from '../src/cursorUsage.js';

const ev = (key, output = 5) => ({
  ts: Date.now(), tool: 'claude-code', model: 'm', session_id: 's',
  input_tokens: 10, output_tokens: output, total_tokens: 10 + output, dedup_key: key,
});

export async function testReviewFixes(ok) {
  console.log('\n[review] 采集事务隔离 / 榜单文本 / Cursor CSV');

  const dir = mkdtempSync(join(tmpdir(), 'tw-review-'));
  const store = new Store(join(dir, 'r.db'));
  const count = () => store.db.prepare('SELECT COUNT(*) n FROM events').get().n;
  try {
    // 解析阶段：代理只记录，不落库
    const staged = store.stageWrites();
    ok('代理写入恒返回 0', staged.store.insertEvent(ev('k1')) === 0);
    staged.store.insertEvent(ev('k1', 9)); // 同 key 更大输出：回放时补齐
    staged.store.insertToolCall({ ts: 1, tool: 'claude-code', name: 'Read', dedup_key: 't1' });
    ok('解析阶段不写库', count() === 0);
    ok('代理上的读操作直通', staged.store.getQuota('none') === null);

    // 解析的 await 间隙里轮询器写入；随后回放失败、整份回滚
    await new Promise(r => setTimeout(r, 5));
    store.saveQuota('claude-usage', Date.now(), { five_hour: { used_percent: 42 } });
    store.db.exec('BEGIN');
    staged.replay();
    store.db.exec('ROLLBACK');
    ok('采集回滚不撤销轮询器写入', store.getQuota('claude-usage')?.data.five_hour.used_percent === 42);
    ok('采集回滚撤销本文件写入', count() === 0);

    // 正常提交：新增数由回放返回，先插后补语义保持
    store.db.exec('BEGIN');
    const inserted = staged.replay();
    store.db.exec('COMMIT');
    ok('回放返回真实新增数', inserted === 1, `inserted=${inserted}`);
    ok('回放按顺序执行（后到的大输出补齐同 key）',
      store.db.prepare("SELECT output_tokens o FROM events WHERE dedup_key = 'k1'").get().o === 9);

    // antigravity 补正走 store 方法，可被代理
    store.correctEventInput('k1', 100);
    ok('correctEventInput 重算 total',
      store.db.prepare("SELECT total_tokens t FROM events WHERE dedup_key = 'k1'").get().t === 109);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }

  // 榜单：模型 / 工具名两侧同一规则
  const report = {
    models: [['glm-5.3', 50], ['加微信 xyz 领福利', 20], ['visit t.me/foo', 10],
      ['buy-at-shop.com', 5], ['openrouter/x-ai/grok-4', 5], ['admin-model', 5]],
    tools: [['claude-code', 60], ['spam tool', 40]],
    models_by_period: { day: [['https://x.io', 90]] },
  };
  const c = client.clampReport(report), s = cloud.clampReport(report);
  ok('榜单模型名只留标识符形状', JSON.stringify(c.models.map(m => m[0]))
    === JSON.stringify(['glm-5.3', 'openrouter/x-ai/grok-4']), JSON.stringify(c.models));
  ok('榜单工具名同样过滤', c.tools.length === 1 && c.tools[0][0] === 'claude-code');
  ok('周期模型同样过滤', c.models_by_period.day.length === 0);
  ok('模型 / 工具过滤两侧全等', JSON.stringify(c) === JSON.stringify(s));
  for (const raw of ['‮evil', 'a⁦b⁩c', 'x⁠y']) {
    const want = raw.replace(/[‪-‮⁠-⁤⁦-⁩]/g, '');
    ok(`昵称剥除双向/不可见控制符 ${JSON.stringify(raw)}`,
      client.sanitizeName(raw) === want && cloud.sanitizeName(raw) === want);
  }

  // Cursor CSV：引号字段里带换行、逗号，且 CRLF 行尾
  const csv = 'Date,Kind,Model,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens\r\n'
    + '"2026-10-01T10:00:00Z","note\nwith, comma",claude-4.5-sonnet,10,20,30,40\r\n'
    + '2026-10-01T11:00:00Z,x,gpt-5,1,2,3,4\r\n';
  const rows = parseCursorCsv(csv);
  ok('CSV 引号内换行不拆记录', rows.length === 2 && rows[0].total_tokens === 100 && rows[1].model === 'gpt-5',
    JSON.stringify(rows));
  ok('CSV dedup 指纹格式不变（升级不重复计数）',
    rows[0].dedup_key === 'cursor:2026-10-01T10:00:00Z|claude-4.5-sonnet|10|20|30|40:0');
}
