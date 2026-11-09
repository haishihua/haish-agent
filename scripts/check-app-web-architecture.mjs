import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { applyWhitelist, buildViews } from './architecture-rules/source-scan.js';
import { collectRenderRefMirrors, describeRenderRefMirror } from './architecture-rules/render-ref-mirrors.js';
import { collectDuplicateStringArrays, describeDuplicateStringArray } from './architecture-rules/duplicate-string-arrays.js';
import { collectCtxWiring, describeCtxWiring } from './architecture-rules/ctx-wiring.js';

const sourceRoot = resolve('app-web/src');
const allowedRootFiles = new Set(['app.jsx', 'main.jsx']);
const sourceExtensions = new Set(['.js', '.jsx']);
const errors = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(sourceRoot).filter((path) => sourceExtensions.has(extname(path)));
const sourceSet = new Set(files);
const sourceCache = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
const graph = new Map(files.map((file) => [file, []]));

// 导入的具名符号必须真的存在：测试和 lint 都看不出来，只有打包时才炸。
const exportCache = new Map();
function namedExportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const source = readFileSync(file, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of match[1].split(',')) {
      const alias = entry.split(/\sas\s/).pop().trim();
      if (alias) names.add(alias);
    }
  }
  if (/export\s+default\b/.test(source)) names.add('default');
  exportCache.set(file, names);
  return names;
}

