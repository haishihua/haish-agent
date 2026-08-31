import test from 'node:test';
import assert from 'node:assert/strict';
import { stripInjectedSkillInstruction } from '../../../src/features/chat/model/chat-text.js';

test('stripInjectedSkillInstruction hides the transport-only skill prefix', () => {
  assert.equal(
    stripInjectedSkillInstruction('Use the esx skill.\n需求id=20525，完成这个需求'),
    '需求id=20525，完成这个需求',
  );
});

test('stripInjectedSkillInstruction handles persisted titles with collapsed whitespace', () => {
  assert.equal(
    stripInjectedSkillInstruction('Use the esx skill. 需求id=20525，完成这个需求'),
    '需求id=20525，完成这个需求',
  );
});

test('stripInjectedSkillInstruction leaves ordinary user text unchanged', () => {
  assert.equal(
    stripInjectedSkillInstruction('请帮我分析这个需求'),
    '请帮我分析这个需求',
  );
});
