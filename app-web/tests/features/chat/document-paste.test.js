import test from 'node:test';
import assert from 'node:assert/strict';
import { firstPastedDocument } from '../../../src/features/chat/model/document-paste.js';

const file = (name, type = '') => new File(['content'], name, { type });
const item = (value, entry = { isFile: true, isDirectory: false }) => ({
  kind: 'file', getAsFile: () => value, webkitGetAsEntry: () => entry,
});

test('pastes only the first supported document', () => {
  const first = file('需求.PDF');
  assert.equal(firstPastedDocument({ items: [item(first), item(file('second.docx'))] }), first);
});

test('matches document API formats, but not images, archives or spreadsheets', () => {
  for (const suffix of ['md', 'txt', 'pdf', 'html', 'htm', 'docx', 'json', 'py']) {
    const document = file(`test.${suffix}`);
    assert.equal(firstPastedDocument({ files: [document] }), document);
  }
  for (const suffix of ['png', 'jpg', 'webp', 'gif', 'zip', 'xlsx', 'doc']) {
    assert.equal(firstPastedDocument({ items: [item(file(`test.${suffix}`))] }), null);
  }
});

test('directories including ones with document suffixes stay on the path route', () => {
  assert.equal(firstPastedDocument({ items: [item(file('folder.pdf'), { isDirectory: true })] }), null);
  const unknown = new File([], 'folder.md');
  assert.equal(firstPastedDocument({ items: [item(unknown, null)] }), null);
  assert.equal(firstPastedDocument({ files: [unknown] }), null);
});

test('confirmed empty files are allowed, ordinary text and missing files are untouched', () => {
  const empty = new File([], 'empty.txt');
  assert.equal(firstPastedDocument({ items: [item(empty)] }), empty);
  assert.equal(firstPastedDocument({ items: [{ kind: 'string' }] }), null);
  assert.equal(firstPastedDocument({ items: [item(null)] }), null);
  assert.equal(firstPastedDocument({ files: [file('md')] }), null);
  assert.equal(firstPastedDocument(null), null);
});
