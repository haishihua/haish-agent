import test from 'node:test';
import assert from 'node:assert/strict';
import { fileUriPath } from '../../src/shared/lib/file-uri.js';
import { localFilePath } from '../../src/shared/lib/local-file-link.js';
import { chatImagePreviewUrl } from '../../src/shared/api/chat-image.js';
import { addWorkflowEdge } from '../../src/features/settings/components/workflow-editor/shared.js';

for (const [uri, path] of [
  ['file:///tmp/a%20b.png', '/tmp/a b.png'],
  ['file://localhost/tmp/%E4%B8%AD.png', '/tmp/中.png'],
  ['file:///C:/a%20b.png', 'C:/a b.png'],
]) {
  test(`file URI has the same meaning for preview and link: ${uri}`, () => {
    assert.equal(fileUriPath(uri), path);
    assert.equal(localFilePath(uri), path);
    assert.equal(new URL(chatImagePreviewUrl({ path: uri }, 'a'), 'http://fixture').searchParams.get('image_path'), path);
  });
}
test('invalid and nonlocal file URIs do not become preview requests', () => {
  for (const path of ['file://remote/tmp/a.png', 'file:///tmp/%ZZ.png', 'file:///tmp/%00.png']) {
    assert.equal(chatImagePreviewUrl({ path }, 'a'), '');
    assert.equal(localFilePath(path), '');
  }
});
test('workflow editing validates branches independently of UI object properties', () => {
  for (const branch of ['true', 'false', 'approved', 'rejected', 'retry', 'exhausted', 'default']) {
    assert.deepEqual(addWorkflowEdge([], 'a', 'b', branch), [{ from: 'a', to: 'b', branch: branch === 'default' ? 'false' : branch }]);
  }
  for (const branch of ['constructor', 'toString', 'unknown']) {
    assert.deepEqual(addWorkflowEdge([], 'a', 'b', branch), [{ from: 'a', to: 'b' }]);
  }
});
