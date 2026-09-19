import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// AppShell 用一个大 ctx 对象装配各个 create*Handlers 工厂：工厂从 ctx 里解构出什么，
// AppShell 就得递进去什么。少一个键既不会编译报错、也不会让任何行为测试变红，只会在
// 跑到那一行时才炸成 `x is not a function` —— 「向上翻页加载更早步骤」整条恢复路径就
// 这样挂过：restoreTaskRuntimes / restoreTaskRuntime 每次都在
// applyContextUsage(latestContextUsageFromTasks(...)) 上抛 TypeError（`createDraftConversationHandlers`
// 的 ctx 少递了两个键），更早的轮次再也补不上执行记录，聊天里只剩一条
// “Could not load earlier steps. Retry loading steps”。
// 这里把两边对起来：工厂解构了、AppShell 没给（且没有默认值）就是缺口。

const FACTORIES = [
  ['createComposerHandlers', '../../src/features/chat/hooks/createComposerHandlers.js'],
  ['createConversationActivationHandlers', '../../src/features/conversations/hooks/createConversationActivationHandlers.js'],
  ['createConversationHandlers', '../../src/features/conversations/hooks/createConversationHandlers.js'],
  ['createConversationRuntime', '../../src/features/conversations/hooks/createConversationRuntime.js'],
  ['createDraftConversationHandlers', '../../src/features/conversations/hooks/createDraftConversationHandlers.js'],
  ['createSettingsHandlers', '../../src/features/settings/hooks/createSettingsHandlers.js'],
  ['createDeployHandlers', '../../src/features/tasks/hooks/createDeployHandlers.js'],
  ['createTaskStreamHandlers', '../../src/features/tasks/hooks/createTaskStreamHandlers.js'],
];

/** 注释（行/块）先剥掉，免得 `//` 注释里的逗号被当成条目分隔。 */
function stripComments(source) {
  let out = '';
  let state = 'code';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (state === 'code') {
      if (ch === '/' && next === '/') state = 'line';
      else if (ch === '/' && next === '*') state = 'block';
      else if (ch === '"' || ch === "'") { out += ch; state = ch; }
      else if (ch === '`') { out += ch; state = 'tpl'; }
      else out += ch;
    } else if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += ch; }
    } else if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; i += 1; }
    } else {
      out += ch;
      if (ch === '\\') { out += next; i += 1; }
      else if (ch === state || (state === 'tpl' && ch === '`')) state = 'code';
    }
    i += 1;
  }
  return out;
}

function matchBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 一个对象字面量/解构模式的顶层条目：`{ key, key: value, key = 默认值 }` → { key, optional }。 */
function topLevelEntries(objectSource) {
  const entries = [];
  let current = '';
  let depth = 0;
  const flush = () => {
    const entry = current.trim();
    current = '';
    if (!entry) return;
    let colonAt = -1;
    let inner = 0;
    for (let i = 0; i < entry.length; i += 1) {
      const ch = entry[i];
      if ('([{'.includes(ch)) inner += 1;
      else if (')]}'.includes(ch)) inner -= 1;
      else if (ch === ':' && inner === 0) { colonAt = i; break; }
    }
    const head = (colonAt === -1 ? entry : entry.slice(0, colonAt)).trim();
    const key = head.split('=')[0].trim().replace(/^\.\.\./, '');
    if (key) entries.push({ key, optional: head.includes('=') });
  };
  const body = objectSource.slice(1, -1);
  for (const ch of body) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { flush(); continue; }
    current += ch;
  }
  flush();
  return entries;
}

const appShell = stripComments(
  readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8'),
);

function providedKeys(factoryName) {
  const callIndex = appShell.indexOf(`${factoryName}({`);
  assert.ok(callIndex >= 0, `${factoryName} 在 AppShell 里找不到调用点`);
  const braceIndex = appShell.indexOf('{', callIndex);
  const end = matchBrace(appShell, braceIndex);
  assert.ok(end > braceIndex, `${factoryName} 的 ctx 字面量没有闭合`);
  return new Set(topLevelEntries(appShell.slice(braceIndex, end + 1)).map((entry) => entry.key));
}

function requiredKeys(factoryPath) {
  const source = stripComments(readFileSync(new URL(factoryPath, import.meta.url), 'utf8'));
  const match = source.match(/const\s*\{([\s\S]*?)\}\s*=\s*ctx;/);
  assert.ok(match, `${factoryPath} 找不到 ctx 解构`);
  return topLevelEntries(`{${match[1]}}`).filter((entry) => !entry.optional).map((entry) => entry.key);
}

test('every ctx key the factory destructures is handed in by AppShell', () => {
  const report = [];
  for (const [name, path] of FACTORIES) {
    const needed = requiredKeys(path);
    assert.ok(needed.length >= 5, `${name} 的 ctx 解构解析结果太少（${needed.length}），解析器可能没对上源码形状`);
    const provided = providedKeys(name);
    assert.ok(provided.size >= 5, `${name} 的 ctx 调用点解析结果太少（${provided.size}）`);
    const missing = needed.filter((key) => !provided.has(key));
    if (missing.length > 0) report.push(`${name} 缺少: ${missing.join(', ')}`);
  }
  assert.deepEqual(report, [], `AppShell 的 ctx 装配有缺口 → 运行时会是 \`x is not a function\`:\n${report.join('\n')}`);
});

test('the draft handlers get the context-usage feed used by the restore paths', () => {
  // 回归点：这两个键曾经没递进去，恢复更早轮次的执行记录整条路都在 TypeError 上停住。
  const provided = providedKeys('createDraftConversationHandlers');
  assert.ok(provided.has('applyContextUsage'));
  assert.ok(provided.has('latestContextUsageFromTasks'));
  const draftHandlers = readFileSync(
    new URL('../../src/features/conversations/hooks/createDraftConversationHandlers.js', import.meta.url),
    'utf8',
  );
  // 缺口确实落在恢复路径上：两个 restore 函数都拿它们喂表盘。
  assert.match(draftHandlers, /applyContextUsage\(\s*\n\s*latestContextUsageFromTasks\(/);
  assert.match(draftHandlers, /applyContextUsage\(\s*\n\s*latestContextUsageFromTasks\(\[normalizedTask\], targetConversationId\)/);
});
