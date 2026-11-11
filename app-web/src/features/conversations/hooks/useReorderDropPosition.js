import React from 'react';

export function useReorderDropPosition() {
  const [dropPosition, setDropPosition] = React.useState(null);
  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = (event.clientY - rect.top) > rect.height / 2;
    setDropPosition(isAfter ? 'after' : 'before');
  }
  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropPosition(null);
  }
  return { dropPosition, setDropPosition, handleDragOver, handleDragLeave };
}
