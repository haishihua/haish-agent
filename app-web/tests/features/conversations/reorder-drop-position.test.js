import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleHookHarness } from '../schedules/hook-harness.js';

test('reorder hover shares strict midpoint behavior and ignores child transitions', async () => {
  const harness = scheduleHookHarness('../../../src/features/conversations/hooks/useReorderDropPosition.js', 'useReorderDropPosition');
  let prevented = 0;
  let stopped = 0;
  const event = {
    preventDefault: () => { prevented += 1; },
    stopPropagation: () => { stopped += 1; },
    dataTransfer: {},
    currentTarget: { getBoundingClientRect: () => ({ top: 10, height: 20 }), contains: value => value === 'child' },
    clientY: 20,
  };
  harness.result.handleDragOver(event);
  await harness.settle();
  assert.equal(harness.result.dropPosition, 'before');
  event.clientY = 21;
  harness.result.handleDragOver(event);
  await harness.settle();
  assert.equal(harness.result.dropPosition, 'after');
  assert.equal(event.dataTransfer.dropEffect, 'move');
  assert.equal(prevented, 2);
  assert.equal(stopped, 2);
  harness.result.handleDragLeave({ ...event, relatedTarget: 'child' });
  await harness.settle();
  assert.equal(harness.result.dropPosition, 'after');
  harness.result.handleDragLeave({ ...event, relatedTarget: null });
  await harness.settle();
  assert.equal(harness.result.dropPosition, null);
  harness.unmount();
});
