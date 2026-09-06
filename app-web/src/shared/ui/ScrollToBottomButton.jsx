import React from 'react';

const SHOW_THRESHOLD = 96;

export function ScrollToBottomButton({ scrollRef, className = '', autoFollow = false, resetKey = '' }) {
  const [visible, setVisible] = React.useState(false);
  const frameRef = React.useRef(null);
  const followLatestRef = React.useRef(true);

  React.useEffect(() => {
    const element = scrollRef?.current;
    if (!element) return undefined;

    followLatestRef.current = true;
    let contentChanged = false;
    const update = () => {
      frameRef.current = null;
      if (contentChanged && autoFollow && followLatestRef.current) {
        element.scrollTop = element.scrollHeight;
      }
      contentChanged = false;
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      setVisible(distance > SHOW_THRESHOLD);
    };
    const scheduleUpdate = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(update);
    };

    const handleScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      followLatestRef.current = distance <= SHOW_THRESHOLD;
      scheduleUpdate();
    };
    const handleContentChange = () => {
      contentChanged = true;
      scheduleUpdate();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(handleContentChange);
    resizeObserver.observe(element);
    // Observe row sizes, not every token mutation inside the message tree.
    const observeRows = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(element);
      for (const child of element.children) resizeObserver.observe(child);
      handleContentChange();
    };
    const mutationObserver = new MutationObserver(observeRows);
    mutationObserver.observe(element, { childList: true });
    observeRows();
    if (autoFollow) element.scrollTop = element.scrollHeight;
    scheduleUpdate();

    return () => {
      element.removeEventListener('scroll', handleScroll);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [autoFollow, resetKey, scrollRef]);

  const scrollToLatest = () => {
    followLatestRef.current = true;
    // Smooth scrolling emits intermediate scroll events that incorrectly disable follow.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
  };

  return (
    <button
      type="button"
      className={`scroll-to-bottom-button${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      onClick={scrollToLatest}
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
