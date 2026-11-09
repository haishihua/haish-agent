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
//     这种变量间接装配**判不了**，该装配点跳过（宁可漏报）。
//   · `{ ...ctx, extra }` 这种展开：若 `...ctx` 就是外层工厂自己的 ctx 参数，递归取
//     外层所有装配点共同提供的键（带环保护）；不认识的展开按未知处理。
//   · 只比对**必填键**：解构里有默认值（`{ a = 1 }`）的键不要求装配点提供。
//   · 每个装配点独立核对；无法确定的装配点单独跳过，不影响其他装配点。
//
// 拦不住什么
//   · 变量间接装配、`Object.assign` 拼装、测试里手工拼的 ctx；
//   · 传了但值不对（`undefined` / 类型错）——这是类型检查的活；
//   · 运行时才通过 `ctx.x` 前缀访问、没有解构的键（规则看不见）。

import { topLevelEntries } from './source-scan.js';

const FACTORY_DEFINITION = /function\s+(create[A-Z][\w$]*)\s*\(/g;

/** 工厂的必填/可选键。 */
function factoryProfile(masked, braces, parens, match) {
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
  const bodyEnd = braces.get(bodyStart);
  if (bodyStart === -1 || bodyEnd === undefined) return null;
  const destructure = masked
    .slice(bodyStart, bodyEnd)
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
      const profile = factoryProfile(view.masked, view.braces, view.parens, match);
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

  // 一个展开能保证的键是外层所有装配点的交集，而不是并集。未知展开保守跳过；
  // 已显式提供的键仍然确定，循环展开不缓存，避免因遍历顺序污染其他路径。
  const providedAt = (site, stack = new Set()) => {
    if (site.unresolved) return { keys: new Set(), unknown: true };
    const keys = new Set(site.provided);
    let unknown = false;
    for (const spread of site.spreads) {
      const owner = enclosingFactoryOf(site, contexts, factories);
      if (!owner || spread !== owner.paramName || stack.has(owner)) { unknown = true; continue; }
      const ownerSites = callSites.get(owner) || [];
      if (ownerSites.length === 0) { unknown = true; continue; }
      const nextStack = new Set(stack).add(owner);
      const possibilities = ownerSites.map((ownerSite) => providedAt(ownerSite, nextStack));
      const common = new Set(possibilities[0].keys);
      for (const possibility of possibilities) {
        if (possibility.unknown) unknown = true;
        for (const key of common) if (!possibility.keys.has(key)) common.delete(key);
      }
      for (const key of common) keys.add(key);
    }
    return { keys, unknown };
  };

  const violations = [];
  let skipped = 0;
  let checked = 0;
  let skippedSites = 0;
  let checkedSites = 0;
  for (const factory of factories) {
    const required = factory.keys.filter((entry) => !entry.optional).map((entry) => entry.key);
    if (required.length === 0) continue;
    const sites = callSites.get(factory) || [];
    let factoryChecked = false;
    for (const site of sites) {
      const provided = providedAt(site, new Set([factory]));
      const missing = required.filter((key) => !provided.keys.has(key));
      if (provided.unknown && missing.length > 0) { skippedSites += 1; continue; }
      checkedSites += 1;
      factoryChecked = true;
      if (missing.length === 0) continue;
      violations.push({
        key: `${factory.name}::${site.path}:${site.line}::${missing.join('|')}`,
        factory: factory.name,
        file: site.path,
        line: site.line,
        missing,
      });
    }
    if (factoryChecked) checked += 1;
    else skipped += 1;
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
    stats: { factories: factories.length, checked, skipped, checkedSites, skippedSites },
  };
}

export function describeCtxWiring(violation) {
  return `${violation.file}:${violation.line} 调用 ${violation.factory} 时缺少必填 ctx 键 ${violation.missing.join(', ')}；请检查该装配点或确认工厂是否需要默认值。`;
}
