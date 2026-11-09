// 规则 1：render 期 ref 镜写点。
//
// 能拦住什么
//   `xxxRef.current = <值>` 写在组件 / hook 的函数体顶层（不在 effect、事件处理器、
//   useCallback、useMemo 里）时，值只是一个「上一帧的快照」。如果它镜写的这份值同时
//   还有另一个所有者（同一文件里的 useState/useReducer，或者某个 hook 返回的
//   store 值），就出现了「同一份值两个地方各持一份」：读一处、写另一处，屏幕上
//   看得见、store 里永远是旧值。ChatComposer 的草稿 bug 就是这一族——读外置
//   store 的 draft，写入却落在组件里的 useState，1604 条测试全绿。
//
// 拦不住什么
//   · effect / 事件处理器 / useCallback 里的 ref 写入（那是正常用法，规则不看）；
//   · 跨文件的「两个所有者」（ref 在 A 文件、state 在 B 文件）；
//   · 值经过函数调用、下标、三元表达式绕一圈才写进 ref 的情况（RHS 取不到标识符）；
//   · 根本没有另一个所有者的镜写（初始化缓存、镜像 props/入参）——这一类不报，
//     只在 `--list` 的清单里出现。给它们也立白名单只会训练大家无脑加条目。
//
// 命中怎么处理
//   这条规则报的是「这里有两个所有者，请写一句为什么」，不一定是 bug。既有命中
//   全部钉在 scripts/architecture-rules/wiring-whitelist.json 的 renderRefMirrors
//   里，每条带理由；`sites` 记同一 (文件, ref) 的写入点数，再多一处就红。

import { topLevelEntries } from './source-scan.js';

const REF_WRITE = /([A-Za-z_$][\w$]*)\s*\.\s*current\s*=(?!=)/g;

// 这些 hook 的返回值不是「另一份可变所有权」：ref 自己、派生值、生命周期。
const NON_CARRIER_HOOKS = new Set([
  'useRef', 'useCallback', 'useMemo', 'useEffect', 'useLayoutEffect', 'useInsertionEffect',
  'useImperativeHandle', 'useId', 'useTransition', 'useDeferredValue', 'useDebugValue',
  'useOptimistic', 'useActionState', 'useFormStatus',
]);

const HOOK_CALL = /^(?:React\s*\.\s*)?(use[A-Z][\w$]*)\s*\(/;

/** 同一文件里 `const x = <表达式>` 的所有者类型。state/store 才算「另一份承载」。 */
function bindingKinds(masked) {
  const kinds = new Map();
  const record = (name, kind, expression) => {
    if (!name || kinds.has(name)) return;
    kinds.set(name, { kind, expression: expression.replace(/\s+/g, ' ').trim().slice(0, 60) });
  };
  const kindOf = (expression) => {
    const hook = expression.trim().match(HOOK_CALL);
    if (!hook) return 'plain';
    if (hook[1] === 'useState' || hook[1] === 'useReducer') return 'state';
    if (NON_CARRIER_HOOKS.has(hook[1])) return 'derived';
    return 'store';
  };

  // const [value, setValue] = useState(...)
  for (const match of masked.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]\s*=\s*([^\n;]+)/g)) {
    const [first] = match[1].split(',');
    record(first.trim().split('=')[0].trim(), kindOf(match[2]), match[2]);
  }
  // const { a, b = 1 } = useSomething(...)
  for (const match of masked.matchAll(/(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*([^\n;]+)/g)) {
    const kind = kindOf(match[2]);
    for (const name of match[1].split(',')) {
      record(name.split(/[:=]/)[0].trim().replace(/^\.\.\./, ''), kind, match[2]);
    }
  }
  // const value = useSomething(...)
  for (const match of masked.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]+)/g)) {
    record(match[1], kindOf(match[2]), match[2]);
  }
  return kinds;
}

