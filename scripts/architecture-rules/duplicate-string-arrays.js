// 规则 2：同一个语义数组在多个文件里各定义一次。
//
// 能拦住什么
//   一个字面量里全是字符串的数组（`.includes(...)` 的白名单、`new Set([...])` 的词表、
//   `Object.fromEntries` 的字段表），在**不同文件**里出现两次以上、且成员集合完全相同，
//   就是「同一个语义值定义了两份」。改一处忘另一处，就会出现「这边认 llm/embedding/
//   compact，那边少一个」这类静默分叉。
//
// 拦不住什么（都是有意放过的，否则规则会天天喊狼来了）
//   · 近似但不相同的数组：共享 3 个成员但各自多一个的「近亲」。校验词表之间天然会
//     共享 done/failed/cancelled 这类通用词，按「共享 ≥3」判会把状态词表和工具词表
//     判成一回事。这条规则只认**集合完全相等**，比「≥3 个相同成员」更保守。
//   · 同一个文件里的两处定义（比如相邻的两个分支名表）——不是「多个文件」。
//   · 对象数组（`[{ id: ... }]`）、用 spread / concat 拼出来的数组、动态生成的表。
//
// 命中怎么处理
//   既有命中钉在 wiring-whitelist.json 的 duplicateStringArrays 里，key 是排序后的
//   成员用逗号连接；`sites` 是当前定义处数，再多一处就红。

const MIN_MEMBERS = 3;

/** 顶层逗号切分：返回 [start, end] 片段（相对 inner）。 */
function splitTopLevel(innerMasked) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < innerMasked.length; i += 1) {
    const ch = innerMasked[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push([start, i]);
      start = i + 1;
    }
  }
  parts.push([start, innerMasked.length]);
  return parts;
}

/** 纯字符串数组的成员；不是纯字符串数组就返回 null。 */
function stringMembers(innerRaw, innerMasked) {
  const parts = splitTopLevel(innerMasked).filter(([from, to]) => innerRaw.slice(from, to).trim());
  if (parts.length < MIN_MEMBERS) return null;
  const members = [];
  for (const [from, to] of parts) {
    const literal = innerRaw.slice(from, to).trim().match(/^'([^'\\]*)'$|^"([^"\\]*)"$/);
    if (!literal) return null;
    members.push(literal[1] ?? literal[2]);
  }
  return members;
}

export function collectDuplicateStringArrays(views) {
  const arrays = [];
  for (const view of views) {
    const { path, source, masked } = view;
    const stack = [];
    for (const bracket of masked.matchAll(/[[\]]/g)) {
      if (masked[bracket.index] === '[') stack.push(bracket.index);
      else {
        const open = stack.pop();
        if (open === undefined) continue;
        const close = bracket.index;
        // 快速排除：纯字符串数组的第一个成员必须是引号。
        let first = open + 1;
        while (first < close && /\s/.test(masked[first])) first += 1;
        if (masked[first] !== "'" && masked[first] !== '"') continue;
        const members = stringMembers(source.slice(open + 1, close), masked.slice(open + 1, close));
        if (!members) continue;
        arrays.push({ path, line: view.lineAt(open), members });
      }
    }
  }

  const groups = new Map();
  for (const array of arrays) {
    const key = [...new Set(array.members)].sort().join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(array);
  }

  const violations = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    if (new Set(list.map((entry) => entry.path)).size < 2) continue;
    violations.push({
      key,
      members: [...new Set(list[0].members)].sort(),
      sites: list.length,
      locations: list.map((entry) => `${entry.path}:${entry.line}`),
    });
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { inventory: arrays, violations };
}

export function describeDuplicateStringArray(violation) {
  return `同一个字符串数组在 ${new Set(violation.locations.map((location) => location.split(':')[0])).size} 个文件里各定义了一次 [${violation.members.join(', ')}] —— ${violation.locations.join(', ')}。搬到一个模块里导出，别让两份各自演化。`;
}
