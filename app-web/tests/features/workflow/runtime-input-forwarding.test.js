import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../../src/features/app/AppShellView.jsx', import.meta.url), 'utf8');
const expression = source.match(/onSend=\{(async \(text, attachment,[\s\S]*?)\n {22}\}\}/)?.[1] + '\n}';
for (const annotations of [undefined, [{ text: 'quote' }]]) {
  test(`Workflow forwarding awaits current node configs and preserves annotation slot (${Boolean(annotations)})`, async () => {
    let received;
    const configs = { agent: { agent_id: 'new' } };
    const send = new Function('nodeConfigActions', 'showToast', `return (${expression});`)(
      { send: async (...args) => { received = [...args, configs]; return true; } }, () => {});
    assert.equal(await send('task', null, null, null, [], 'workflow', null, 'task', annotations), true);
    assert.deepEqual(received[8], annotations || []);
    assert.equal(received[9], configs);
  });
}
