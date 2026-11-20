import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../src/features/conversations/components/ConversationsPanel.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('function requestRenameTask('), source.indexOf('function requestRenameConversation('));

for (const ok of [true, false]) {
  test(`task rename preserves the current title and only acknowledges a successful response (${ok})`, async () => {
    let dialog;
    let renamed;
    const rename = new Function('setDialog', 'apiFetch', 'API_BASE', `${handler}; return requestRenameTask;`)(
      value => { dialog = value; }, async () => ({ ok, text: async () => 'Rename rejected' }), '');
    rename(null, null, { taskId: 'task', title: 'Original' }, value => { renamed = value; });
    assert.equal(dialog.value, 'Original');
    if (ok) {
      await dialog.onConfirm('Updated');
      assert.equal(renamed, 'Updated');
    } else {
      await assert.rejects(dialog.onConfirm('Updated'), /Rename rejected/);
      assert.equal(renamed, undefined);
    }
  });
}
