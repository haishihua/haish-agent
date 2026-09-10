import React from 'react';
import { motion, MotionConfig } from 'motion/react';
import { TooltipProvider, TooltipArrow, useGlobalTooltip } from './animate-ui/tooltip.tsx';

const closeFns = new Set();
export function closeAllPortalTooltips() { closeFns.forEach((close) => close()); }

function DismissBridge() {
  const { hideImmediate } = useGlobalTooltip();
  React.useEffect(() => {
    closeFns.add(hideImmediate);
    return () => closeFns.delete(hideImmediate);
  }, [hideImmediate]);
  return null;
}

export function AppTooltipProvider({ children }) {
  return <MotionConfig reducedMotion="user">
    <TooltipProvider openDelay={350} closeDelay={150}>
      <DismissBridge />{children}
    </TooltipProvider>
  </MotionConfig>;
}

// Compatibility adapter: preserve Haish callers and Animate UI's shared overlay.
export function PortalTooltip({ text, position = 'below', multiline = false, className = '', target = null, children }) {
  const tooltip = useGlobalTooltip();
  const id = React.useId();
  const triggerRef = React.useRef(null);
  const latest = React.useRef(null);
  const suppressed = React.useRef(false);
  const child = target ? null : React.Children.only(children);
  const open = () => {
    const element = target || triggerRef.current;
    if (!text || !element?.isConnected || suppressed.current) return;
    tooltip.setReferenceEl(element);
    tooltip.showTooltip({
      id, rect: element.getBoundingClientRect(), side: position === 'above' ? 'top' : 'bottom',
      sideOffset: 10, align: 'center', alignOffset: 0, contentAsChild: false,
      contentProps: {
        className: ['portal-tooltip', multiline && 'is-multiline', className].filter(Boolean).join(' '),
        onMouseEnter: () => latest.current.open(),
        onMouseLeave: tooltip.hideTooltip,
        children: <>
          <motion.div className="app-tooltip-content" layout="preserve-aspect">{text}</motion.div>
          <TooltipArrow className="app-tooltip-arrow" tipRadius={2} width={12} height={6} />
        </>,
      },
    });
  };
  const handlers = {
    onMouseEnter: open,
    onMouseLeave: () => { suppressed.current = false; tooltip.hideTooltip(); },
    onFocus: (event) => { if (event.target.matches(':focus-visible')) open(); },
    onBlur: () => { suppressed.current = false; tooltip.hideTooltip(); },
    onPointerDown: () => { suppressed.current = true; tooltip.hideImmediate(); },
    onClick: () => { suppressed.current = true; tooltip.hideImmediate(); },
    onDragStart: tooltip.hideImmediate,
  };
  React.useLayoutEffect(() => { latest.current = { open, handlers, tooltip }; });
  React.useEffect(() => {
    if (!target) return undefined;
    const bindings = Object.entries({
      mouseenter: 'onMouseEnter', mouseleave: 'onMouseLeave', focus: 'onFocus',
      blur: 'onBlur', pointerdown: 'onPointerDown', click: 'onClick', dragstart: 'onDragStart',
    }).map(([event, handler]) => {
      const listener = (e) => latest.current.handlers[handler](e);
      target.addEventListener(event, listener);
      return [event, listener];
    });
    if (target.matches(':hover, :focus-visible')) latest.current.open();
    return () => {
      bindings.forEach(([event, listener]) => target.removeEventListener(event, listener));
      suppressed.current = false;
      if (latest.current.tooltip.currentTooltip?.id === id) latest.current.tooltip.hideImmediate();
    };
  }, [target, id]);
  React.useEffect(() => {
    if (latest.current.tooltip.currentTooltip?.id !== id) return;
    if (text) latest.current.open();
    else latest.current.tooltip.hideImmediate();
  }, [text, id]);
  React.useEffect(() => () => {
    if (latest.current.tooltip.currentTooltip?.id === id) latest.current.tooltip.hideImmediate();
  }, [id]);
  React.useEffect(() => {
    if (!target) return undefined;
    const previous = target.getAttribute('aria-describedby');
    if (tooltip.currentTooltip?.id === id) target.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => {
      if (previous === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', previous);
    };
  }, [target, tooltip.currentTooltip?.id, id]);
  if (target) return null;
  const mergedHandlers = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, (event) => {
    child.props[name]?.(event);
    handler(event);
  }]));
  return React.cloneElement(child, {
    ...mergedHandlers, title: undefined, 'data-haish-tooltip-trigger': '',
    'aria-describedby': tooltip.currentTooltip?.id === id
      ? [child.props['aria-describedby'], id].filter(Boolean).join(' ') : child.props['aria-describedby'],
    ref: (element) => {
      triggerRef.current = element;
      const childRef = child.props.ref;
      if (typeof childRef === 'function') childRef(element);
      else if (childRef) childRef.current = element;
    },
  });
}
