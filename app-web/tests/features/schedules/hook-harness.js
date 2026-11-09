import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import assert from 'node:assert/strict';

// 源文件被剥掉 import 后放进沙箱执行，所以它的具名导入要由这里补齐：
// 能 resolve 的直接给真模块（这样新增 import 不会连带改测试），调用方传的 stub 优先。
function importedBindings(fileUrl, provided) {
  const requireModule = createRequire(fileURLToPath(fileUrl));
  const bindings = {};
  for (const match of readFileSync(fileUrl, 'utf8').matchAll(/^import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)';/gm)) {
    let module;
    try { module = requireModule(match[2]); } catch { continue; }
    for (const specifier of match[1].split(',')) {
      const [name, alias] = specifier.trim().split(/\s+as\s+/);
      const local = alias || name;
      if (!local || local in provided) continue;
      if (module[name] !== undefined) bindings[local] = module[name];
    }
  }
  return bindings;
}

// Execute the real hook/component with deterministic effects and deferred requests.
export function scheduleHookHarness(path, exportName, initialProps, globals = {}) {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let props = initialProps;
  let result;
  const React = {
    createContext: () => ({}),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
    useCallback(callback) {
      // Stable identities match real React closely enough for these hooks.
      return callback;
    },
    useMemo(factory) {
      return factory();
    },
  };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  const compiled = transformSync(source, { loader: 'jsx', jsx: 'transform' }).code;
  const sandbox = { React, ...importedBindings(new URL(path, import.meta.url), globals), ...globals };
  const hook = vm.runInNewContext(`${compiled}\n${exportName};`, sandbox);
  function render() {
    cursor = 0; dirty = false; effects = [];
    result = hook(props);
    effects.forEach((effect) => effect());
  }
  render();
  return {
    get result() { return result; },
    update(next) { props = { ...props, ...next }; render(); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    async settle() {
      for (let iteration = 0; iteration < 20; iteration += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        if (!dirty) return;
        render();
      }
      assert.fail('schedule hook did not settle');
    },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function childrenOf(tree, type) {
  return (tree?.props?.children || []).filter((item) => item?.type === type);
}
