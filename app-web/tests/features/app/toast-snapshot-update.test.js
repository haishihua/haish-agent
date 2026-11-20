import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const runtime = `
let effect, cleanup, deps, next;
export const events = [];
const element = {};
export function render(component, props) {
  const result = component(props);
  if (!deps || next.some((value, index) => !Object.is(value, deps[index]))) {
    cleanup?.(); cleanup = effect(); deps = next;
  }
  return result;
}
export function animateToastParticles(node, leaving) {
  events.push(['paint', node, leaving]);
  return () => events.push(['cleanup']);
}
export const useRef = () => ({current: element});
export function useLayoutEffect(fn, values) { effect = fn; next = values; }
export const useEffect = () => {};
export const useState = () => [];
export const jsx = (...args) => args;
export const jsxs = jsx;
export const Fragment = 'fragment';
export default {createElement: (...args) => args};
`;
const bundle = await build({
  stdin: { contents: "export {AppToast} from './app-web/src/features/app/components/AppToast.jsx'; export {render,events} from 'react';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'transform',
  plugins: [{ name: 'toast-runtime', setup(builder) {
    builder.onResolve({ filter: /^(react(?:\/jsx-runtime)?|lucide-react)$|toast-particles\.js$/ }, () => ({ path: 'runtime', namespace: 'harness' }));
    builder.onLoad({ filter: /.*/, namespace: 'harness' }, () => ({ contents: `${runtime}\nexport const X = () => null;`, loader: 'js' }));
    builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const { AppToast, render, events } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('toast refreshes its visible snapshot when content or tone changes, not on unrelated renders', () => {
  let props = { id: 'same', message: 'Original', kind: 'info' };
  render(AppToast, props);
  assert.equal(events.length, 1);
  render(AppToast, { ...props, onDismiss: () => {} });
  assert.equal(events.length, 1);
  for (const update of [{ message: 'Updated' }, { title: 'Heading' }, { description: 'Details' }, { kind: 'error' }, { leaving: true }]) {
    props = { ...props, ...update };
    const before = events.length;
    render(AppToast, props);
    assert.deepEqual(events.slice(before).map(event => event[0]), ['cleanup', 'paint']);
  }
});
