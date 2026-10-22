import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';

/**
 * 通用图片预览浮层（聊天附件、Markdown 插图、生图卡共用）。
 *
 * 尺寸模型：默认 contain——等比缩放尽量填满可用区域（小图允许放大），对齐
 * 主流 lightbox（GPT / react-photo-view / PhotoSwipe）的行为：预览首先保证“大”，
 * 像素级 1:1 只是缩放条上的一个档位。宽高一起给死，避免 flex 只压一边把图拉变形。
 *
 * 交互：滚轮以指针位置为锚点缩放；按住拖拽平移；+/- 按钮步进；Esc / 点背景关闭。
 */

const IMAGE_COPY_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_COPY_MAX_PIXELS = 16 * 1024 * 1024;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Image encoding failed'));
    reader.readAsDataURL(blob);
  });
}

export function ImagePreviewOverlay({ image, onClose }) {
  // scale 是相对 1:1 尺寸的倍数；offset 是拖拽平移量（CSS px）。
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [copied, setCopied] = React.useState(false);
  // 预览图的 contain 尺寸（填满可用区域；null 表示还没量到）。
  const [box, setBox] = React.useState(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const imageElementRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const dragStateRef = React.useRef(null);
  const src = image?.src || '';
  const title = image?.title || 'image';

  const syncBox = React.useCallback((element) => {
    const naturalWidth = Number(element?.naturalWidth) || 0;
    const naturalHeight = Number(element?.naturalHeight) || 0;
    if (!naturalWidth || !naturalHeight) return;
    const stageStyle = stageRef.current ? window.getComputedStyle(stageRef.current) : null;
    const stageMaxWidth = Number.parseFloat(stageStyle?.maxWidth || '') || Infinity;
    const stageMaxHeight = Number.parseFloat(stageStyle?.maxHeight || '') || Infinity;
    // contain：能放大也能缩小，唯一目标是尽量填满可用区域。
    const fit = Math.min(stageMaxWidth / naturalWidth, stageMaxHeight / naturalHeight);
    const width = naturalWidth * fit;
    const height = naturalHeight * fit;
    // 同样的输入不重复写 state：ref 回调 / resize 会反复调到这里，不拦一下会
    // 每次新对象都触发一轮重渲染。
    setBox((previous) => (
      previous
      && Math.abs(previous.width - width) < 0.01
      && Math.abs(previous.height - height) < 0.01
      && previous.fit === fit
      && previous.naturalWidth === naturalWidth
        ? previous
        : { width, height, fit, naturalWidth, naturalHeight }
    ));
  }, []);

  // ref 回调要稳定身份，否则 React 每次渲染都会先 detach 再 attach 一遍。
  const attachImage = React.useCallback((node) => {
    imageElementRef.current = node;
    // 命中缓存时 onLoad 可能早于挂 listener，这里补一次量尺寸。
    if (node?.complete) syncBox(node);
  }, [syncBox]);

  React.useEffect(() => {
    if (!image) return undefined;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setCopied(false);
    setBox(null);
    setLoadFailed(false);
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  // 窗口改尺寸、或被拖到另一块（不同 dpr 的）显示器上时重新量，避免又退回放大显示。
  React.useEffect(() => {
    if (!image) return undefined;
    const handleChange = () => syncBox(imageElementRef.current);
    window.addEventListener('resize', handleChange);
    return () => window.removeEventListener('resize', handleChange);
  }, [image, syncBox]);

  React.useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  if (!image || !src) return null;

  // 显示尺寸 = contain 尺寸 × scale；offset 只做平移。
  const displayWidth = box ? box.width : undefined;
  const displayHeight = box ? box.height : undefined;
  const zoomedWidth = displayWidth ? displayWidth * scale : undefined;
  const zoomedHeight = displayHeight ? displayHeight * scale : undefined;

  // 放大后允许拖出界一半，保证任意角度都能把图片边角拖回视野。
  const maxPanX = zoomedWidth ? Math.max(0, (zoomedWidth - (displayWidth || 0)) / 2) : Infinity;
  const maxPanY = zoomedHeight ? Math.max(0, (zoomedHeight - (displayHeight || 0)) / 2) : Infinity;

  function clampOffset(value) {
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, value.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, value.y)),
    };
  }

  function adjustScale(delta) {
    setScale((value) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number((value + delta).toFixed(2)))));
  }

  /**
   * 以指针为锚点缩放：缩放前后指针指向的图像点保持在同一屏幕位置。
   * 只有指针落在图片上时才用锚点，落在舞台上（图片外）时退化为居中缩放。
   */
  function zoomAt(nextScaleRaw, pointer) {
    const nextScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(nextScaleRaw.toFixed(3))));
    setScale((currentScale) => {
      if (Math.abs(nextScale - currentScale) < 0.001) return currentScale;
      setOffset((currentOffset) => {
        if (!pointer || !displayWidth) return { x: 0, y: 0 };
        const stageRect = stageRef.current?.getBoundingClientRect();
        if (!stageRect) return { x: 0, y: 0 };
        const stageCenterX = stageRect.left + stageRect.width / 2;
        const stageCenterY = stageRect.top + stageRect.height / 2;
        // 指针相对图片中心（含当前平移）的向量。
        const originX = pointer.clientX - stageCenterX - currentOffset.x;
        const originY = pointer.clientY - stageCenterY - currentOffset.y;
        const factor = nextScale / currentScale;
        const next = {
          x: originX - originX * factor + currentOffset.x,
          y: originY - originY * factor + currentOffset.y,
        };
        return clampOffset(next);
      });
      return nextScale;
    });
  }

  function handleWheel(event) {
    // 触控板双指捏合（ctrlKey）和鼠标滚轮都走这里；不让页面跟着滚。
    event.preventDefault();
    const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(scale * step, { clientX: event.clientX, clientY: event.clientY });
  }

  function handleDragStart(event) {
    // 只响应主键；点在工具条/缩放条上不拖。
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest && target.closest('.image-preview-toolbar, .image-preview-zoom')) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: offset,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragMove(event) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    setOffset(() => clampOffset({
      x: state.originOffset.x + (event.clientX - state.startX),
      y: state.originOffset.y + (event.clientY - state.startY),
    }));
  }

  function handleDragEnd(event) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function copyImage() {
    try {
      const imageElement = imageElementRef.current;
      await imageElement?.decode?.().catch(() => undefined);
      const width = Number(imageElement?.naturalWidth) || 0;
      const height = Number(imageElement?.naturalHeight) || 0;
      if (!width || !height || width * height > IMAGE_COPY_MAX_PIXELS) {
        throw new Error('Image dimensions are too large to copy safely');
      }
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
      const blob = await response.blob();
      if (blob.size > IMAGE_COPY_MAX_BYTES) throw new Error('Image file is too large to copy safely');
      const dataUrl = await blobToDataUrl(blob);
      const ok = await window.haish?.copyImage?.(dataUrl);
      if (!ok) return;
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('image copy failed', error);
    }
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.href = src;
    link.download = String(title).split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // 缩放条百分比按原图像素数算：scale=1 且图被放大填满时如实显示（如 199%），
  // 缩到像素级 1:1 时显示 100%。
  const readout = Math.round(scale * (box?.fit ?? 1) * 100);

  return (
    <div
      className={`image-preview-backdrop${dragging ? ' is-dragging' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onWheel={handleWheel}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="image-preview-toolbar" aria-label="Image preview actions">
        <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="below">
          <button type="button" className={`image-preview-action ${copied ? 'copied' : ''}`} onClick={copyImage} aria-label={copied ? 'Image copied' : 'Copy image'}>
            {copied ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 4 4 10-10" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
            )}
          </button>
        </PortalTooltip>
        <PortalTooltip text="Download" position="below">
          <button type="button" className="image-preview-action" onClick={downloadImage} aria-label="Download image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
          </button>
        </PortalTooltip>
        <PortalTooltip text="Close (Esc)" position="below">
          <button type="button" className="image-preview-action image-preview-close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          </button>
        </PortalTooltip>
      </div>
      <div
        className={`image-preview-stage${dragging ? ' is-dragging' : ''}`}
        ref={stageRef}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onDoubleClick={() => zoomAt(scale > 1.001 ? 1 : 2, null)}
      >
        <img
          ref={attachImage}
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => syncBox(event.currentTarget)}
          onError={() => setLoadFailed(true)}
          style={{
            width: displayWidth ? `${displayWidth}px` : undefined,
            height: displayHeight ? `${displayHeight}px` : undefined,
            // 量到真实尺寸之前先不画，避免先按 2 倍大小铺开再“缩回去”闪一下。
            visibility: box || loadFailed ? 'visible' : 'hidden',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>
      <div className="image-preview-zoom" aria-label="Image zoom controls">
        <button type="button" onClick={() => adjustScale(-0.25)} aria-label="Zoom out">-</button>
        {/* 双击百分比回到 1:1（自动收小的图也回自动收小状态）。 */}
        <span
          role="button"
          tabIndex={0}
          title={box ? `原图 ${box.naturalWidth} × ${box.naturalHeight} px — 双击回到 100%` : undefined}
          onClick={() => zoomAt(1, null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              zoomAt(1, null);
            }
          }}
        >
          {readout}%
        </span>
        <button type="button" onClick={() => adjustScale(0.25)} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
