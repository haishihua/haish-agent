// @haish-esm
import React from 'react';

export function useConversationOrderAnimation(conversations) {
  const nodesRef = React.useRef(new Map());
  const previousRectsRef = React.useRef(new Map());
  const orderKey = (Array.isArray(conversations) ? conversations : [])
    .map((conversation) => conversation.id)
    .join('|');

  const registerNode = React.useCallback((id, node) => {
    if (!id) return;
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  React.useLayoutEffect(() => {
    const nextRects = new Map();
    nodesRef.current.forEach((node, id) => {
      nextRects.set(id, node.getBoundingClientRect());
    });

    nextRects.forEach((nextRect, id) => {
      const node = nodesRef.current.get(id);
      const previousRect = previousRectsRef.current.get(id);
      if (!node || !previousRect) return;
      const dx = previousRect.left - nextRect.left;
      const dy = previousRect.top - nextRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.willChange = 'transform';

      requestAnimationFrame(() => {
        node.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        node.style.transform = 'translate(0, 0)';
      });

      const cleanup = (event) => {
        if (event && (event.target !== node || event.propertyName !== 'transform')) return;
        node.style.transition = '';
        node.style.transform = '';
        node.style.willChange = '';
        node.removeEventListener('transitionend', cleanup);
      };
      node.addEventListener('transitionend', cleanup);
      window.setTimeout(cleanup, 360);
    });

    previousRectsRef.current = nextRects;
  }, [orderKey]);

  return registerNode;
}
