// @haish-esm
import React from 'react';

const SHOW_THRESHOLD = 96;

export function ScrollToBottomButton({ scrollRef, className = '' }) {
  const [visible, setVisible] = React.useState(false);
  const frameRef = React.useRef(null);

  React.useEffect(() => {
    const element = scrollRef?.current;
    if (!element) return undefined;

    const update = () => {
      frameRef.current = null;
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      setVisible(distance > SHOW_THRESHOLD);
    };
    const scheduleUpdate = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(update);
    };

    element.addEventListener('scroll', scheduleUpdate, { passive: true });
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(element, { childList: true, characterData: true, subtree: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(element);
    scheduleUpdate();

    return () => {
      element.removeEventListener('scroll', scheduleUpdate);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [scrollRef]);

  return (
    <button
      type="button"
      className={`scroll-to-bottom-button${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
      aria-label="Scroll to latest message"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v15M6 13l6 6 6-6" />
      </svg>
    </button>
  );
}
