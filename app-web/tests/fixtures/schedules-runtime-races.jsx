import React from 'react';
import { createRoot } from 'react-dom/client';
import { useSchedulesState } from '../../src/features/schedules/hooks/useSchedules.js';
import { ScheduleDialog } from '../../src/features/schedules/components/ScheduleDialog.jsx';
import '../../styles.css';

// In-memory APIs only: no tasks, models, persisted data or network requests.
window.fetch = async (url) => { throw new Error(`Unexpected request: ${url}`); };
const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
const results = [];
const check = (ok, name) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw new Error(name); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
async function waitFor(test) { for (let i = 0; i < 200 && !test(); i++) await tick(); check(test(), 'state reached'); }
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
const records = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, reason: `r${i}`, scheduled_at: '2026-10-01T00:00:00Z', status: 'done' }));
const updated = [{ id: 'new', reason: 'new', scheduled_at: '2026-10-02T00:00:00Z', status: 'done' }, ...records];
const job = { id: 's', conversation_id: 'owner', message: 'In-memory test', name: 'History', schedule: { kind: 'interval', seconds: 60 }, state: 'active', last_run: { id: 'r0', status: 'running' } };
const root = createRoot(document.getElementById('root'));
let state, emit, listRequests, runRequests, routed;
let api;
const subscribe = (callback) => { emit = callback; return () => {}; };
function Fixture() {
  state = useSchedulesState({ api, subscribe, onRuntimeEvent: () => { routed++; } });
  return <><output data-loading={state.loading}>{state.loading ? 'Loading snapshot' : 'Snapshot ready'}</output>{state.dialog && <ScheduleDialog state={state} api={api} />}</>;
}
const history = () => document.querySelector('.schedule-history');
const ids = () => [...(history()?.querySelectorAll(':scope > div > p') || [])].map((row) => row.textContent);
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
async function scenario(order) {
  root.render(null); await tick();
  listRequests = []; runRequests = []; routed = 0;
  api = {
    list: () => { const request = deferred(); listRequests.push(request); return request.promise; },
    runs: (_id, offset = 0) => { const request = { ...deferred(), offset }; runRequests.push(request); return request.promise; },
  };
  root.render(<Fixture />);
  await waitFor(() => listRequests.length === 1);
  for (let i = 0; i < 200; i++) emit({ type: 'task.event', schedule_id: 's', event: { type: 'llm_answer_delta', delta: 'x' } });
  listRequests[0].resolve([job]);
  await waitFor(() => !state.loading);
  check(listRequests.length === 1 && routed === 200, `${order}: stream does not starve first snapshot`);
  state.openManage('owner'); await waitFor(() => button('History'));
  button('History').click(); await waitFor(() => runRequests.length === 1);
  runRequests[0].resolve(records.slice(0, 50)); await waitFor(() => ids().length === 50);
  button('Load more').click(); await waitFor(() => runRequests.length === 2);
  emit({ type: 'schedule.event', event: { run: { id: 'new', schedule_id: 's', status: 'done' } } });
  await waitFor(() => runRequests.length === 3);
  check(ids().length === 0 && !button('Load more'), `${order}: refresh resets old offset state`);
  if (order === 'old-page-first') {
    runRequests[1].resolve(records.slice(50)); await tick(); await tick();
    check(ids().length === 0 && history().textContent.includes('Loading'), 'old page and finally cannot finish new first-page loading');
    runRequests[2].resolve(updated.slice(0, 50)); await waitFor(() => ids().length === 50);
    button('Load more').click(); await waitFor(() => runRequests.length === 4);
  } else {
    runRequests[2].resolve(updated.slice(0, 50)); await waitFor(() => ids().length === 50);
    button('Load more').click(); await waitFor(() => runRequests.length === 4);
    runRequests[1].resolve(records.slice(50)); await tick(); await tick();
    check(ids().length === 50 && button('Load more').disabled, 'old page and finally cannot append or release newer pagination');
  }
  runRequests[3].resolve(updated.slice(50, 100)); await waitFor(() => ids().length === 100);
  button('Load more').click(); await waitFor(() => runRequests.length === 5);
  runRequests[4].resolve(updated.slice(100)); await waitFor(() => ids().length === 101);
  check(JSON.stringify(ids()) === JSON.stringify(updated.map((row) => row.id)), `${order}: exact 101 IDs include new run and r49, no omissions or duplicates`);
  check(runRequests.map((request) => request.offset).join(',') === '0,50,0,50,100' && !button('Load more'), `${order}: offsets restart at zero and paginate to end`);
}
(async () => {
  await scenario('old-page-first'); await scenario('new-first-page-first');
  check(errors.length === 0, 'no runtime errors');
})().catch((error) => results.push(`FAIL ${error.stack}`)).finally(() => {
  root.unmount();
  const report = document.getElementById('checks');
  report.textContent = results.join('\n');
  report.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
