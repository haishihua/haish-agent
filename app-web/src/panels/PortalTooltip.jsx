// @haish-esm
import React from 'react';
import { createPortal } from 'react-dom';
import { resolveTooltipPosition } from './tooltip-position.js';

export function PortalTooltip({ text, position = 'below', multiline = false, children }) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const triggerRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const suppressAfterClickRef = React.useRef(false);
  const closeTimerRef = React.useRef(null);

  const cancelClose = React.useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setVisible(false), 120);
  }, [cancelClose]);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const triggerCenter = r.left + r.width / 2;
    const margin = 8;
    const bubbleW = bubbleRef.current?.offsetWidth || 0;
    const bubbleH = bubbleRef.current?.offsetHeight || 0;
    const resolvedPosition = resolveTooltipPosition(position, r, bubbleH, window.innerHeight, margin);
    const halfW = bubbleW / 2;
    const minX = margin + halfW;
    const maxX = window.innerWidth - margin - halfW;
    const x = bubbleW > 0
      ? Math.min(Math.max(triggerCenter, minX), maxX)
      : triggerCenter;
    setCoords({
      x,
      y: resolvedPosition === 'above' ? r.top - margin : r.bottom + margin,
      arrow: triggerCenter - x,
      position: resolvedPosition,
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

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e) => {
      cancelClose();
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onMouseEnter && child.props.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      suppressAfterClickRef.current = false;
      scheduleClose();
      child.props.onMouseLeave && child.props.onMouseLeave(e);
    },
    onFocus: (e) => {
      cancelClose();
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onFocus && child.props.onFocus(e);
    },
    onBlur: (e) => {
      suppressAfterClickRef.current = false;
      scheduleClose();
      child.props.onBlur && child.props.onBlur(e);
    },
    onClick: (e) => {
      cancelClose();
      suppressAfterClickRef.current = true;
      setVisible(false);
      child.props.onClick && child.props.onClick(e);
    },
    onDragStart: (e) => {
      cancelClose();
      setVisible(false);
      child.props.onDragStart && child.props.onDragStart(e);
    },
  });

  const portalNode = (visible && coords && text)
    ? createPortal(
        <div
          ref={bubbleRef}
          className={`portal-tooltip portal-tooltip-${coords.position}${multiline ? ' is-multiline' : ''}`}
          style={{ left: coords.x, top: coords.y, '--arrow-offset': `${coords.arrow}px` }}
          role="tooltip"
          tabIndex={multiline ? 0 : undefined}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={scheduleClose}
        >
          {text}
        </div>,
        document.body,
      )
    : null;

  return <>{enhanced}{portalNode}</>;
}
