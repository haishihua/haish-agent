// 「接线」规则共用的最小源码扫描器。
//
// 为什么不用一条正则了事：三条规则都要落到「函数作用域」这一层——
//   · 规则 1 要区分「组件函数体顶层」和「effect / 事件处理器 / useCallback 里」；
//   · 规则 3 要区分「工厂的定义」和「工厂的装配调用点」。
// 这里不做完整 AST，只维护位置对齐的三份视图，再做括号配对：
//   · source     原始源码（用来展示、取字符串字面量的内容）；
//   · commentless 注释抹成空格（长度不变，便于按下标取原文）；
//   · masked      注释 + 字符串/模板内容都抹成空格（长度不变）。
// masked 上的括号配对才不会被字符串里的 `{` 骗到。
//
// 明确做不到的（一律按「看不见」处理，宁可漏报也不误报）：
//   · 正则字面量里的括号/引号（本仓库目前没有把它们写进结构位置的用法）；
//   · 用变量间接装配（`createX(someCtx)`）、`Object.assign` 拼出来的 ctx；
//   · 通过字符串拼接 / 动态 key 定义的数组与 ctx 键。

/** 注释抹成空格，字符串原样保留（长度、换行、列号都不变）。 */
export function stripComments(source) {
  const out = source.split('');
  let mode = 'code';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (mode === 'code') {
      if (ch === '/' && next === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 'line'; i += 1; continue; }
      if (ch === '/' && next === '*') { out[i] = ' '; out[i + 1] = ' '; mode = 'block'; i += 1; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { mode = ch; continue; }
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') mode = 'code';
      else out[i] = ' ';
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 'code'; i += 1; continue; }
      if (ch !== '\n') out[i] = ' ';
      continue;
    }
    // 字符串 / 模板字面量内部：原样保留
    if (ch === '\\') { i += 1; continue; }
    if (ch === mode) mode = 'code';
  }
  return out.join('');
}

/**
 * 注释与字符串内容都抹成空格，引号本身保留（长度不变）。
 * `{`/`}`/`(`/`)` 只会剩下语法意义上的那些，括号配对因此可靠。
 *
 * 实现按「片段」而不是逐字符写入：源码 99% 是代码，直接把原串切片扔进 parts，
 * 只有注释/字符串片段才做一次 replace 抹白。逐步改写每个字符会把 1.9MB 源码变成
 * 190 万次数组写，那是这个脚本里唯一值得管的开销。
 */
