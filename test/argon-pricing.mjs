import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { aggregateCosts, computeCosts } from '../src/pricing.js';

export async function testArgonPricing(ok) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE events (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, cached_input INTEGER, cache_write INTEGER, output_tokens INTEGER)');
    const now = Date.UTC(2026, 9, 14, 1);
    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)').run(now, 'antigravity', 'gemini-4-argon', 1e6, 1e6, 0, 1e6);
    const intro = aggregateCosts(db, 0, { rate: 1, now });
    assert.equal(intro.cny, 12.1);
    assert.deepEqual(intro.unpriced, []);
    ok('Argon 官方优惠价格回退：输入+缓存+输出 12.1 USD/M', true);
    assert.equal(aggregateCosts(db, 0, { rate: 1, now: Date.UTC(2026, 10, 30, 23, 59, 59) }).cny, 12.1);
    assert.equal(aggregateCosts(db, 0, { rate: 1, now: Date.UTC(2026, 11, 1) }).cny, 24.2);
    ok('Argon 2026-12-01 起切换官方标准价格', true);
    const custom = aggregateCosts(db, 0, { rate: 9, now, table: { 'gemini-4-argon': { currency: 'CNY', input_miss: 1, input_hit: 2, output: 3 } } });
    assert.equal(custom.cny, 6);
    ok('Argon 用户自定义单价仍优先于官方回退', true);
    const chart = await computeCosts(db, 30, { now });
    const amount = chart.by_day.reduce((sum, day) => sum + (day.models['gemini-4-argon'] || 0), 0);
    assert.ok(amount > 0);
    assert.ok(Math.abs(amount - chart.today_cny) < 1e-8);
    assert.ok(!chart.unpriced.includes('gemini-4-argon'));
    ok('Argon 进入按天费用图，与费用卡一致且不再未配价', true);
  } finally { db.close(); }
}
