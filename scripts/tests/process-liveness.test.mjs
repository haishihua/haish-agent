import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

const source = transformSync(readFileSync(new URL('../../src/main/process-liveness.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function probe(kill) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, process: { kill } });
  return module.exports.processAlive;
}

test('process liveness probes signal zero and treats permission denial as alive', () => {
  const calls = [];
  assert.equal(probe((...args) => calls.push(args))(123), true);
  assert.deepEqual(calls, [[123, 0]]);
  assert.equal(probe(() => { throw Object.assign(new Error(), { code: 'EPERM' }); })(123), true);
});

test('missing processes and other probe errors are not alive', () => {
  for (const error of [Object.assign(new Error(), { code: 'ESRCH' }), new Error(), null]) {
    assert.equal(probe(() => { throw error; })(123), false);
  }
});
