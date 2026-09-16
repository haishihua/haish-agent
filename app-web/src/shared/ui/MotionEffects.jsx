import React from 'react';
import { BorderBeam } from 'border-beam';
import { MetalFx } from 'metal-fx';
import { prefersReducedMotion } from '../lib/reduced-motion.js';

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
      borderRadius={10}
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
export const MetalActionEffect = React.forwardRef(function MetalActionEffect({ children, className = '', active = true, ...props }, ref) {
  return (
    <MetalFx
      ref={ref}
      className={`chat-send-metal ${active ? 'is-active' : 'is-idle'}${className ? ` ${className}` : ''}`}
      variant="circle"
      preset="chromatic"
      theme="dark"
      strength={1}
      paused={prefersReducedMotion() || !active}
      {...props}
    >
      {children}
    </MetalFx>
  );
});

export function MetalFxRuntimeKeeper() {
  // metal-fx insets its circular SVG mask by 2px per side, even with disableGlow.
  const keeperSize = 8;
  return (
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
  );
}
