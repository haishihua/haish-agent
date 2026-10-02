import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScheduleEvent, buildScheduleSpec, createScheduleBinding, localDateTime, scheduleFields, scheduleInvocation, scheduleMenuItems, scheduleSummary } from '../../../src/features/schedules/model/schedule.js';
import { createScheduledRuntimeHandlers } from '../../../src/features/schedules/model/runtime-handlers.js';

test('schedule shares slash menu with skills but is an action, not a skill', () => {
  const skills = [{ name: 'review' }];
  assert.deepEqual(scheduleMenuItems('/', skills, true).map((item) => item.name), ['schedule', 'review']);
  assert.equal(scheduleMenuItems('/sch', [], true)[0].command, true);
  assert.deepEqual(scheduleMenuItems('ordinary message', skills, true), skills);
  assert.deepEqual(scheduleMenuItems('/', skills, false), skills);
  assert.equal(scheduleInvocation('/schedule summarize daily')[1], 'summarize daily');
  assert.equal(scheduleInvocation('/schedule-other'), null);
});

test('builds strict time payloads; does not send irrelevant fields', () => {
  const fields = scheduleFields({ kind: 'interval', seconds: 120 });
  assert.deepEqual(buildScheduleSpec(fields), { kind: 'interval', seconds: 120 });
  for (const minutes of ['0', '-1', '1.5', '525601', 'abc']) {
    assert.throws(() => buildScheduleSpec({ ...fields, minutes }));
  }
  assert.deepEqual(buildScheduleSpec({ kind: 'cron', expr: '0 9 * * 1-5', timezone: 'Asia/Shanghai' }), { kind: 'cron', expr: '0 9 * * 1-5', timezone: 'Asia/Shanghai' });
  assert.throws(() => buildScheduleSpec({ kind: 'cron', expr: '* * * * * *', timezone: 'UTC' }));
  assert.throws(() => buildScheduleSpec({ kind: 'cron', expr: '* * * * *', timezone: 'Invalid/Zone' }));
  assert.throws(() => buildScheduleSpec({ kind: 'once', at: '2020-01-01T00:00' }));
  const at = localDateTime('2099-01-01T12:00:00Z');
  assert.equal(buildScheduleSpec({ kind: 'once', at }).at, '2099-01-01T12:00:00.000Z');
  assert.equal(scheduleSummary(fields.kind === 'interval' ? { kind: 'interval', seconds: 120 } : null), 'Every 2 min');
});

test('events upsert only their schedule and deletion removes sidebar reminder', () => {
  const a = { id: 'a', conversation_id: 'c1', last_run: { id: 'r0' } };
  let items = applyScheduleEvent([a], { type: 'schedule.event', event: { schedule: { id: 'b', conversation_id: 'c2' } } });
  items = applyScheduleEvent(items, { type: 'schedule.event', event: { schedule: { id: 'a', state: 'paused' } } });
  assert.equal(items.find((item) => item.id === 'a').last_run.id, 'r0');
  items = applyScheduleEvent(items, { type: 'schedule.event', event: { run: { id: 'r1', schedule_id: 'a', status: 'failed' } } });
  assert.equal(items.find((item) => item.id === 'a').last_run.status, 'failed');
  items = applyScheduleEvent(items, { type: 'schedule.event', event: { action: 'deleted', schedule_id: 'a' } });
  assert.deepEqual(items.map((item) => item.conversation_id), ['c2']);
});

test('binding uses existing draft materialize and rejects changed conversation', async () => {
  const current = { current: 'draft-1' };
  let calls = 0;
  const bind = createScheduleBinding(async (request) => { calls++; assert.equal(request.text, 'review'); current.current = 'real'; return { id: 'real' }; }, current);
  assert.equal(await bind('review', 'draft-1'), 'real');
  await assert.rejects(bind('review', 'draft-1'), /changed/);
  assert.equal(calls, 1);
});