/** 赋值语句右值的区间：深度 0 的 `;` 或换行处结束。 */
function rhsRange(masked, start) {
  let depth = 0;
  let end = start;
  for (let i = start; i < masked.length; i += 1) {
    const ch = masked[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && (ch === ';' || ch === '\n')) break;
    end = i;
  }
  return [start, end + 1];
}

/** 右值里「直接搬进 ref」的标识符：裸标识符，或对象字面量里的简写键 / 裸值。 */
function rhsRoots(expression) {
  const roots = [];
  const trimmed = expression.trim();
  if (!trimmed) return roots;
  if (trimmed.startsWith('{')) {
    for (const entry of topLevelEntries(trimmed)) {
      if (entry.spread) { roots.push(entry.key); continue; }
      if (!entry.value) { roots.push(entry.key); continue; }
      const bare = entry.value.match(/^([A-Za-z_$][\w$]*)$/);
      if (bare) roots.push(bare[1]);
    }
    return roots;
  }
  const leading = trimmed.match(/^([A-Za-z_$][\w$]*)/);
  if (!leading) return roots;
  const rest = trimmed.slice(leading[0].length).trimStart();
  if (rest.startsWith('(') || rest.startsWith('?.')) return roots;
  roots.push(leading[1]);
  return roots;
}

export function collectRenderRefMirrors(views) {
  const inventory = [];
  const violations = [];

  for (const view of views) {
    const { path, masked, braces, parens, bodies } = view;
    // 没有 `.current` 的文件连表都不建（bindingKinds 是三趟全文正则）。
    if (!/\.\s*current\b/.test(masked)) continue;
    let kinds = null;
    const kindsFor = () => {
      if (!kinds) kinds = bindingKinds(masked);
      return kinds;
    };

    for (const match of masked.matchAll(REF_WRITE)) {
      const index = match.index;
      const enclosing = bodies
        .filter((body) => body.start < index && index < body.end)
        .sort((a, b) => b.start - a.start);
      const owner = enclosing[0];
      // 只认「组件 / hook 的函数体顶层」：外面还套着一层函数就是回调/effect，跳过。
      if (!owner || enclosing[1]) continue;
      if (!owner.name || !(/^[A-Z]/.test(owner.name) || /^use[A-Z][\w$]*$/.test(owner.name))) continue;

      const [from, to] = rhsRange(masked, index + match[0].length);
      const roots = rhsRoots(masked.slice(from, to));
      const carriers = roots
        .map((name) => ({ name, ...(kindsFor().get(name) || { kind: 'unknown', expression: '' }) }))
        .filter((entry) => entry.kind === 'state' || entry.kind === 'store');

      const entry = {
        file: path,
        line: view.lineAt(index),
        fn: owner.name,
        ref: match[1],
        carriers,
      };
      inventory.push(entry);
      if (carriers.length === 0) continue;
      violations.push({
        ...entry,
        key: `${path}::${match[1]}`,
        sites: 1,
      });
    }
  }

  // 同一 (文件, ref) 的多处写入合并成一条，`sites` 是写入点数。
  const merged = new Map();
  for (const violation of violations) {
    const existing = merged.get(violation.key);
    if (existing) {
      existing.sites += 1;
      existing.lines.push(violation.line);
      existing.carriers.push(...violation.carriers);
      continue;
    }
    merged.set(violation.key, { ...violation, lines: [violation.line] });
  }

  return {
    inventory,
    violations: [...merged.values()],
  };
}

export function describeRenderRefMirror(violation) {
  const carriers = [...new Map(violation.carriers.map((c) => [c.name, c])).values()]
    .map((carrier) => `${carrier.name} (${carrier.kind}, ${carrier.expression})`)
    .join(', ');
  const where = violation.lines.map((line) => `${violation.file}:${line}`).join(' / ');
  return `${where}: render 期镜写 ${violation.ref}.current，而 ${carriers} 已经有另一份承载 —— 同一个值两个所有者（读一处、写另一处就是这么长出来的）。要么把 ref 改成从那个所有者派生，要么在这里写一句为什么必须留两份，并登记到 wiring-whitelist.json 的 renderRefMirrors。`;
}