export function maskSource(source) {
  const parts = [];
  // 模板字面量里的 `${ ... }` 要按代码处理，才能正确跨过嵌套的括号。
  // 栈里每个元素是那一层 `${}` 内部的深度：0 表示在模板文本段，≥1 表示在表达式里。
  const templates = [];
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  const inExpression = () => templates.length > 0 && templates[templates.length - 1] > 0;
  // 刻意不含 `<`、`>`、`}`：JSX 的 `</div>` 与自闭合标签的 `/>` 会把那枚 `/`
  // 误当成正则开头，白白把同行剩下的代码抹掉（`a < /re/`、`x = {} /2/` 这类写法现实中不存在）。
  const REGEX_PRECEDING = '([,=:[!&|?{;+-*%~^';
  const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await']);
  // `/` 是除号还是正则开头：看前一个有效字符 / 关键字。认不出来就按除号算（宁可少抹）。
  const regexStart = (index) => {
    if (source[index + 1] === '>') return false; // 自闭合 JSX 标签的 `/>`
    let back = index - 1;
    while (back >= 0 && /\s/.test(source[back])) back -= 1;
    if (back < 0) return true;
    if (REGEX_PRECEDING.includes(source[back])) return true;
    let word = back;
    while (word >= 0 && /[\w$]/.test(source[word])) word -= 1;
    return REGEX_KEYWORDS.has(source.slice(word + 1, back + 1));
  };
  let i = 0;

  while (i < source.length) {
    // 模板文本段：抹到下一个 ` 或 ${
    if (templates.length > 0 && !inExpression()) {
      let end = i;
      while (end < source.length && source[end] !== '`' && !(source[end] === '$' && source[end + 1] === '{')) {
        end += source[end] === '\\' ? 2 : 1;
      }
      if (end >= source.length) { parts.push(blank(source.slice(i))); break; }
      parts.push(blank(source.slice(i, end)));
      if (source[end] === '`') { parts.push('`'); templates.pop(); i = end + 1; continue; }
      parts.push('  ');
      templates[templates.length - 1] = 1;
      i = end + 2;
      continue;
    }

    const ch = source[i];
    const next = source[i + 1] || '';
    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      parts.push(blank(source.slice(i, end)));
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      let end = source.indexOf('*/', i + 2);
      end = end === -1 ? source.length : end + 2;
      parts.push(blank(source.slice(i, end)));
      i = end;
      continue;
    }
    if (ch === '/' && regexStart(i)) {
      // 正则字面量：内容也要抹白（`/[{}]/`、`/['"]/` 会把括号配对和引号处理全带沟里），
      // 只留下开闭的 `/`，长度不变。
      let end = i + 1;
      let inClass = false;
      let closed = false;
      while (end < source.length) {
        const code = source[end];
        if (code === '\\') { end += 2; continue; }
        if (code === '\n') break;
        if (code === '[') inClass = true;
        else if (code === ']') inClass = false;
        else if (code === '/' && !inClass) { closed = true; break; }
        end += 1;
      }
      if (closed) {
        parts.push('/');
        parts.push(blank(source.slice(i + 1, end)));
        parts.push('/');
        i = end + 1;
        continue;
      }
      // 行内没闭包 → 本来就是除号，当作普通代码往下走。
    }
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === ch) break;
        end += 1;
      }
      parts.push(ch);
      parts.push(blank(source.slice(i + 1, Math.min(end, source.length))));
      if (end < source.length) parts.push(ch);
      i = Math.min(end, source.length) + (end < source.length ? 1 : 0);
      continue;
    }
    if (ch === '`') {
      parts.push('`');
      templates.push(0);
      i += 1;
      continue;
    }
    if (inExpression()) {
      if (ch === '{') { templates[templates.length - 1] += 1; }
      else if (ch === '}') {
        if (templates[templates.length - 1] === 1) {
          parts.push(' ');
          templates[templates.length - 1] = 0;
          i += 1;
          continue;
        }
        templates[templates.length - 1] -= 1;
      }
    }
    // 普通代码：成段拷过去，遇到下一个「可能改变状态」的字符就停。
    let end = i + 1;
    while (end < source.length) {
      const code = source[end];
      if (code === '/' || code === '"' || code === "'" || code === '`') break;
      if (inExpression() && (code === '{' || code === '}')) break;
      end += 1;
    }
    parts.push(source.slice(i, end));
    i = end;
  }
  return parts.join('');
}

/** 括号配对表：开括号下标 ↔ 闭括号下标。只对 masked 视图有意义。 */
export function pairMaps(masked) {
  const braces = new Map();
  const parens = new Map();
  const braceStack = [];
  const parenStack = [];
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === '{') braceStack.push(i);
    else if (ch === '}') {
      const open = braceStack.pop();
      if (open !== undefined) { braces.set(open, i); braces.set(i, open); }
    } else if (ch === '(') parenStack.push(i);
    else if (ch === ')') {
      const open = parenStack.pop();
      if (open !== undefined) { parens.set(open, i); parens.set(i, open); }
    }
  }
  return { braces, parens };
}

const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'typeof', 'await',
  'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'yield', 'case',
]);

/**
 * 所有「带花括号正文」的函数（声明 / 表达式 / 箭头 / 方法简写）的区间。
 * 返回 [{ start, end, name, kind }]，start/end 是花括号下标，name 可能是 null。
 */
