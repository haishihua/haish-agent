import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allQuestionsAnswered,
  buildAnswer,
  buildAnswers,
  readDraft,
  toggleDraftSelection,
  writeDraftText,
} from '../../../src/features/chat/model/ask-user-draft.js';

const IDENTITY = { id: 'identity_kind', question: '这次认证用谁的信息发起？' };
const MATERIALS = { id: 'materials', question: '材料怎么写？' };

test('only a picked option submits a selection answer', () => {
  const draft = toggleDraftSelection(undefined, '个人身份');

  assert.deepEqual(buildAnswer(IDENTITY, draft), {
    question_id: 'identity_kind',
    kind: 'selection',
    values: ['个人身份'],
  });
});

test('only typed text submits a freeform answer (the old behaviour, unchanged)', () => {
  const draft = writeDraftText(undefined, '  钟梦熠  ');

  assert.deepEqual(buildAnswer(IDENTITY, draft), {
    question_id: 'identity_kind',
    kind: 'freeform',
    text: '钟梦熠',
  });
});

test('a picked option plus typed text is one selection answer with a note', () => {
  let draft = toggleDraftSelection(undefined, '个人身份');
  draft = writeDraftText(draft, '钟梦熠');

  assert.deepEqual(buildAnswer(IDENTITY, draft), {
    question_id: 'identity_kind',
    kind: 'selection',
    values: ['个人身份'],
    note: '钟梦熠',
  });
  // 一题一条答案：模型不该看到一个 question_id 出现两次。
  assert.equal(buildAnswers([IDENTITY], { identity_kind: draft }).length, 1);
});

test('picking an option keeps the typed text, and typing keeps the picked option', () => {
  let draft = writeDraftText(undefined, '钟梦熠');
  draft = toggleDraftSelection(draft, '个人身份');
  assert.deepEqual(readDraft({ identity_kind: draft }, 'identity_kind'), {
    values: ['个人身份'],
    text: '钟梦熠',
  });

  // 单选换选项：文字留下（整题备注）。
  draft = toggleDraftSelection(draft, '企业身份');
  assert.deepEqual(draft, { values: ['企业身份'], text: '钟梦熠' });

  // 取消/换回都不清空文字，直到用户自己删掉。
  draft = writeDraftText(draft, '');
  assert.deepEqual(draft, { values: ['企业身份'], text: '' });
});

test('whitespace-only text is not a note', () => {
  let draft = toggleDraftSelection(undefined, '个人身份');
  draft = writeDraftText(draft, '   ');

  const answer = buildAnswer(IDENTITY, draft);
  assert.deepEqual(answer, {
    question_id: 'identity_kind',
    kind: 'selection',
    values: ['个人身份'],
  });
  assert.deepEqual(Object.keys(answer), ['question_id', 'kind', 'values']);
});

test('multiple picks toggle independently and single picks replace', () => {
  let draft = toggleDraftSelection(undefined, 'A', true);
  draft = toggleDraftSelection(draft, 'B', true);
  assert.deepEqual(draft.values, ['A', 'B']);

  draft = toggleDraftSelection(draft, 'A', true);
  assert.deepEqual(draft.values, ['B']);

  draft = toggleDraftSelection(draft, 'A', false);
  assert.deepEqual(draft.values, ['A']);
});

test('every draft helper returns a fresh draft instead of mutating in place', () => {
  const empty = readDraft({}, 'identity_kind');
  const picked = toggleDraftSelection(empty, '个人身份');
  const written = writeDraftText(picked, '钟梦熠');

  assert.deepEqual(empty, { values: [], text: '' });
  assert.deepEqual(picked, { values: ['个人身份'], text: '' });
  assert.deepEqual(written, { values: ['个人身份'], text: '钟梦熠' });
});

test('buildAnswers keeps question order and skips unanswered questions', () => {
  const drafts = {
    identity_kind: toggleDraftSelection(undefined, '个人身份'),
    materials: writeDraftText(undefined, '钟梦熠'),
  };

  assert.deepEqual(buildAnswers([IDENTITY, MATERIALS], drafts), [
    { question_id: 'identity_kind', kind: 'selection', values: ['个人身份'] },
    { question_id: 'materials', kind: 'freeform', text: '钟梦熠' },
  ]);
  assert.deepEqual(buildAnswers([IDENTITY, MATERIALS], { identity_kind: drafts.identity_kind }), [
    { question_id: 'identity_kind', kind: 'selection', values: ['个人身份'] },
  ]);
});

test('every question must be answered before submit', () => {
  assert.equal(allQuestionsAnswered([], {}), false);
  assert.equal(allQuestionsAnswered([IDENTITY], {}), false);
  assert.equal(allQuestionsAnswered([IDENTITY], { identity_kind: writeDraftText(undefined, '   ') }), false);
  assert.equal(allQuestionsAnswered([IDENTITY], { identity_kind: writeDraftText(undefined, '钟梦熠') }), true);
  assert.equal(allQuestionsAnswered(
    [IDENTITY, MATERIALS],
    { identity_kind: toggleDraftSelection(undefined, '个人身份') },
  ), false);
  assert.equal(allQuestionsAnswered(
    [IDENTITY, MATERIALS],
    {
      identity_kind: toggleDraftSelection(undefined, '个人身份'),
      materials: writeDraftText(undefined, '钟梦熠'),
    },
  ), true);
});

test('readDraft tolerates missing and malformed drafts', () => {
  assert.deepEqual(readDraft(undefined, 'identity_kind'), { values: [], text: '' });
  assert.deepEqual(
    readDraft({ identity_kind: { values: 'nope', text: 7 } }, 'identity_kind'),
    { values: [], text: '' },
  );
});
