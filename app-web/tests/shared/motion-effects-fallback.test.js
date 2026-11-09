import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

// metal-fx 在模块级建全局 WebGL context，拿不到就 throw。这些用例守的是：
// 装饰层退化成「没有 shader」，而不是把整个界面推到顶层错误页。
test('webgl probe reports no support when there is no document', async () => {
  assert.equal(typeof globalThis.document, 'undefined', 'node test runner has no DOM');
  const { hasWebgl } = await import('../../src/shared/lib/webgl.js');
  assert.equal(hasWebgl(), false);
});

test('webgl probe caches its answer instead of building a canvas per render', async () => {
  const { hasWebgl } = await import('../../src/shared/lib/webgl.js');
  const first = hasWebgl();
  const second = hasWebgl();
  assert.equal(first, second);
});

test('the send button keeps its shell when WebGL is missing', () => {
  const source = read('shared/ui/MotionEffects.jsx');
  // 守卫必须在返回 MetalFx 之前，降级容器要带着同一套 class，按钮本身不能丢。
  const guard = source.indexOf('if (!hasWebgl())');
  const shell = source.slice(guard, guard + 220);
  assert.ok(guard > 0, 'MetalActionEffect checks WebGL before rendering MetalFx');
  assert.match(shell, /className=\{shellClass\}/, 'fallback keeps the chat-send-metal shell');
  assert.ok(source.indexOf('<MetalFx') > guard, 'the guard runs before MetalFx is created');
});

test('the invisible runtime keeper renders nothing without WebGL', () => {
  const source = read('shared/ui/MotionEffects.jsx');
  const keeper = source.slice(source.indexOf('export function MetalFxRuntimeKeeper'));
  assert.match(keeper, /if \(!hasWebgl\(\)\) return null/);
});

// 就算探测通过，运行期仍可能抛（例如 GPU 进程中途崩溃）。这层兜底保证它只影响装饰自己。
test('both decoration effects are isolated behind a local boundary', () => {
  const source = read('shared/ui/MotionEffects.jsx');
  assert.equal((source.match(/<ErrorBoundary fallback=/g) || []).length, 2);
});

test('the global boundary keeps its error screen unless a fallback is passed', () => {
  const source = read('shared/ui/ErrorBoundary.jsx');
  assert.match(source, /if \(this\.props\.fallback !== undefined\) return this\.props\.fallback;/);
  assert.match(source, /aui-error-screen/, 'no fallback means the full-screen error state stays');
});

test('schedule subscription degrades instead of throwing when preload is missing', () => {
  const source = read('features/schedules/hooks/useSchedules.js');
  assert.match(source, /window\.haish\?\.onScheduleEvent\?\.\(callback\)/);
  assert.doesNotMatch(source, /window\.haish\.onScheduleEvent/);
});
