import test from 'node:test';
import assert from 'node:assert/strict';
import { childrenOf, deferred, scheduleHookHarness } from './hook-harness.js';

const records = Array.from({ length: 100 }, (_, index) => ({ id: `r${index}`, scheduled_at: '2026-10-01T00:00:00Z', status: 'done' }));
const inserted = { id: 'new-run', scheduled_at: '2026-10-02T00:00:00Z', status: 'done' };
const refreshed = [inserted, ...records];
function fixture() {
  const requests = [];
  const api = { runs: (id, offset = 0) => { const request = { ...deferred(), id, offset }; requests.push(request); return request.promise; } };
  const hook = scheduleHookHarness('../../../src/features/schedules/components/ScheduleDialog.jsx', 'RunHistory', { id: 's', api, revision: 'r0:running' }, { ErrorState: 'error-state' });
  return { hook, requests };
}
const ids = (f) => childrenOf(f.hook.result, 'div').map((row) => row.props.key);
const moreButton = (f) => childrenOf(f.hook.result, 'button')[0];

for (const order of ['old-page-first', 'new-first-page-first']) test(`history revision owns all offsets and finally handlers: ${order}`, async () => {
  const f = fixture();
  f.requests[0].resolve(records.slice(0, 50)); await f.hook.settle();
  assert.equal(moreButton(f).props.disabled, false);
  const oldPage = moreButton(f).props.onClick(); await f.hook.settle();
  assert.equal(f.requests[1].offset, 50);
  f.hook.update({ revision: 'new-run:done' }); await f.hook.settle();
  assert.deepEqual(ids(f), []);
  assert.equal(moreButton(f), undefined);
  assert.equal(f.requests[2].offset, 0);
  if (order === 'old-page-first') {
    f.requests[1].resolve(records.slice(50)); await oldPage; await f.hook.settle();
    assert.deepEqual(ids(f), []);
    assert.ok(childrenOf(f.hook.result, 'p').some((row) => row.props.children.includes('Loading…')), 'old finally must not clear first-page busy');
    f.requests[2].resolve(refreshed.slice(0, 50)); await f.hook.settle();
  } else {
    f.requests[2].resolve(refreshed.slice(0, 50)); await f.hook.settle();
    const newPage = moreButton(f).props.onClick(); await f.hook.settle();
    f.requests[1].resolve(records.slice(50)); await oldPage; await f.hook.settle();
    assert.deepEqual(ids(f), refreshed.slice(0, 50).map((row) => row.id));
    assert.equal(moreButton(f).props.disabled, true, 'old finally must not clear new pagination busy');
    f.requests[3].resolve(refreshed.slice(50, 100)); await newPage; await f.hook.settle();
  }
  while (moreButton(f)) {
    const page = moreButton(f).props.onClick(); await f.hook.settle();
    const request = f.requests.at(-1);
    request.resolve(refreshed.slice(request.offset, request.offset + 50));
    await page; await f.hook.settle();
  }
  assert.deepEqual(ids(f), refreshed.map((row) => row.id), 'exact order and complete ID set, including boundary r49 and new record');
  assert.equal(new Set(ids(f)).size, 101);
  assert.deepEqual(f.requests.map((request) => request.offset), [0, 50, 0, 50, 100]);
  f.hook.unmount();
});

test('stale pagination error and superseded first page cannot change history or error', async () => {
  const f = fixture();
  f.requests[0].resolve(records.slice(0, 50)); await f.hook.settle();
  const oldPage = moreButton(f).props.onClick(); await f.hook.settle();
  f.hook.update({ revision: 'one' });
  f.hook.update({ revision: 'two' });
  f.requests[3].resolve(refreshed.slice(0, 50)); await f.hook.settle();
  f.requests[2].resolve(records.slice(0, 50));
  f.requests[1].reject(new Error('stale failure'));
  await oldPage; await f.hook.settle();
  assert.deepEqual(ids(f), refreshed.slice(0, 50).map((row) => row.id));
  assert.equal(childrenOf(f.hook.result, 'error-state').length, 0);
  assert.equal(moreButton(f).props.disabled, false);
  f.hook.unmount();
});

test('current pagination failure is visible and retry uses the same offset', async () => {
  const f = fixture();
  f.requests[0].resolve(records.slice(0, 50)); await f.hook.settle();
  const page = moreButton(f).props.onClick(); await f.hook.settle();
  f.requests[1].reject(new Error('current failure')); await page; await f.hook.settle();
  assert.equal(childrenOf(f.hook.result, 'error-state')[0].props.detail, 'current failure');
  assert.equal(ids(f).length, 50);
  const retry = moreButton(f).props.onClick(); await f.hook.settle();
  assert.equal(f.requests[2].offset, 50);
  f.requests[2].resolve(records.slice(50)); await retry; await f.hook.settle();
  assert.deepEqual(ids(f), records.map((row) => row.id));
  assert.equal(childrenOf(f.hook.result, 'error-state').length, 0);
  f.hook.unmount();
});
