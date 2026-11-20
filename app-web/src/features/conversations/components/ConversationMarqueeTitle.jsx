import React from 'react';

export function ConversationMarqueeTitle({ name, ref, ...props }) {
  const containerRef = React.useRef(null);
  const [seconds, setSeconds] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () => {
      const text = element.querySelector('.conversation-name-static');
      setSeconds(text && text.scrollWidth > text.clientWidth + 1
        ? Math.max(10, Math.ceil(text.scrollWidth / 45)) : 0);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 300);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [name]);
  return (
    <span {...props} ref={(element) => {
      containerRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    }} className={`conversation-name${seconds ? ' marquee' : ''}`}
      style={seconds ? { '--marquee-duration': `${seconds}s` } : undefined}>
      <span className="conversation-name-static">{name}</span>
      {seconds ? <span className="conversation-name-track" aria-hidden="true"><span>{name}</span><span>{name}</span></span> : null}
    </span>
  );
}
