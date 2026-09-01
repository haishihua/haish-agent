import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';

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
const graph = new Map(files.map((file) => [file, []]));

for (const file of files) {
  const source = readFileSync(file, 'utf8');
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
    const target = resolve(file, '..', match[1]);
    if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`${localPath}: unresolved import ${match[1]}`);
      continue;
    }
    if (sourceSet.has(target)) graph.get(file).push(target);
    const targetPath = relative(sourceRoot, target).split(sep).join('/');
    if (segments[0] === 'shared' && targetPath.startsWith('features/')) {
      errors.push(`${localPath}: shared modules cannot import feature code (${targetPath})`);
    }
    if (segments.includes('model') && /\/(?:components|hooks)\//.test(`/${targetPath}`)) {
      errors.push(`${localPath}: models cannot import components or hooks (${targetPath})`);
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

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Architecture check passed (${files.length} source modules).`);
