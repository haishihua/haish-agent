import React from 'react';

// Allow fractional scroll offsets without hiding a genuinely available action.
const SHOW_THRESHOLD = 2;

export function ScrollToBottomButton({ scrollRef, className = '', autoFollow = false, resetKey = '' }) {
  const [visible, setVisible] = React.useState(false);
  const frameRef = React.useRef(null);
  const followLatestRef = React.useRef(true);

  React.useLayoutEffect(() => {
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
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(update);
    };

    const handleScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      // Lazy row layout/scroll anchoring can move scrollTop backwards without
      // user input. Keep following until an actual navigation gesture opts out.
      if (distance <= SHOW_THRESHOLD) followLatestRef.current = true;
      if (autoFollow && followLatestRef.current) contentChanged = true;
      scheduleUpdate();
    };
    const handleWheel = (event) => {
      // Stop following before a queued resize update can undo an upward gesture.
      if (event.deltaY < 0) followLatestRef.current = false;
    };
    const stopFollowing = () => { followLatestRef.current = false; };
    const handleKeyDown = (event) => {
      if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopFollowing();
    };
    const handlePointerDown = (event) => {
      if (event.target === element) stopFollowing(); // Scrollbar dragging.
    };
    const handleContentChange = () => {
      contentChanged = true;
      scheduleUpdate();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    element.addEventListener('wheel', handleWheel, { passive: true });
    element.addEventListener('touchstart', stopFollowing, { passive: true });
    element.addEventListener('keydown', handleKeyDown);
    element.addEventListener('pointerdown', handlePointerDown);
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
    if (autoFollow) {
      element.scrollTop = element.scrollHeight;
    }
    scheduleUpdate();

    return () => {
      element.removeEventListener('scroll', handleScroll);
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', stopFollowing);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('pointerdown', handlePointerDown);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
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
