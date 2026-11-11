import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

const module = { exports: {} };
vm.runInNewContext(transformSync(readFileSync(new URL('../../src/main/subscriber-owner.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports });
const { trackSubscriberOwner } = module.exports;

test('repeated subscriptions register one destroy cleanup per owner and resource', () => {
  const owner = Object.assign(new EventEmitter(), { id: 42 });
  const calls = [];
  const remove = id => calls.push(id);
  for (let i = 0; i < 100; i += 1) trackSubscriberOwner(owner, remove);
  assert.equal(owner.listenerCount('destroyed'), 1);
  owner.emit('destroyed');
  assert.deepEqual(calls, [42]);
  assert.equal(owner.listenerCount('destroyed'), 0);
});

test('resource cleanups and owner lifetimes remain independent', () => {
  const a = Object.assign(new EventEmitter(), { id: 1 });
  const b = Object.assign(new EventEmitter(), { id: 2 });
  const calls = [];
  const removeFirst = id => calls.push(['first', id]);
  const removeSecond = id => calls.push(['second', id]);
  trackSubscriberOwner(a, removeFirst);
  trackSubscriberOwner(a, removeSecond);
  trackSubscriberOwner(b, removeFirst);
  a.emit('destroyed');
  assert.deepEqual(calls, [['first', 1], ['second', 1]]);
  b.emit('destroyed');
  assert.deepEqual(calls, [['first', 1], ['second', 1], ['first', 2]]);
});
