import React from 'react';
import { BorderBeam } from 'border-beam';
import { MetalFx } from 'metal-fx';

function reduceMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

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
      active={(Boolean(active) || interacting) && !reduceMotion()}
      aria-hidden="true"
    >
      <span className="composer-border-beam-anchor" />
    </BorderBeam>
  );
}

export const MetalActionEffect = React.forwardRef(function MetalActionEffect({ children, className = '', ...props }, ref) {
  return (
    <MetalFx
      ref={ref}
      className={`chat-send-metal ${className}`.trim()}
      variant="circle"
      preset="chromatic"
      theme="dark"
      strength={1}
      paused={reduceMotion()}
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
