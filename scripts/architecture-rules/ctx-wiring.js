// 规则 3：工厂 ctx 解构出的键，装配点必须递进去。
//
// 能拦住什么
//   `createXxxHandlers(ctx)` 这类工厂从 ctx 里解构出 N 个键，装配点（`createXxxHandlers({...})`）
//   少递一个，既不会编译报错、也不会让任何行为测试变红——跑到那一行才炸成
//   `x is not a function`。本仓就出过：「向上翻页加载更早步骤」整条恢复路径挂在
//   `applyContextUsage(latestContextUsageFromTasks(...))` 上，因为 createDraftConversationHandlers
//   的 ctx 少递了两个键；更早的轮次再也补不上执行记录，聊天里只剩一条
//   “Could not load earlier steps. Retry loading steps”，而当时 1604 条测试全绿。
//
// 判定口径
//   · 工厂 = `function createXxx(<参数>)`，参数要么是解构 `({ a, b })`，要么是单个
//     标识符且函数体里有 `const { a, b } = ctx;`（本仓是后者为主）。
//   · 装配点 = 任意源码里的 `createXxx({...})` 字面量调用；`createXxx(someVariable)`
//     这种变量间接装配**判不了**，整个工厂跳过（宁可漏报）。
//   · `{ ...ctx, extra }` 这种展开：若 `...ctx` 就是外层工厂自己的 ctx 参数，就把外层
//     工厂装配点的键并进来（递归，带环保护）；不是这个形状就当未知，整个工厂跳过。
//   · 只比对**必填键**：解构里有默认值（`{ a = 1 }`）的键不要求装配点提供。
//   · 判定按「任何装配点都没提供」算（同一工厂多处装配时取并集），这是任务口径；
//     单个装配点漏传、另一个补上了的情况不报。
//
// 拦不住什么
//   · 变量间接装配、`Object.assign` 拼装、测试里手工拼的 ctx；
//   · 传了但值不对（`undefined` / 类型错）——这是类型检查的活；
//   · 运行时才通过 `ctx.x` 前缀访问、没有解构的键（规则看不见）。

import { topLevelEntries } from './source-scan.js';

const FACTORY_DEFINITION = /function\s+(create[A-Z][\w$]*)\s*\(/g;

/** 工厂的必填/可选键。 */
function factoryProfile(source, masked, parens, match) {
  const name = match[1];
  const parenOpen = match.index + match[0].length - 1;
  const parenClose = parens.get(parenOpen);
  if (parenClose === undefined) return null;
  const params = masked.slice(parenOpen + 1, parenClose);
  if (/^\s*\{/.test(params)) {
    const keys = topLevelEntries(params.trim());
    return { name, form: 'parameter', paramName: null, keys, parenOpen, parenClose };
  }
  const parameter = params.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:=[^,]*)?$/);
  if (!parameter) return null;
  const bodyStart = masked.indexOf('{', parenClose);
  if (bodyStart === -1) return null;
  const destructure = masked
    .slice(bodyStart)
    .match(new RegExp(`const\\s*\\{([\\s\\S]*?)\\}\\s*=\\s*${parameter[1]};`));
  if (!destructure) return null;
  return {
    name,
    form: 'body',
    paramName: parameter[1],
    keys: topLevelEntries(`{${destructure[1]}}`),
    parenOpen,
    parenClose,
  };
}

