import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCtxWiring } from '../../../scripts/architecture-rules/ctx-wiring.js';
import { buildViews } from '../../../scripts/architecture-rules/source-scan.js';

const inspect = (source) => collectCtxWiring(buildViews([{ path: 'fixture.js', source }]));

test('逐个检查装配点：另一处提供了同一个键也不能掩盖漏传', () => {
  const result = inspect(`
    function createWidget(ctx) { const { a, b } = ctx; }
    createWidget({ a, b });
    createWidget({ a });
  `);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].line, 4);
  assert.deepEqual(result.violations[0].missing, ['b']);
});

test('嵌套展开按外层每个装配点的共同保证判断', () => {
  const result = inspect(`
    function createInner(ctx) { const { a, b } = ctx; }
    function createOuter(ctx) { const { a } = ctx; return createInner({ ...ctx }); }
    createOuter({ a, b });
    createOuter({ a });
  `);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].factory, 'createInner');
  assert.deepEqual(result.violations[0].missing, ['b']);
});

test('不认识的展开不阻止检查其他可确定的装配点', () => {
  const result = inspect(`
    function createWidget(ctx) { const { a, b } = ctx; }
    createWidget({ ...unknown });
    createWidget({ a });
  `);
  assert.equal(result.violations.length, 1);
  assert.deepEqual(result.violations[0].missing, ['b']);
  assert.ok(result.stats.skippedSites > 0);
});

test('未知展开但显式提供所有必填键仍然能核验', () => {
  const result = inspect(`
    function createWidget(ctx) { const { a, b = 1 } = ctx; }
    createWidget({ ...unknown, a });
  `);
  assert.deepEqual(result.violations, []);
  assert.equal(result.stats.skippedSites, 0);
});

test('互相展开造成环时按未知处理，不误报也不递归溢出', () => {
  const result = inspect(`
    function createFirst(ctx) { const { a } = ctx; return createSecond({ ...ctx }); }
    function createSecond(ctx) { const { b } = ctx; return createFirst({ ...ctx }); }
  `);
  assert.deepEqual(result.violations, []);
  assert.ok(result.stats.skippedSites > 0);
});

test('工厂只读取自身函数体内的 ctx 解构，不借用后续函数的内容', () => {
  const result = inspect(`
    function createUnrelated(ctx) { return ctx; }
    function unrelated(ctx) { const { other } = ctx; }
    createUnrelated({});
  `);
  assert.deepEqual(result.inventory, []);
  assert.deepEqual(result.violations, []);
});

test('变量间接装配不会掩盖另一处字面量漏参', () => {
  const result = inspect(`
    function createWidget(ctx) { const { a, b } = ctx; }
    createWidget(otherContext);
    createWidget({ a });
  `);
  assert.equal(result.violations.length, 1);
  assert.deepEqual(result.violations[0].missing, ['b']);
  assert.equal(result.stats.skippedSites, 1);
});
