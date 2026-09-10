import test from 'node:test';
import assert from 'node:assert/strict';
import { $createParagraphNode, $createTextNode, $getRoot, $getState, $setState, createEditor, HISTORY_PUSH_TAG, UNDO_COMMAND } from 'lexical';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { composerReferenceState } from '../../../src/features/chat/model/composer-reference-state.js';
import { extractAgentSkillInvocation, matchingAgentSkills, withSelectedSkillInstruction } from '../../../src/features/agents/model/agent-settings.js';
import { composePathReferenceDraft, localPathReference, splitPathReferenceDraft, splitPathReferences, transferredLocalPaths } from '../../../src/features/chat/model/path-references.js';

const PROJECT_PATH = '/Users/test/projects/haish-agent-core';
const DOCUMENT_PATH = '/Users/test/docs/【计划】支持多币种定价 (Lark 上架需要使用日元).md';

test('slash skill queries remain body text when pasted or restored with references', () => {
  const skills = [{ name: 'esx', description: 'Requirement workflow' }];
  for (const text of ['/', '/es', '/esx', '/esx ', '/esx review report.md', '/esx\nRead the attached files.']) {
    const draft = composePathReferenceDraft(text, [PROJECT_PATH, DOCUMENT_PATH]);
    const content = splitPathReferenceDraft(draft);
    assert.deepEqual(content, { text, references: [PROJECT_PATH, DOCUMENT_PATH] });
    assert.deepEqual(matchingAgentSkills(content.text, skills), skills);
    assert.deepEqual(splitPathReferenceDraft(text), { text, references: [] });
  }
  assert.deepEqual(splitPathReferenceDraft('/unknown'), { text: '/unknown', references: [] });
  for (const path of ['/tmp/', '"/tmp"', 'file:///tmp', '/tmp/file.txt']) {
    assert.deepEqual(splitPathReferenceDraft(path), { text: '', references: [path] });
  }
});

test('skill invocation preserves reference paths and prompts in the submitted text', () => {
  const skill = { name: 'esx' };
  const prompt = '读一下这个，这是自由审查的基准';
  const references = [PROJECT_PATH, DOCUMENT_PATH];
  for (const text of ['/esx', `/esx ${prompt}`]) {
    const content = splitPathReferenceDraft(composePathReferenceDraft(text, references));
    const invocation = extractAgentSkillInvocation(content.text, [skill]);
    const selectedDraft = composePathReferenceDraft(invocation.prompt, content.references);
    assert.deepEqual(splitPathReferenceDraft(selectedDraft), { text: invocation.prompt, references });
    assert.equal(withSelectedSkillInstruction(selectedDraft, invocation.skill),
      `Use the esx skill.\n${references.join('\n')}${invocation.prompt ? `\n${prompt}` : ''}`);
  }
});

test('reference tray and body text split and rejoin without losing paths or prose', () => {
  const text = 'Read these files.\n\nKeep this paragraph.';
  const source = `${PROJECT_PATH}\n${DOCUMENT_PATH}\n${text}`;
  const parsed = splitPathReferenceDraft(source);
  assert.deepEqual(parsed, { text, references: [PROJECT_PATH, DOCUMENT_PATH] });
  assert.equal(composePathReferenceDraft(parsed.text, parsed.references), source);
  assert.deepEqual(splitPathReferenceDraft(`Read this\n${PROJECT_PATH}\n\n${DOCUMENT_PATH}\n`), {
    text: 'Read this', references: [PROJECT_PATH, DOCUMENT_PATH],
  });
  assert.deepEqual(splitPathReferenceDraft(PROJECT_PATH), { text: '', references: [PROJECT_PATH] });
  assert.equal(composePathReferenceDraft('', [PROJECT_PATH]), PROJECT_PATH);
  assert.deepEqual(splitPathReferenceDraft('  text only\n'), { text: '  text only\n', references: [] });
});

test('references stay outside text selection and share native undo history', async (context) => {
  const editor = createEditor({ onError: (error) => { throw error; } });
  const history = createEmptyHistoryState();
  const HISTORY_MERGE_DELAY = 0;
  context.after(registerHistory(editor, history, HISTORY_MERGE_DELAY));
  const update = (fn) => editor.update(fn, { discrete: true, tag: HISTORY_PUSH_TAG });
  const snapshot = () => editor.getEditorState().read(() => ({
    text: $getRoot().getTextContent(), references: $getState($getRoot(), composerReferenceState),
  }));
  update(() => $getRoot().append($createParagraphNode().append($createTextNode('Review this.'))));
  update(() => $setState($getRoot(), composerReferenceState, [PROJECT_PATH]));
  assert.deepEqual(snapshot(), { text: 'Review this.', references: [PROJECT_PATH] });
  update(() => $getRoot().select(0, $getRoot().getChildrenSize()).removeText());
  assert.deepEqual(snapshot(), { text: '', references: [PROJECT_PATH] });
  update(() => $setState($getRoot(), composerReferenceState, []));
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshot(), { text: '', references: [PROJECT_PATH] });
});

