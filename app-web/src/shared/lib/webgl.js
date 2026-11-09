// metal-fx 在模块级建全局 WebGL context，拿不到就 throw。装饰层不该因此带走整个界面，
// 所以渲染前先问一次「这台机器有没有 WebGL」。
// 结果缓存：探测要建 canvas，每次渲染都做没必要；WebGL 可用性在一个窗口生命周期内不变。
let available = null;

export function hasWebgl() {
  if (available !== null) return available;
  // 测试与 SSR 里没有 document，按「不支持」处理，调用方走降级分支。
  if (typeof document === 'undefined') {
    available = false;
    return available;
  }
  try {
    const canvas = document.createElement('canvas');
    available = Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    available = false;
  }
  return available;
}
