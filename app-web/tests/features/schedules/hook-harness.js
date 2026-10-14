import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import assert from 'node:assert/strict';

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
  };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  const compiled = transformSync(source, { loader: 'jsx', jsx: 'transform' }).code;
  const hook = vm.runInNewContext(`${compiled}\n${exportName};`, { React, ...globals });
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
