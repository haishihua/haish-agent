import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearTaskCompletionNotice, taskCompletionNoticeKey, terminalTaskNoticeStatus } from '../../../src/core/task-completion-notices.js';

// Exercise the production hook with persistent refs and React dependency semantics.
function harness() {
  const source = fs.readFileSync(new URL('../../../src/features/tasks/hooks/useViewedTaskCompletionNotice.js', import.meta.url), 'utf8');
  let dependencies;
  let effect;
  let notices = {};
  const ref = { current: null };
  const React = {
    useRef: () => ref,
    useEffect(callback, next) {
      if (!dependencies || next.some((value, index) => !Object.is(value, dependencies[index]))) effect = callback;
      dependencies = next;
    },
  };
  const hook = new Function('React', 'clearTaskCompletionNotice', 'taskCompletionNoticeKey', 'terminalTaskNoticeStatus', `${source.replace(/^import .*;\n/gm, '').replace('export function', 'function')}\nreturn useViewedTaskCompletionNotice;`)(React, clearTaskCompletionNotice, taskCompletionNoticeKey, terminalTaskNoticeStatus);
  const setNotices = update => { notices = update(notices); };
  const props = { task: { taskId: 'task', status: 'running' }, conversationId: 'conv', visible: true, windowFocused: true, setNotices };
  return {
    render(changes = {}) {
      Object.assign(props, changes);
      effect = null;
      hook({ ...props, notices });
      effect?.();
    },
    complete() {
      notices = { 'conv:task': { conversationId: 'conv', taskId: 'task', status: 'done' } };
      this.render({ task: { taskId: 'task', status: 'done' } });
    },
    get unread() { return Boolean(notices['conv:task']); },
  };
}

test('completion receipt does not mark a continuously selected task read', () => {
  const view = harness();
  view.render();
  view.complete();
  assert.equal(view.unread, true);
  view.render();
  assert.equal(view.unread, true);
});

test('opening the task after completion acknowledges its result', () => {
  const view = harness();
  view.render({ visible: false });
  view.complete();
  assert.equal(view.unread, true);
  view.render({ visible: true });
  assert.equal(view.unread, false);
});

test('background completion stays unread until the window regains focus', () => {
  const view = harness();
  view.render({ windowFocused: false });
  view.complete();
  assert.equal(view.unread, true);
  view.render({ windowFocused: true });
  assert.equal(view.unread, false);
});

test('switching back to a completed task acknowledges its result', () => {
  const view = harness();
  view.render();
  view.complete();
  view.render({ task: { taskId: 'other', status: 'done' } });
  assert.equal(view.unread, true);
  view.render({ task: { taskId: 'task', status: 'done' } });
  assert.equal(view.unread, false);
});