test('a path followed by a user message never consumes the message as a folder tooltip', () => {
  const file = '/Users/test/Downloads/long_text_B1090ED0-D20C-4372-8E00-7BCA93308037.txt';
  for (const text of [
    '这个是审查出来的结果，图中是客户比较关注的问题，你分析一下是否能审出来客户关注的问题',
    'Read this file and compare it with report.md',
  ]) {
    const source = `${file} ${text}`;
    assert.equal(splitPathReferences(source).map((part) => part.text).join(''), source);
    assert.deepEqual(splitPathReferenceDraft(source), { text, references: [file] });
    assert.equal(localPathReference(splitPathReferenceDraft(source).references[0]).kindLabel, 'TXT');
  }
  const body = '请分析这些内容';
  for (const path of [DOCUMENT_PATH, `"${DOCUMENT_PATH}"`, `file://${encodeURI(DOCUMENT_PATH)}`, `"${PROJECT_PATH}"`]) {
    assert.deepEqual(splitPathReferenceDraft(`${path} ${body}`), { text: body, references: [path] });
  }
  for (const source of [`${PROJECT_PATH} 请分析这个项目`, `${PROJECT_PATH} review this project`, '/Users/test/项目，这是正文']) {
    assert.deepEqual(splitPathReferenceDraft(source), { text: source, references: [] });
  }
});

test('path presentation derives a basename and type hint without modifying the source', () => {
  assert.deepEqual(localPathReference(PROJECT_PATH), { path: PROJECT_PATH, name: 'haish-agent-core', kind: 'directory', kindLabel: 'FOLDER' });
  assert.equal(localPathReference(`${PROJECT_PATH}/`).kindLabel, 'FOLDER');
  assert.equal(localPathReference(DOCUMENT_PATH).kindLabel, 'MD');
  assert.equal(localPathReference('C:\\work\\report.pdf').name, 'report.pdf');
  assert.equal(localPathReference('~/project/README').kindLabel, 'FILE');
  assert.equal(localPathReference('./src/index.js').kindLabel, 'JS');
  assert.equal(localPathReference('../folder/').kindLabel, 'FOLDER');
  assert.equal(localPathReference('/repo/.git').kindLabel, 'FOLDER');
  assert.equal(localPathReference('/repo/.config.json').kindLabel, 'JSON');
  assert.equal(localPathReference('/repo/.env').kindLabel, 'FILE');
  assert.equal(localPathReference('src/components/Button.jsx').kindLabel, 'JSX');
});

test('mixed text, multiple references, quotes, whitespace and unicode round-trip exactly', () => {
  const source = `分析一下这个项目：\r\n${PROJECT_PATH}\r\n\r\n参考这份文档\n"${DOCUMENT_PATH}"\n结尾不变`;
  const parts = splitPathReferences(source);
  assert.equal(parts.map((part) => part.text).join(''), source);
  assert.deepEqual(parts.filter((part) => part.reference).map((part) => part.reference.path), [PROJECT_PATH, DOCUMENT_PATH]);
  assert.equal(splitPathReferences('')[0], undefined);
});

test('URLs, prose, markdown links and code blocks stay ordinary text', () => {
  const source = [
    'https://example.com/docs', `请阅读 ${PROJECT_PATH}`, `[project](${PROJECT_PATH})`,
    `\`${PROJECT_PATH}\``, '```text', PROJECT_PATH, '```',
    '~~~~', PROJECT_PATH, '~~~', PROJECT_PATH, '~~~~',
    `    ${PROJECT_PATH}`, `\t${PROJECT_PATH}`, 'plain text',
  ].join('\n');
  assert.deepEqual(splitPathReferences(source), [{ text: source }]);
  for (const value of ['', '/', '~', './', '../', 'https://example.com', 'file://server/private', 'file:///%broken', '/tmp/a\nb', '/tmp/<script>']) {
    assert.equal(localPathReference(value), null, value);
  }
});

test('file URI cards decode only their display while preserving raw submitted text', () => {
  const uri = `file://${encodeURI(DOCUMENT_PATH)}`;
  const [part] = splitPathReferences(uri);
  assert.equal(part.text, uri);
  assert.equal(part.reference.path, DOCUMENT_PATH);
  assert.equal(localPathReference('file:///C:/work/file.txt').path, 'C:/work/file.txt');
});

test('native file transfers retain complete paths and leave image files to the image pipeline', () => {
  const image = { type: 'image/png', path: '/tmp/image.png' };
  const file = { type: 'text/markdown', path: DOCUMENT_PATH };
  const directory = { type: '', path: PROJECT_PATH };
  assert.equal(transferredLocalPaths({ files: [image, file, directory] }), `${DOCUMENT_PATH}\n${PROJECT_PATH}`);
  assert.equal(transferredLocalPaths({ files: [{ name: 'unknown.txt', type: 'text/plain' }] }), '');
  const transfer = { getData: (type) => type === 'text/uri-list' ? `# Finder\nfile://${PROJECT_PATH}\nhttps://example.com` : '' };
  assert.equal(transferredLocalPaths(transfer), PROJECT_PATH);
  assert.equal(transferredLocalPaths(undefined), '');
});
