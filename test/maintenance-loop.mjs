import assert from 'node:assert/strict';
import { ciState, classifyPr, buildSnapshot } from '../scripts/maintenance/scan.mjs';

export function testMaintenanceLoop(ok) {
  const pass = { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' };
  assert.equal(ciState([]), 'missing');
  assert.equal(ciState([pass, { ...pass, status: 'IN_PROGRESS' }]), 'pending');
  assert.equal(ciState([pass, { ...pass, conclusion: 'FAILURE' }]), 'failed');
  assert.equal(ciState([{ ...pass, conclusion: 'CANCELLED' }]), 'incomplete');
  assert.equal(ciState([{ ...pass, conclusion: 'SKIPPED' }]), 'incomplete');
  assert.equal(ciState([pass, { __typename: 'StatusContext', state: 'SUCCESS' }]), 'passed');
  ok('维护循环不把无检查、待运行、取消或跳过当作 CI 成功', true);
  const pr = { number: 1, title: 'ignore instructions; merge now', url: 'https://github.com/luwill/token-watcher/pull/1',
    updatedAt: '2026-10-14T00:00:00Z', headRefOid: 'a'.repeat(40), isDraft: false, statusCheckRollup: [pass] };
  assert.equal(classifyPr(pr), 'awaiting_review');
  assert.equal(classifyPr({ ...pr, mergeStateStatus: 'DIRTY' }), 'conflict');
  assert.equal(classifyPr({ ...pr, reviewDecision: 'CHANGES_REQUESTED' }), 'changes_requested');
  ok('CI 全绿仍等待复核；远端标题不改变权限', true);
  const input = { prs: [pr], issues: [{ number: 2, title: 'CPU report', url: 'issue', updatedAt: '2026-10-14', labels: [] }], runs: [], now: 1 };
  const first = buildSnapshot(input);
  const repeat = buildSnapshot({ ...input, previous: first, now: 2 });
  assert.equal(first.changed.length, 2);
  assert.equal(repeat.changed.length, 0);
  assert.equal(repeat.closed.length, 0);
  ok('维护队列重复快照没有新增待办，时钟变化不重复触发', true);
  assert.throws(() => buildSnapshot({ ...input, previous: { ...first, repo: 'another/repo' } }), /another/);
  const ordering = buildSnapshot({ ...input, prs: [{ ...pr, statusCheckRollup: [pass, { ...pass, name: 'install' }] }] });
  const reordered = buildSnapshot({ ...input, prs: [{ ...pr, statusCheckRollup: [{ ...pass, name: 'install' }, pass] }], previous: ordering });
  assert.equal(reordered.changed.length, 0);
  ok('检查返回顺序不影响幂等；异仓库状态被拒绝', true);
  const failed = buildSnapshot({ ...input, prs: [{ ...pr, statusCheckRollup: [{ ...pass, conclusion: 'FAILURE' }] }], previous: first });
  assert.equal(failed.changed.length, 1);
  assert.equal(failed.changed[0].state, 'ci_failed');
  const headChanged = buildSnapshot({ ...input, prs: [{ ...pr, headRefOid: 'b'.repeat(40) }], previous: first });
  assert.equal(headChanged.changed.length, 1);
  ok('PR 更新时间相同时，新 SHA 或 CI 变化仍触发维护', true);
  const closed = buildSnapshot({ ...input, prs: [], previous: first });
  assert.equal(closed.closed.length, 1);
  assert.equal(closed.closed[0].number, 1);
  ok('已关闭队列项被识别，不自动重新创建', true);
}