function runtimeHarness() {
  const runtimes = new Map();
  const getRuntime = (cid) => {
    if (!runtimes.has(cid)) runtimes.set(cid, { taskRuntimeState: { taskOrder: [], tasksById: {} }, busy: false });
    return runtimes.get(cid);
  };
  let workspace = { projects: [{ conversations: [{ id: 'c', tasks: [{ taskId: 'old' }] }, { id: 'other', tasks: [] }] }] };
  const ctx = {
    getRuntime,
    ensureConversationRuntime: (cid) => {
      const runtime = getRuntime(cid);
      if (!runtime.seeded) {
        runtime.seeded = true;
        runtime.taskRuntimeState = { taskOrder: ['old'], tasksById: { old: { taskId: 'old' } } };
      }
      return runtime;
    },
    isTaskActuallyActive: (task) => task.status === 'running',
    flushRuntimeTasksToWorkspace: (cid) => {
      const tasks = Object.values(getRuntime(cid).taskRuntimeState.tasksById);
      workspace = { projects: workspace.projects.map((project) => ({ ...project,
        conversations: project.conversations.map((c) => c.id === cid ? { ...c, tasks } : c),
      })) };
    },
    restoreLatestTaskRuntime: async (taskId, { targetConversationId, isCurrentActivation }) => {
      const task = await ctx.fetchTaskRuntimeDetail(taskId);
      if (!isCurrentActivation()) return;
      getRuntime(targetConversationId).taskRuntimeState.tasksById[taskId] = ctx.taskDetailToRuntimeTask(task.normalizedTask);
    },
    setRuntimeBusy: (busy, cid) => { getRuntime(cid).busy = busy; },
    updateTaskRuntimeState: (update, cid) => { getRuntime(cid).taskRuntimeState = update(getRuntime(cid).taskRuntimeState); },
    taskDetailToRuntimeTask: (task) => ({ taskId: task.task_id, status: task.status }),
    fetchTaskRuntimeDetail: async (taskId) => ({ normalizedTask: { task_id: taskId, conversation_id: 'c', status: 'done' } }),
    applyScheduledEvent: (message) => { getRuntime(message.conversation_id).taskRuntimeState.tasksById.new = { taskId: 'new', status: 'running' }; },
  };
  return { ctx, workspace: () => workspace };
}

test('recovery merges task without deleting historical sidebar tasks or touching another conversation', async () => {
  const { ctx, workspace } = runtimeHarness();
  const handlers = createScheduledRuntimeHandlers(ctx);
  await handlers.recover({ conversation_id: 'c', last_run: { task_id: 'new' } });
  assert.deepEqual(workspace().projects[0].conversations[0].tasks.map((task) => task.taskId), ['old', 'new']);
  assert.deepEqual(workspace().projects[0].conversations[1].tasks, []);
});

test('late recovery does not overwrite newer live deltas, even across handler recreation', async () => {
  const { ctx } = runtimeHarness();
  let resolve;
  ctx.fetchTaskRuntimeDetail = () => new Promise((done) => { resolve = done; });
  const pending = createScheduledRuntimeHandlers(ctx).recover({ conversation_id: 'c', last_run: { task_id: 'new' } });
  createScheduledRuntimeHandlers(ctx).event({ conversation_id: 'c', schedule_id: 's', type: 'task.event' });
  resolve({ normalizedTask: { task_id: 'new', conversation_id: 'c', status: 'done' } });
  await pending;
  assert.equal(ctx.getRuntime('c').taskRuntimeState.tasksById.new.status, 'running');
});

test('recover never clears newer manual run busy flag', async () => {
  const { ctx } = runtimeHarness();
  Object.assign(ctx.getRuntime('c'), { activeTaskId: 'manual', busy: true });
  await createScheduledRuntimeHandlers(ctx).recover({ conversation_id: 'c', last_run: { task_id: 'new' } });
  assert.equal(ctx.getRuntime('c').busy, true);
});
