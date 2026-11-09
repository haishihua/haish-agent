#!/usr/bin/env node
// 源码断言健康度：统计「断言读源码得到的字符串」的测试条数。
//
// 这类断言只在源码文本变化时失败——改个变量名、拆个函数、换个写法都会红，
// 哪怕行为完全没变。它们应该是少数（守「某个值只在一处定义」这类不变量），
// 不该成为主要手段。这里把存量钉成基线，只许降不许升。
//
// 口径：测试文件里 `const X = readFileSync(...)` 得到的变量，被
// `assert.match(X` / `assert.doesNotMatch(X` / `assert.equal(X` 直接断言。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const TESTS_DIR = 'app-web/tests';
const BASELINE = 'scripts/test-source-assert-baseline.json';

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.test.js')) out.push(path);
  }
  return out;
};

const collect = () => {
  const perFile = {};
  for (const file of walk(TESTS_DIR)) {
    const source = readFileSync(file, 'utf8');
    // 同一个测试文件里常见 `const source = readFileSync(...)` 反复出现（每个用例读一次），
    // 去重后按变量名统计，否则同名变量会被按出现次数重复累加——基线因此虚高，
    // 而虚高的基线等于放行回涨：新增的断言只要没顶破那个假数字就静默通过。
    const vars = [...new Set(
      [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)\s*=>\s*)?\s*(?:\n\s*)?fs\.readFileSync|const\s+([A-Za-z_$][\w$]*)\s*=\s*readFileSync/g)]
        .map((match) => match[1] || match[2]),
    )];
    if (vars.length === 0) continue;
    let count = 0;
    for (const variable of vars) {
      // 直接断言：assert.match / doesNotMatch / equal 把源码变量当对象。
      const direct = new RegExp(`assert\\.(?:match|doesNotMatch|equal)\\(\\s*${variable}\\b`, 'g');
      // 间接断言：assert.ok(source.includes('...')) 同样是「源码文本变了就红」，
      // 以前完全不计，等于给这类断言开了免检通道。
      const viaIncludes = new RegExp(`assert\\.(?:ok|equal)\\(\\s*!?\\s*${variable}\\.includes\\(`, 'g');
      count += (source.match(direct) || []).length;
      count += (source.match(viaIncludes) || []).length;
    }
    if (count > 0) perFile[relative(TESTS_DIR, file)] = count;
  }
  return perFile;
};

const current = collect();
const total = Object.values(current).reduce((sum, n) => sum + n, 0);

if (process.argv.includes('--write-baseline')) {
  const ordered = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  const payload = { total, files: ordered };
  const fs = await import('node:fs');
  fs.writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`baseline written: ${total} assertions in ${Object.keys(current).length} files`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`missing ${BASELINE}; run: node scripts/check-test-health.mjs --write-baseline`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const problems = [];
if (total > baseline.total) {
  problems.push(`source-reading assertions grew: ${baseline.total} → ${total}`);
}
for (const [file, count] of Object.entries(current)) {
  const allowed = baseline.files[file] ?? 0;
  if (count > allowed) problems.push(`${file}: ${allowed} → ${count}`);
}

if (problems.length > 0) {
  console.error('Source-reading assertion budget exceeded.');
  console.error('这些断言应该在行为变化时才失败。优先测公开函数的输入输出，');
  console.error('或者把「接线」挪进可调用的纯函数再测它；不要新增对源码文本的断言。');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`Test health ok: ${total} source-reading assertions (baseline ${baseline.total}).`);
