/**
 * 服务生命周期 / 健康自检 / 静态文件回归。
 * 进程内用例放到临时 HOME + 离线的子进程里跑：startServer 会加载牌价、排备份定时器，
 * 不能读写调用方真实的 ~/.tokenmeter。子进程逐条回报，父进程转交 ok()。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';

const SELF = fileURLToPath(import.meta.url);

/** 首轮解析失败的源不能被当成"无数据" */
async function healthCases(ok) {
  const { Store } = await import('../src/store.js');
  const { computeHealth } = await import('../src/server.js');
  const dir = mkdtempSync(join(tmpdir(), 'tw-health-'));
  const st = new Store(join(dir, 'h.db'));
  try {
    st.saveFile({ path: '/x/a.jsonl', tool: 'claude-code', size: 10, mtime_ms: Date.now(), offset: 0 });
    const h = (stats) => computeHealth(st.db, stats).find(r => r.tool === 'claude-code');
    ok('有文件、无事件、本轮解析失败 → error 而非 empty',
      h({ 'claude-code': { parse_errors: 1, last_error: 'boom' } }).status === 'error',
      JSON.stringify(h({ 'claude-code': { parse_errors: 1 } })));
    ok('无文件无错误仍是 empty', h({}).status === 'empty');
    st.insertEvent({ ts: Date.now(), tool: 'claude-code', total_tokens: 5, dedup_key: 'h1' });
    ok('有事件且有错误仍是 error', h({ 'claude-code': { parse_errors: 2 } }).status === 'error');
  } finally { st.close(); rmSync(dir, { recursive: true, force: true }); }
}

/** 端口被占时的重试不能把后台任务再起一份 */
async function lifecycleCases(ok) {
  const { EventEmitter } = await import('node:events');
  const { Store } = await import('../src/store.js');
  const { startServer } = await import('../src/server.js');
  const dir = mkdtempSync(join(tmpdir(), 'tw-life-'));
  const st = new Store(join(dir, 'l.db'));
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '127.0.0.1', r));
  const busy = blocker.address().port;
  const starts = { balance: 0, claude: 0, cursor: 0, zcode: 0 };
  const poller = (k) => ({ start() { starts[k]++; }, status() { return []; } });
  const pollers = { balancePoller: poller('balance'), claudePoller: poller('claude'),
    cursorPoller: poller('cursor'), zcodePoller: poller('zcode') };
  const scanner = new EventEmitter(); scanner.stats = {};
  const timers = [];
  const realInterval = globalThis.setInterval;
  globalThis.setInterval = (fn, ms, ...a) => { const t = realInterval(fn, ms, ...a); timers.push(ms); return t; };
  let server;
  try {
    const err = await startServer({ store: st, scanner, port: busy, ...pollers }).then(() => null, e => e);
    ok('被占端口 listen 失败照常抛给调用方', err?.code === 'EADDRINUSE', String(err?.code));
    ok('失败的那次不启动任何轮询器', Object.values(starts).every(n => n === 0), JSON.stringify(starts));
    ok('失败的那次不挂 update 监听', scanner.listenerCount('update') === 0, String(scanner.listenerCount('update')));
    ok('失败的那次不排定时任务（备份/榜单/牌价）', timers.length === 0, JSON.stringify(timers));
    server = await startServer({ store: st, scanner, port: 0, ...pollers });
    ok('成功后每个轮询器恰好启动一次', Object.values(starts).every(n => n === 1), JSON.stringify(starts));
    ok('成功后 update 监听恰好一份', scanner.listenerCount('update') === 2, String(scanner.listenerCount('update')));
    const hourly = timers.filter(ms => ms === 3600_000).length;
    ok('榜单上报定时器只排一份', hourly === 1, JSON.stringify(timers));
  } finally {
    globalThis.setInterval = realInterval;
    await new Promise(r => blocker.close(r));
    if (server) await new Promise(r => server.close(r));
    st.close(); rmSync(dir, { recursive: true, force: true });
  }
  await productionShapeLifecycle(ok);
}

