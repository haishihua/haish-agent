// 面板宽度拖拽条：指针拖拽 + 左右方向键 24px 步进。纯 props in / JSX out。
export function WorkflowDetailResizer({ onResize, onResizeBy }) {
  return (
    <div
      className="workflow-detail-resizer"
      role="separator"
      aria-label="Resize node execution details"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onResize?.(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onResize?.(event.clientX);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onResizeBy?.(event.key === 'ArrowLeft' ? 24 : -24);
      }}
    />
  );
}