export function functionBodies(masked, braces, parens) {
  const bodies = [];
  const seen = new Set();
  const push = (start, name, kind) => {
    if (!braces.has(start) || seen.has(start)) return;
    seen.add(start);
    bodies.push({ start, end: braces.get(start), name, kind });
  };
  const nextNonSpace = (from) => {
    let index = from;
    while (index < masked.length && /\s/.test(masked[index])) index += 1;
    return index;
  };

  // `=> { ... }`
  for (let index = masked.indexOf('=>'); index !== -1; index = masked.indexOf('=>', index + 1)) {
    const brace = nextNonSpace(index + 2);
    if (masked[brace] !== '{') continue;
    const assign = masked
      .slice(Math.max(0, index - 300), index)
      .match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)?\s*$/);
    push(brace, assign?.[1] || null, 'arrow');
  }

  // `function name(...) { ... }`
  for (const match of masked.matchAll(/\bfunction\b/g)) {
    const after = match.index + 'function'.length;
    const head = masked.slice(after).match(/^\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/);
    if (!head) continue;
    const parenOpen = after + head[0].length - 1;
    if (!parens.has(parenOpen)) continue;
    const brace = nextNonSpace(parens.get(parenOpen) + 1);
    if (masked[brace] !== '{') continue;
    push(brace, head[1] || null, 'function');
  }

  // 方法简写 `name(args) { ... }`
  for (const match of masked.matchAll(/\)\s*\{/g)) {
    const parenOpen = parens.get(match.index);
    if (parenOpen === undefined) continue;
    const name = masked.slice(Math.max(0, parenOpen - 80), parenOpen).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    if (!name || CONTROL_KEYWORDS.has(name)) continue;
    push(match.index + match[0].length - 1, name, 'method');
  }

  return bodies;
}

/**
 * 对象字面量 / 解构模式的顶层条目。
 * 返回 [{ key, value, optional, spread }]：
 *   · `{ a, b: c.d, e = 1, ...rest }` → a(shorthand) / b: c.d / e(optional) / rest(spread)
 *   · 注释应当已经被 maskSource/stripComments 抹掉。
 */
export function topLevelEntries(objectSource) {
  const close = objectSource.lastIndexOf('}');
  const body = objectSource.slice(1, close === -1 ? undefined : close);
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
    const value = colonAt === -1 ? '' : entry.slice(colonAt + 1).trim();
    const spread = head.startsWith('...');
    const key = head.split('=')[0].trim().replace(/^\.\.\./, '');
    if (key) entries.push({ key, value, optional: /=(?!=)/.test(head), spread });
  };
  for (const ch of body) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { flush(); continue; }
    current += ch;
  }
  flush();
  return entries;
}

/**
 * 一次算出三条规则都要的三份视图，避免每条规则各扫一遍源码（331 个模块 × 3 遍是白花的时间）。
 * 输入 [{ path, source }]，输出 [{ path, source, masked, braces, parens, bodies, lineAt }]。
 */
export function buildViews(modules) {
  return modules.map((module) => {
    const masked = maskSource(module.source);
    const { braces, parens } = pairMaps(masked);
    let lineStarts = null;
    const lineAt = (index) => {
      if (!lineStarts) {
        lineStarts = [0];
        for (let i = 0; i < module.source.length; i += 1) if (module.source[i] === '\n') lineStarts.push(i + 1);
      }
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (lineStarts[middle] <= index) low = middle;
        else high = middle - 1;
      }
      return low + 1;
    };
    // 函数作用域只有规则 1 用得上，按需算（331 个模块全量算是纯浪费）。
    let bodies = null;
    return {
      path: module.path,
      source: module.source,
      masked,
      braces,
      parens,
      get bodies() {
        if (!bodies) bodies = functionBodies(masked, braces, parens);
        return bodies;
      },
      lineAt,
    };
  });
}

/**
 * 白名单核对：命中即放行并记录；未命中的违规交给调用方报错。
 * whitelist: { "key": { sites?, reason } }
 */
export function applyWhitelist(violations, whitelist = {}) {
  const used = new Set();
  const unresolved = [];
  for (const violation of violations) {
    const entry = whitelist[violation.key];
    if (!entry || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      unresolved.push(violation);
      continue;
    }
    used.add(violation.key);
    if (typeof entry.sites === 'number' && violation.sites > entry.sites) {
      unresolved.push({ ...violation, stale: true, allowed: entry.sites });
    }
  }
  const idle = Object.keys(whitelist).filter((key) => !used.has(key));
  return { unresolved, idle };
}
