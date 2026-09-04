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
    const disengage = () => setInteracting(host.matches(':hover') || host.matches(':focus-within'));
    host.addEventListener('pointerenter', engage);
    host.addEventListener('pointerleave', disengage);
    host.addEventListener('focusin', engage);
    host.addEventListener('focusout', disengage);
    return () => {
      host.removeEventListener('pointerenter', engage);
      host.removeEventListener('pointerleave', disengage);
      host.removeEventListener('focusin', engage);
      host.removeEventListener('focusout', disengage);
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

export function AssistantBorderBeam({ active, enabled, children }) {
  const frameRef = React.useRef(null);
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !frameRef.current) return undefined;
    const frame = frameRef.current;
    const update = () => setWide(frame.getBoundingClientRect().width >= 280);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return children;

  return (
    <BorderBeam
      ref={frameRef}
      className="assistant-border-beam"
      size={wide ? 'pulse-outside' : 'pulse-inner'}
      colorVariant="colorful"
      theme="dark"
      duration={2.3}
      strength={wide ? 0.42 : 0.3}
      brightness={0.9}
      saturation={0.82}
      hueRange={18}
      borderRadius={12}
      active={Boolean(active) && !reduceMotion()}
    >
      {children}
    </BorderBeam>
  );
}