export function collectCtxWiring(views) {
  const contexts = new Map(views.map((view) => [view.path, view]));

  // 1) 工厂清单
  const factories = [];
  for (const view of views) {
    for (const match of view.masked.matchAll(FACTORY_DEFINITION)) {
      const profile = factoryProfile(view.source, view.masked, view.parens, match);
      if (!profile) continue;
      factories.push({ ...profile, path: view.path, line: view.lineAt(match.index) });
    }
  }
  const factoryNames = new Set(factories.map((factory) => factory.name));

  // 2) 装配点：一遍扫完所有 `createXxx(`，再按工厂名分档（而不是每个工厂各扫一遍源码）。
  const callSites = new Map(factories.map((factory) => [factory, []]));
  for (const view of views) {
    const { masked, braces } = view;
    for (const match of masked.matchAll(/\b(create[A-Z][\w$]*)\s*\(/g)) {
      const name = match[1];
      if (!factoryNames.has(name)) continue;
      // `function createX(` 是定义，不是调用
      if (/\bfunction\s+$/.test(masked.slice(Math.max(0, match.index - 24), match.index))) continue;
      let cursor = match.index + match[0].length;
      while (/\s/.test(masked[cursor])) cursor += 1;
      const site = { path: view.path, line: view.lineAt(match.index), index: cursor };
      if (masked[cursor] !== '{') {
        site.unresolved = masked.slice(cursor).match(/^[A-Za-z_$][\w$]*/)?.[0] || '?';
      } else {
        const close = braces.get(cursor);
        if (close === undefined) continue;
        const entries = topLevelEntries(masked.slice(cursor, close + 1));
        site.provided = entries.filter((entry) => !entry.spread).map((entry) => entry.key);
        site.spreads = entries.filter((entry) => entry.spread).map((entry) => entry.key);
      }
      for (const factory of factories) {
        if (factory.name === name) callSites.get(factory).push(site);
      }
    }
  }

  // 3) 递归解析 `...ctx`：装配点提供的键 = 外层工厂装配点提供的键
  const resolved = new Map(); // factory → Set | null
  const resolving = new Set();
  const providedKeys = (factory) => {
    if (resolved.has(factory)) return resolved.get(factory);
    if (resolving.has(factory)) return null; // 环：按未知处理
    resolving.add(factory);
    const sites = callSites.get(factory) || [];
    if (sites.length === 0) {
      resolving.delete(factory);
      resolved.set(factory, null);
      return null;
    }
    const keys = new Set();
    let complete = true;
    for (const site of sites) {
      if (site.unresolved) { complete = false; break; }
      for (const key of site.provided) keys.add(key);
      for (const spread of site.spreads) {
        const ownerSite = enclosingFactoryOf(site, contexts, factories);
        const inherited = ownerSite && spread === ownerSite.paramName ? providedKeys(ownerSite) : null;
        if (!inherited) { complete = false; break; }
        for (const key of inherited) keys.add(key);
      }
      if (!complete) break;
    }
    resolving.delete(factory);
    const value = complete ? keys : null;
    resolved.set(factory, value);
    return value;
  };

  function enclosingFactoryOf(site, contextsByPath, factoryList) {
    const context = contextsByPath.get(site.path);
    if (!context) return null;
    const owners = factoryList
      .filter((candidate) => candidate.path === site.path && candidate.form === 'body')
      .filter((candidate) => candidate.parenOpen < site.index)
      .sort((a, b) => b.parenOpen - a.parenOpen);
    for (const owner of owners) {
      const bodyStart = context.masked.indexOf('{', owner.parenClose);
      const bodyEnd = context.braces.get(bodyStart);
      if (bodyStart < site.index && site.index < bodyEnd) return owner;
    }
    return null;
  }

  const violations = [];
  let skipped = 0;
  let checked = 0;
  for (const factory of factories) {
    const required = factory.keys.filter((entry) => !entry.optional).map((entry) => entry.key);
    if (required.length === 0) continue;
    const sites = callSites.get(factory) || [];
    const provided = providedKeys(factory);
    if (!provided) { skipped += 1; continue; }
    checked += 1;
    const missing = required.filter((key) => !provided.has(key));
    if (missing.length === 0) continue;
    violations.push({
      key: `${factory.name}::${missing.join('|')}`,
      factory: factory.name,
      file: factory.path,
      line: factory.line,
      missing,
    });
  }

  return {
    inventory: factories.map((factory) => ({
      name: factory.name,
      path: factory.path,
      line: factory.line,
      form: factory.form,
      keys: factory.keys.length,
      required: factory.keys.filter((entry) => !entry.optional).length,
      sites: (callSites.get(factory) || []).length,
    })),
    violations,
    stats: { factories: factories.length, checked, skipped },
  };
}

export function describeCtxWiring(violation) {
  return `${violation.file}:${violation.line} 的工厂 ${violation.factory} 从 ctx 解构出 ${violation.missing.join(', ')}，但没有任何装配点递进去 —— 这一行要等到运行时才炸成「x is not a function」。把键补进装配点的 ctx 字面量，或给解构加默认值。`;
}
