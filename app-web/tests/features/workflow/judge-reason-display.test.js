import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeReasonText } from '../../../src/core/node-attempts.js';
test('Judge display extracts reason without changing structured verdict', () => {
  const verdict = { ok: false, reason: '还需要完成验证。', impossible: false, blocked: false };
  const result = { json: verdict, summary: JSON.stringify(verdict) };
  assert.equal(judgeReasonText(result), verdict.reason);
  assert.equal(judgeReasonText({ summary: JSON.stringify(verdict) }), verdict.reason);
  assert.equal(judgeReasonText({ summary: '```json\n' + JSON.stringify(verdict) + '\n```' }), verdict.reason);
  assert.equal(result.json, verdict);
  assert.equal(verdict.ok, false);
});
test('Judge failures remain visible rather than showing stale reason', () => {
  assert.equal(judgeReasonText({ error: 'request failed', json: { reason: 'old' } }), 'request failed');
  assert.equal(judgeReasonText({ summary: 'invalid output' }), 'invalid output');
});
test('long legacy single-paragraph reasons gain paragraph breaks without changing content', () => {
  const reason = '已完成当前模块的重构并验证结果。'.repeat(20);
  const rendered = judgeReasonText({ json: { reason } });
  assert.ok(rendered.includes('\n\n'));
  assert.equal(rendered.replaceAll('\n', ''), reason);
  const markdown = '**结论**\n\n- 测试通过\n- 路径 `src/app.js`';
  assert.equal(judgeReasonText({ json: { reason: markdown } }), markdown);
});
