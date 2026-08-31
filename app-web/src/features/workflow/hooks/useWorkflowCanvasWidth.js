import React from 'react';

export function useWorkflowCanvasWidth(ref, observeKey = '') {
  const [width, setWidth] = React.useState(1200);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let frame = 0;
    const update = (nextWidth = element.clientWidth) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rounded = Math.round(Number(nextWidth) || element.clientWidth || 1200);
        setWidth((current) => (current === rounded ? current : rounded));
      });
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', onResize);
      };
    }

    const observer = new ResizeObserver(([entry]) => update(entry?.contentRect?.width));
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [observeKey, ref]);

  return width;
}