for (const file of files) {
  const source = sourceCache.get(file);
  const localPath = relative(sourceRoot, file).split(sep).join('/');
  const segments = localPath.split('/');

  if (segments.length === 1 && !allowedRootFiles.has(localPath)) {
    errors.push(`${localPath}: only app.jsx and main.jsx may live at the source root`);
  }
  if (segments.includes('lib') && segments[0] !== 'shared') {
    errors.push(`${localPath}: generic feature lib directories are forbidden; use model, hooks, api, or shared/lib`);
  }
  if (/\.(?:test|spec)\.[^.]+$/.test(localPath)) {
    errors.push(`${localPath}: tests belong in app-web/tests`);
  }
  if (segments.at(-1) === 'index.js' || segments.at(-1) === 'index.jsx') {
    errors.push(`${localPath}: compatibility barrels are forbidden; import the owning module directly`);
  }
  if (/export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]/.test(source)) {
    errors.push(`${localPath}: re-export barrels are forbidden; import the owning module directly`);
  }
  if (source.split('\n').length > 2000) {
    errors.push(`${localPath}: exceeds the 2000-line composition-root ceiling`);
  }
  if (source.includes("document.createElement('style')") || source.includes('document.createElement("style")')) {
    errors.push(`${localPath}: runtime style injection is forbidden; use app-web/styles`);
  }
  if (source.includes('window.apiFetch')) {
    errors.push(`${localPath}: import apiFetch directly from shared/api/client.js`);
  }
  if (segments.includes('model') && /(?:from\s+['"]react['"]|import\s+React)/.test(source)) {
    errors.push(`${localPath}: model modules must stay React-free`);
  }

  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    // 资源可以带查询串（`?inline`），解析前先剥离，否则会把查询串当成文件名。
    const specifier = match[1].replace(/\?.*$/, '');
    const target = resolve(file, '..', specifier);
    if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`${localPath}: unresolved import ${match[1]}`);
      continue;
    }
    if (sourceSet.has(target)) graph.get(file).push(target);
    const targetPath = relative(sourceRoot, target).split(sep).join('/');
    if (segments[0] === 'shared' && targetPath.startsWith('features/')) {
      errors.push(`${localPath}: shared modules cannot import feature code (${targetPath})`);
    }
    if (segments[0] === 'core' && targetPath.startsWith('features/')) {
      errors.push(`${localPath}: core modules cannot import feature code (${targetPath})`);
    }
    if (segments.includes('model') && /\/(?:components|hooks)\//.test(`/${targetPath}`)) {
      errors.push(`${localPath}: models cannot import components or hooks (${targetPath})`);
    }
  }

  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const specifier = match[2].replace(/\?.*$/, '');
    if (!specifier.startsWith('.')) continue;
    const target = resolve(file, '..', specifier);
    if (!sourceSet.has(target)) continue;
    const available = namedExportsOf(target);
    for (const entry of match[1].split(',')) {
      const imported = entry.split(/\sas\s/)[0].trim();
      if (imported && !available.has(imported)) {
        errors.push(`${localPath}: imports '${imported}' which ${relative(sourceRoot, target).split(sep).join('/')} does not export`);
      }
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visit(file, stack = []) {
  if (visiting.has(file)) {
    const cycleStart = stack.indexOf(file);
    const cycle = [...stack.slice(cycleStart), file]
      .map((item) => relative(sourceRoot, item).split(sep).join('/'));
    errors.push(`import cycle: ${cycle.join(' -> ')}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of files) visit(file);

// feature 之间不得双向依赖：A → B 存在时 B → A 必须为零。
// 反向边一旦出现，两个领域就互为前提，任何一侧的改动都会拖着另一侧一起改。
const featureEdges = new Set();
const featureOf = (path) => {
  const segments = path.split('/');
  return segments[0] === 'features' ? segments[1] : null;
};
for (const file of files) {
  const from = featureOf(relative(sourceRoot, file).split(sep).join('/'));
  if (!from) continue;
  for (const dependency of graph.get(file) || []) {
    const to = featureOf(relative(sourceRoot, dependency).split(sep).join('/'));
    if (to && to !== from) featureEdges.add(`${from} -> ${to}`);
  }
}
for (const edge of featureEdges) {
  const [from, to] = edge.split(' -> ');
  if (from < to && featureEdges.has(`${to} -> ${from}`)) {
    errors.push(`features must not depend on each other both ways: ${from} <-> ${to}`);
  }
}

// ------------------------------------------------------------------------------ 接线错误（T2）
// 前三块（依赖方向 / 循环依赖 / core 边界）守的是「模块之间怎么连」，下面这三条守的是
// 「值在哪个文件里被读、在哪个文件里被写」——这类错误都能编译、能过 lint、能让上千条
// 行为测试全绿，只在用户操作到那一步时才炸。三条规则各自在文件头写了「能拦住什么 /
// 拦不住什么」，这里只负责汇总、比对白名单、报错。
//
// 白名单是显式清单（scripts/architecture-rules/wiring-whitelist.json）：
//   · 一个新命中就红一次，把「这笔新债是谁欠的、为什么」写进理由才放行；
//   · 条目里的 sites 是「允许几处」，多一处也红；
//   · 已经不再命中的条目会在通过时提醒删掉，不会默默变成永久豁免。
const wiringWhitelistPath = resolve('scripts/architecture-rules/wiring-whitelist.json');
if (!existsSync(wiringWhitelistPath)) {
  errors.push(`missing scripts/architecture-rules/wiring-whitelist.json; the wiring rules need their explicit whitelist`);
}
const wiringWhitelist = existsSync(wiringWhitelistPath)
  ? JSON.parse(readFileSync(wiringWhitelistPath, 'utf8'))
  : {};

const modules = files.map((file) => ({
  path: relative(sourceRoot, file).split(sep).join('/'),
  source: sourceCache.get(file),
}));
// 三条规则共用一次源码扫描：掩码文本 + 括号配对 + 函数作用域区间。
const views = buildViews(modules);

const renderRefs = collectRenderRefMirrors(views);
const duplicateArrays = collectDuplicateStringArrays(views);
const ctxWiring = collectCtxWiring(views);

const wiringNotices = [];
for (const [rule, whitelist, violations, describe] of [
  ['render-ref', wiringWhitelist.renderRefMirrors, renderRefs.violations, describeRenderRefMirror],
  ['dup-array', wiringWhitelist.duplicateStringArrays, duplicateArrays.violations, describeDuplicateStringArray],
  ['ctx-wiring', wiringWhitelist.ctxWiring, ctxWiring.violations, describeCtxWiring],
]) {
  const { unresolved, idle } = applyWhitelist(violations, whitelist || {});
  for (const violation of unresolved) {
    const stale = violation.stale
      ? `（白名单记录 ${violation.allowed} 处，现在是 ${violation.sites} 处：新增的那处请单独写理由）`
      : '';
    errors.push(`[${rule}] ${describe(violation)}${stale}`);
  }
  for (const key of idle) {
    wiringNotices.push(`[${rule}] wiring-whitelist.json 里的 ${key} 已经不再命中，可以删掉`);
  }
}

// 解析器自检：数量突然大幅下降说明扫描器失效，而不是代码变干净了。
// 如果确实是大规模删代码，把这两个阈值一起改小即可。
if (renderRefs.inventory.length < 15) {
  errors.push(`[render-ref] 只解析到 ${renderRefs.inventory.length} 处 render 期 ref 镜写（预期 ≥15）：扫描器可能失效，规则正在静默放行`);
}
if (ctxWiring.stats.checked < 12) {
  errors.push(`[ctx-wiring] 只核对了 ${ctxWiring.stats.checked} 个工厂的 ctx 装配（预期 ≥12）：扫描器可能失效，规则正在静默放行`);
}

const wiringSummary =
  `wiring: ${renderRefs.inventory.length} render-phase ref mirrors `
  + `(${renderRefs.violations.length} with a second owner, ${wiringWhitelist.renderRefMirrors ? Object.keys(wiringWhitelist.renderRefMirrors).length : 0} whitelisted); `
  + `${duplicateArrays.inventory.length} string arrays → ${duplicateArrays.violations.length} cross-file duplicates; `
  + `${ctxWiring.stats.factories} ctx factories (${ctxWiring.stats.checked} checked, ${ctxWiring.stats.skipped} unverifiable); `
  + `${ctxWiring.stats.checkedSites} ctx call sites checked, ${ctxWiring.stats.skippedSites} unverifiable`;

if (process.argv.includes('--list')) {
  console.log(`render-phase ref mirrors (${renderRefs.inventory.length}):`);
  for (const mirror of renderRefs.inventory) {
    const carriers = mirror.carriers.map((carrier) => `${carrier.name}:${carrier.kind}`).join(' ');
    console.log(`  ${mirror.file}:${mirror.line} [${mirror.fn}] ${mirror.ref}.current = …${carriers ? `  ← second owner: ${carriers}` : ''}`);
  }
  console.log(`\nstring arrays with identical members in 2+ files (${duplicateArrays.violations.length} groups):`);
  for (const violation of duplicateArrays.violations) {
    console.log(`  [${violation.members.join(', ')}] x${violation.sites}: ${violation.locations.join(', ')}`);
  }
  console.log(`\nctx factories (${ctxWiring.inventory.length}):`);
  for (const factory of ctxWiring.inventory) {
    console.log(`  ${factory.path}:${factory.line} ${factory.name} keys=${factory.keys} required=${factory.required} assembly=${factory.sites} (${factory.form})`);
  }
  console.log('');
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

if (wiringNotices.length) {
  console.warn(wiringNotices.map((notice) => `! ${notice}`).join('\n'));
}

console.log(`Architecture check passed (${files.length} source modules).`);
console.log(wiringSummary);
