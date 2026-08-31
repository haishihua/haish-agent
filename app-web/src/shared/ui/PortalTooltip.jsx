/* eslint no-use-before-define: ["error", { "functions": false }] */
import React from 'react';
import { createPortal } from 'react-dom';
import { resolveTooltipPosition } from '../lib/tooltip-position.js';

// 全局 tooltip 注册表：任何模态/弹窗打开时强制关闭所有已显示的 tooltip，避免气泡残留。
const tooltipCloseFns = new Set();
const TOOLTIP_OPEN_DELAY_MS = 500;

export function closeAllPortalTooltips() {
  tooltipCloseFns.forEach((closeFn) => closeFn());
}

export function PortalTooltip({ text, position = 'below', multiline = false, className = '', openDelay = TOOLTIP_OPEN_DELAY_MS, children }) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const triggerRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const suppressAfterClickRef = React.useRef(false);
  const pointerDownRef = React.useRef(false);
  const openTimerRef = React.useRef(null);
  const closeTimerRef = React.useRef(null);

  const cancelOpen = React.useCallback(() => {
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const cancelClose = React.useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeTooltip = React.useCallback(() => {
    cancelOpen();
    cancelClose();
    setVisible(false);
  }, [cancelClose, cancelOpen]);

  React.useEffect(() => {
    tooltipCloseFns.add(closeTooltip);
    return () => {
      tooltipCloseFns.delete(closeTooltip);
    };
  }, [closeTooltip]);

  // 点击 trigger / bubble 之外的任意位置立即关闭（弹窗遮罩、其他按钮等场景）。
  React.useEffect(() => {
    const onDocumentMouseDown = (event) => {
      const target = event.target;
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (trigger && trigger.contains(target)) {
        // 按住触发元素即将产生 click：先取消待开的悬停定时器，避免长按期间 tooltip 弹出。
        cancelOpen();
        return;
      }
      if (bubble && bubble.contains(target)) return;
      cancelOpen();
      cancelClose();
      setVisible(false);
    };
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown, true);
  }, [cancelClose, cancelOpen]);

  // 记录鼠标按键状态：鼠标点击触发的 focus 不展示 tooltip，避免点击瞬间/长按误弹。
  React.useEffect(() => {
    const markPointerDown = () => { pointerDownRef.current = true; };
    const markPointerUp = () => { pointerDownRef.current = false; };
    document.addEventListener('mousedown', markPointerDown, true);
    document.addEventListener('mouseup', markPointerUp, true);
    return () => {
      document.removeEventListener('mousedown', markPointerDown, true);
      document.removeEventListener('mouseup', markPointerUp, true);
    };
  }, []);

  const scheduleOpen = React.useCallback(() => {
    cancelOpen();
    cancelClose();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      // 延迟到期时再确认指针仍真实悬停在触发元素上（mouseleave 可能因 DOM
      // 重建/失焦而丢失），防止指针已离开后 tooltip 仍然弹出。
      const el = triggerRef.current;
      const stillHovered = !!el && el.matches(':hover');
      if (!suppressAfterClickRef.current && stillHovered) setVisible(true);
    }, openDelay);
  }, [cancelClose, cancelOpen, openDelay]);

  const scheduleClose = React.useCallback(() => {
    cancelOpen();
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setVisible(false), 120);
  }, [cancelClose, cancelOpen]);

  // 兜底：只要指针真实离开了 trigger/bubble（例如 DOM 重建导致 mouseleave 丢失、
  // 窗口失焦后指针位移），下次移动鼠标时立即安排关闭，杜绝“无悬停却残留提示”。
  React.useEffect(() => {
    if (!visible) return undefined;
    const onDocumentMouseMove = (event) => {
      const target = event.target;
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (trigger && trigger.contains(target)) return;
      if (bubble && bubble.contains(target)) return;
      scheduleClose();
    };
    document.addEventListener('mousemove', onDocumentMouseMove, true);
    return () => document.removeEventListener('mousemove', onDocumentMouseMove, true);
  }, [visible, scheduleClose]);

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

  React.useEffect(() => () => {
    cancelOpen();
    cancelClose();
  }, [cancelClose, cancelOpen]);

  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e) => {
      if (!suppressAfterClickRef.current) scheduleOpen();
      child.props.onMouseEnter && child.props.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      suppressAfterClickRef.current = false;
      scheduleClose();
      child.props.onMouseLeave && child.props.onMouseLeave(e);
    },
    onFocus: (e) => {
      cancelOpen();
      cancelClose();
      // 只有指针真实悬停在触发元素上才展示 tooltip：键盘 Tab、弹窗关闭后的焦点恢复、
      // 鼠标点击瞬间的 focus 一律不触发，从根上避免“没有悬停却自动弹出提示”。
      const el = triggerRef.current;
      const pointerOver = !!el && el.matches(':hover');
      if (!suppressAfterClickRef.current && !pointerDownRef.current && pointerOver) setVisible(true);
      child.props.onFocus && child.props.onFocus(e);
    },
    onBlur: (e) => {
      suppressAfterClickRef.current = false;
      scheduleClose();
      child.props.onBlur && child.props.onBlur(e);
    },
    onClick: (e) => {
      cancelOpen();
      cancelClose();
      suppressAfterClickRef.current = true;
      setVisible(false);
      child.props.onClick && child.props.onClick(e);
    },
    onDragStart: (e) => {
      cancelOpen();
      cancelClose();
      setVisible(false);
      child.props.onDragStart && child.props.onDragStart(e);
    },
  });

  const portalNode = (visible && coords && text)
    ? createPortal(
        <div
          ref={bubbleRef}
          className={`portal-tooltip portal-tooltip-${coords.position}${multiline ? ' is-multiline' : ''}${className ? ` ${className}` : ''}`}
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
