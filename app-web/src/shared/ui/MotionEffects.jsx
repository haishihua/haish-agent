import React from 'react';
import { BorderBeam } from 'border-beam';
import { MetalFx } from 'metal-fx';
import { prefersReducedMotion } from '../lib/reduced-motion.js';
import { hasWebgl } from '../lib/webgl.js';
import { ErrorBoundary } from './ErrorBoundary.jsx';

export function ComposerBorderBeam({ active }) {
  const beamRef = React.useRef(null);
  const [interacting, setInteracting] = React.useState(false);

  React.useEffect(() => {
    const host = beamRef.current?.parentElement;
    if (!host) return undefined;
    const engage = () => setInteracting(true);
    const disengage = () => setInteracting(host.matches(':hover'));
    host.addEventListener('pointerenter', engage);
    host.addEventListener('pointerleave', disengage);
    return () => {
      host.removeEventListener('pointerenter', engage);
      host.removeEventListener('pointerleave', disengage);
    };
  }, []);

  return (
    <BorderBeam
      ref={beamRef}
      className="composer-border-beam"
      size="md"
      colorVariant="colorful"
      theme="dark"
      duration={4.2}
      strength={0.72}
      brightness={1.28}
      saturation={1.18}
      hueRange={30}
      borderRadius={18}
      active={(Boolean(active) || interacting) && !prefersReducedMotion()}
      aria-hidden="true"
    >
      <span className="composer-border-beam-anchor" />
    </BorderBeam>
  );
}

// `active` marks "this conversation has work running". The metal shell itself
// stays mounted in both states so the button keeps its exact size and disc
// color — only the decorative shader layers are hidden while idle (see
// .chat-send-metal.is-idle in chat.css). Unmounting the shell instead would
// re-create the canvas and visibly change the button mid-press.
// Pausing it also parks metal-fx's shared render loop: an instance that is
// paused and already painted stops requesting frames.
//
// 没有 WebGL 时 metal-fx 会 throw（它在模块级建全局 context），而它包住的是发送按钮本体：
// 崩掉就是「发送键消失」。所以降级成同样 class 的裸容器——按钮还在，只是没有 shader。
export const MetalActionEffect = React.forwardRef(function MetalActionEffect({ children, className = '', active = true, ...props }, ref) {
  const shellClass = `chat-send-metal ${active ? 'is-active' : 'is-idle'}${className ? ` ${className}` : ''}`;
  if (!hasWebgl()) {
    return <div ref={ref} className={shellClass} {...props}>{children}</div>;
  }
  return (
    <ErrorBoundary fallback={<div ref={ref} className={shellClass} {...props}>{children}</div>}>
      <MetalFx
        ref={ref}
        className={shellClass}
        variant="circle"
        preset="chromatic"
        theme="dark"
        strength={1}
        paused={prefersReducedMotion() || !active}
        {...props}
      >
        {children}
      </MetalFx>
    </ErrorBoundary>
  );
});

// 只为了不让 metal-fx 的共享渲染循环在首个按钮出现时重建 canvas；它本身不可见，
// 所以拿不到 WebGL 时直接不渲染，没有必要留空壳。
export function MetalFxRuntimeKeeper() {
  if (!hasWebgl()) return null;
  // metal-fx insets its circular SVG mask by 2px per side, even with disableGlow.
  const keeperSize = 8;
  return (
    <ErrorBoundary fallback={null}>
      <MetalFx
        className="metal-fx-runtime-keeper"
        variant="circle"
        preset="chromatic"
        theme="dark"
        strength={0}
        paused
        disableGlow
        aria-hidden="true"
        style={{ position: 'fixed', left: -100, top: -100, width: keeperSize, height: keeperSize, pointerEvents: 'none' }}
      >
        <span style={{ width: keeperSize, height: keeperSize }} />
      </MetalFx>
    </ErrorBoundary>
  );
}