/** 生产形态：bin 只传 balancePoller，Claude / Cursor / ZCode 轮询器由 startServer 自建；一次性定时器同样计数 */
async function productionShapeLifecycle(ok) {
  const { EventEmitter } = await import('node:events');
  const { Store } = await import('../src/store.js');
  const { startServer } = await import('../src/server.js');
  const classes = {
    claude: (await import('../src/claudeUsage.js')).ClaudeUsagePoller,
    cursor: (await import('../src/cursorUsage.js')).CursorUsagePoller,
    zcode: (await import('../src/zcodeQuota.js')).ZcodeQuotaPoller,
  };
  const starts = { balance: 0, claude: 0, cursor: 0, zcode: 0 };
  const realStarts = {};
  for (const [k, C] of Object.entries(classes)) {
    realStarts[k] = C.prototype.start;
    C.prototype.start = function () { starts[k]++; };
  }
  // 离线时不排 24h 牌价刷新，定时器计数才确定；不管调用方 env，这里显式离线
  const savedOffline = process.env.TOKENMETER_OFFLINE;
  process.env.TOKENMETER_OFFLINE = '1';
  const dir = mkdtempSync(join(tmpdir(), 'tw-life2-'));
  const st = new Store(join(dir, 'l.db'));
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '127.0.0.1', r));
  const scanner = new EventEmitter(); scanner.stats = {};
  const balancePoller = { start() { starts.balance++; }, status() { return []; } };
  const timers = [];
  const realInterval = globalThis.setInterval, realTimeout = globalThis.setTimeout;
  globalThis.setInterval = (fn, ms, ...a) => { timers.push(`i${ms}`); return realInterval(fn, ms, ...a); };
  globalThis.setTimeout = (fn, ms, ...a) => { timers.push(`t${ms}`); return realTimeout(fn, ms, ...a); };
  let server;
  try {
    const err = await startServer({ store: st, scanner, port: blocker.address().port, balancePoller }).then(() => null, e => e);
    const afterFail = [...timers];
    ok('生产形态：失败的那次不建也不启动任何轮询器、不排任何定时器',
      err?.code === 'EADDRINUSE' && Object.values(starts).every(n => n === 0) && afterFail.length === 0,
      JSON.stringify({ starts, afterFail }));
    server = await startServer({ store: st, scanner, port: 0, balancePoller });
    ok('生产形态：成功后自建轮询器各启动一次', Object.values(starts).every(n => n === 1), JSON.stringify(starts));
    const count = (t) => timers.filter(x => x === t).length;
    ok('生产形态：每日备份 / 首次备份 / 首轮榜单 / 每小时榜单各一份',
      count('i86400000') === 1 && count('t30000') === 1 && count('t90000') === 1 && count('i3600000') === 1,
      JSON.stringify(timers));
  } finally {
    globalThis.setInterval = realInterval; globalThis.setTimeout = realTimeout;
    for (const [k, C] of Object.entries(classes)) C.prototype.start = realStarts[k];
    if (savedOffline === undefined) delete process.env.TOKENMETER_OFFLINE; else process.env.TOKENMETER_OFFLINE = savedOffline;
    await new Promise(r => blocker.close(r));
    if (server) await new Promise(r => server.close(r));
    st.close(); rmSync(dir, { recursive: true, force: true });
  }
}


/** stat 之后文件消失，响应要收尾而不是挂住 */
async function serveFileCases(ok) {
  const { serveFile } = await import('../src/server.js');
  ok('serveFile 已导出供测试', typeof serveFile === 'function');
  if (typeof serveFile !== 'function') return;
  const srv = http.createServer((req, res) => serveFile(res, '/nonexistent/vanished.js', undefined,
    { statImpl: async () => ({ isFile: () => true, size: 10 }) }));
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('hang'), 1500);
    http.get(`http://127.0.0.1:${srv.address().port}/`, (res) => {
      res.resume();
      res.on('end', () => { clearTimeout(timer); resolve('end'); });
      res.on('error', () => { clearTimeout(timer); resolve('closed'); });
      res.on('aborted', () => { clearTimeout(timer); resolve('closed'); });
    }).on('error', () => { clearTimeout(timer); resolve('closed'); });
  });
  await new Promise(r => srv.close(r));
  ok('stat 后文件消失：连接被收尾而不是挂住', outcome !== 'hang', outcome);
}

export async function testServerLifecycle(ok) {
  console.log('\n[服务] 生命周期 / 健康自检 / 静态文件');
  const home = mkdtempSync(join(tmpdir(), 'tw-server-'));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SELF, 'child'], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, TOKENMETER_OFFLINE: '1', TOKENMETER_NO_KEYCHAIN: '1' } });
  rmSync(home, { recursive: true, force: true });
  const lines = r.stdout.split('\n').filter(l => /^(PASS|FAIL)\t/.test(l));
  ok('服务用例子进程正常结束', r.status === 0 && lines.length >= 15, (r.stderr || '').slice(0, 400));
  for (const l of lines) { const [verdict, name, detail = ''] = l.split('\t'); ok(name, verdict === 'PASS', detail); }
}

if (process.argv[2] === 'child') {
  const ok = (name, cond, detail = '') =>
    console.log(`${cond ? 'PASS' : 'FAIL'}\t${name}\t${String(detail).replace(/[\t\n]/g, ' ')}`);
  try { await healthCases(ok); await lifecycleCases(ok); await serveFileCases(ok); process.exit(0); }
  catch (err) { console.error(err); process.exit(1); }
}
