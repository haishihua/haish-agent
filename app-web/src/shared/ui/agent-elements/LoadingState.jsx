// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/loading-state.tsx
// Official nine-cell grid and the moving band stay byte-for-byte the same; only the
// Tailwind utilities became the scoped `aui-loader-*` classes in loading-state.css,
// and the label asks for the app's body font (see that file).
import React from 'react';
import './loading-state.css';

const CELL_SHAPES = {
  dots: 'is-dots',
  squares: 'is-squares',
  rounded: 'is-rounded',
};

/** Upstream standalone contract: the caller owns the clock, 120ms per tick. */
export const LOADER_TICK_MS = 120;

export function GenerationLoader({ label, tick, variant = 'dots', className = '', ...props }) {
  const pixelOffset = Math.floor(tick / 3);

  return (
    <div
      data-slot="generation-loader"
      className={`aui-loader${className ? ` ${className}` : ''}`}
      {...props}
    >
      <div aria-hidden="true" className="aui-loader-grid">
        {Array.from({ length: 9 }, (_, index) => {
          const active = (index * 2 + pixelOffset) % 9 < 3;
          return (
            <span
              key={index}
              className={`aui-loader-cell ${CELL_SHAPES[variant] || CELL_SHAPES.dots}${active ? ' is-lit' : ''}`}
            />
          );
        })}
      </div>
      <span className="aui-loader-label">{label}</span>
    </div>
  );
}

/**
 * Standalone loader: holds the tick locally (the upstream docs' own pattern) so an
 * async boundary can just render `<LoadingState label="…" />` and unmount it when
 * the work settles.
 */
export function LoadingState({ label, variant, className, ...props }) {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), LOADER_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return <GenerationLoader label={label} tick={tick} variant={variant} className={className} {...props} />;
}
