// @haish-esm
import React from 'react';
import { createPortal } from 'react-dom';

export function PortalTooltip({ text, position = 'below', multiline = false, children }) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const triggerRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const suppressAfterClickRef = React.useRef(false);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const triggerCenter = r.left + r.width / 2;
    // Clamp to viewport so the tooltip doesn't get cut off at the screen edges.
    const margin = 8;
    const bubbleW = bubbleRef.current?.offsetWidth || 0;
    const halfW = bubbleW / 2;
    const minX = margin + halfW;
    const maxX = window.innerWidth - margin - halfW;
    const x = bubbleW > 0
      ? Math.min(Math.max(triggerCenter, minX), maxX)
      : triggerCenter;
    setCoords({
      x,
      y: position === 'above' ? r.top - 8 : r.bottom + 8,
      arrow: triggerCenter - x, // px offset from bubble center to actual trigger
    });
  }, [position]);

  React.useEffect(() => {
    if (!visible) return undefined;
    computeCoords();
    // After the bubble mounts we may need to re-clamp once its width is known.
    const raf = requestAnimationFrame(computeCoords);
    const onScroll = () => computeCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, computeCoords]);

  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e) => {
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onMouseEnter && child.props.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      suppressAfterClickRef.current = false;
      setVisible(false);
      child.props.onMouseLeave && child.props.onMouseLeave(e);
    },
    onFocus: (e) => {
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onFocus && child.props.onFocus(e);
    },
    onBlur: (e) => {
      suppressAfterClickRef.current = false;
      setVisible(false);
      child.props.onBlur && child.props.onBlur(e);
    },
    onClick: (e) => {
      suppressAfterClickRef.current = true;
      setVisible(false);
      child.props.onClick && child.props.onClick(e);
    },
  });

  const portalNode = (visible && coords && text)
    ? createPortal(
        <div
          ref={bubbleRef}
          className={`portal-tooltip portal-tooltip-${position}${multiline ? ' is-multiline' : ''}`}
          style={{ left: coords.x, top: coords.y, '--arrow-offset': `${coords.arrow}px` }}
          role="tooltip"
        >
          {text}
        </div>,
        document.body,
      )
    : null;

  return <>{enhanced}{portalNode}</>;
}
