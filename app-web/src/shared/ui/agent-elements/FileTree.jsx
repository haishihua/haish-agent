// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/file-tree.tsx
//
// 结构沿用官方元素：一个卡片 div[data-slot="file-tree"]，里面两段——
//   1) 头部：左边「N files changed」，右边 +additions / −deletions（不预设底色）；
//   2) 行列表：一行一个节点，缩进 = (0.25 + depth × 0.85)rem；
//      目录行 = chevron + 目录图标 + 目录名；文件行 = 文件图标 + 文件名 + 该文件自己的增删。
// 官方把 Tailwind 写在 className 里，这里翻成本地 scoped CSS（file-tree.css），与 ErrorState / Quote 同一套做法。
//
// 与官方的差别（都是使用中提出来的）：
//   1. 整棵树默认收起，头部箭头提示状态，点击头部收放；
//   2. 目录行能收放（官方声明目录行不折叠），chevron 展开时朝下、收起时朝右；
//   3. 行悬停亮出一张跟住这行的路径卡（只有路径本身，可选中等一下再收），不再用会飘、不能选中的原生 title。
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileIcon, FolderIcon } from 'lucide-react';
import './file-tree.css';

// 悬停多久才亮出路径卡：太灵敏会跟着鼠标一路闪。
const TIP_SHOW_DELAY = 140;
// 移开后再等这么久才收，留出读完路径、选中复制的时间。
const TIP_HIDE_DELAY = 480;
const TIP_WIDTH = 384;

function FileTreeRow({ node, index, hidden, expanded, onToggle, onTip, onTipEnd }) {
  // 缩进跟官方一致：最外层也有 0.25rem，每深一层加 0.85rem。
  const indent = Math.max(Number(node.depth) || 0, 0);
  const style = { paddingInlineStart: `${0.25 + indent * 0.85}rem`, animationDelay: `${Math.min(index * 40, 320)}ms` };
  const tipHandlers = {
    onMouseEnter: (event) => onTip(node, event.currentTarget),
    onMouseLeave: onTipEnd,
  };
  if (node.kind === 'folder') {
    return (
      <div className="aui-file-tree-row is-folder" style={style} hidden={hidden} data-path={node.path}>
        <button
          type="button"
          className="aui-file-tree-folder"
          aria-expanded={expanded}
          onClick={onToggle}
          {...tipHandlers}
        >
          <ChevronDown className="aui-file-tree-chevron" size={12} strokeWidth={2} aria-hidden="true" />
          <FolderIcon className="aui-file-tree-icon" size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="aui-file-tree-name">{node.name}</span>
        </button>
      </div>
    );
  }
  const additions = Math.max(Number(node.additions) || 0, 0);
  const deletions = Math.max(Number(node.deletions) || 0, 0);
  return (
    <div className="aui-file-tree-row is-file" style={style} hidden={hidden} data-path={node.path} {...tipHandlers}>
      <FileIcon className="aui-file-tree-icon" size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="aui-file-tree-name">{node.name}</span>
      <span className="aui-file-tree-counts">
        {additions ? <span className="aui-file-tree-added">+{additions}</span> : null}
        {additions && deletions ? ' ' : null}
        {deletions ? <span className="aui-file-tree-removed">−{deletions}</span> : null}
      </span>
    </div>
  );
}

/**
 * 一次运行的改动文件树。纯展示：没有 files 时调用方不要渲染它（官方元素同样不做空态）。
 * visibleCount 默认等于 nodes.length，保留该 prop 是为了沿用官方「逐行浮现」的用法。
 * defaultOpen 不给时默认收起（点头部展开），调用方要常开就显式传 true。
 */
export function FileTree({
  nodes,
  visibleCount,
  totalAdditions,
  totalDeletions,
  defaultOpen,
  className = '',
  ...rest
}) {
  const rows = Array.isArray(nodes) ? nodes : [];
  const fileCount = rows.filter((node) => node.kind !== 'folder').length;
  const rowsId = useId();
  const [open, setOpen] = useState(() => (defaultOpen === undefined ? false : Boolean(defaultOpen)));
  const [collapsedDirs, setCollapsedDirs] = useState(() => new Set());
  const [tip, setTip] = useState(null);
  const showTimer = useRef(0);
  const hideTimer = useRef(0);
  const tipRef = useRef(null);

  // 先测量实际卡片高度，再限制在视口内；侧边放不下时避开整棵文件树。
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const card = tipRef.current;
    const { tree, row, side, width } = tip;
    card.style.maxHeight = 'calc(100vh - 16px)';
    const height = card.getBoundingClientRect().height;
    let left;
    let top;
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? tree.right + 8 : tree.left - width - 8;
      top = row.top;
    } else {
      left = Math.max(8, Math.min(row.left, window.innerWidth - width - 8));
      const below = Math.max(0, window.innerHeight - tree.bottom - 16);
      const above = Math.max(0, tree.top - 16);
      const placeBelow = below >= height || below >= above;
      const availableHeight = placeBelow ? below : above;
      // 四周都没有空间时不显示，避免遮挡文件明细。
      if (availableHeight < 32) return;
      card.style.maxHeight = `${availableHeight}px`;
      const fittedHeight = Math.min(height, availableHeight);
      top = placeBelow ? tree.bottom + 8 : tree.top - fittedHeight - 8;
    }
    const fittedHeight = card.getBoundingClientRect().height;
    const topLimit = Math.max(8, window.innerHeight - fittedHeight - 8);
    card.style.left = `${Math.max(8, left)}px`;
    card.style.top = `${Math.max(8, Math.min(top, topLimit))}px`;
    card.style.visibility = 'visible';
  }, [tip]);

  useEffect(() => () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  }, []);

  // 路径卡是 fixed 定位的：页面一滚就收，别让它停在别的文件上（「提示没跟住文件」）。
  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      setTip(null);
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  if (!rows.length) return null;
  const limit = Number.isFinite(Number(visibleCount)) ? Math.max(Number(visibleCount), 0) : rows.length;
  const visibleRows = rows.slice(0, Math.min(limit, rows.length));
  const additions = Math.max(Number(totalAdditions) || 0, 0);
  const deletions = Math.max(Number(totalDeletions) || 0, 0);

  const dropTip = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    setTip(null);
  };
  const scheduleTip = (node, element) => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      if (!element?.isConnected) return;
      const rect = element.getBoundingClientRect();
      const tree = (element.closest('[data-slot="file-tree"]') || element).getBoundingClientRect();
      const rightSpace = window.innerWidth - tree.right - 16;
      const leftSpace = tree.left - 16;
      const side = rightSpace >= 160 ? 'right' : leftSpace >= 160 ? 'left' : 'outside';
      const availableWidth = side === 'right' ? rightSpace : side === 'left' ? leftSpace : window.innerWidth - 16;
      setTip({
        path: node.path || node.name,
        row: { left: rect.left, top: rect.top },
        tree: { left: tree.left, right: tree.right, top: tree.top, bottom: tree.bottom },
        side,
        width: Math.max(0, Math.min(TIP_WIDTH, availableWidth)),
      });
    }, TIP_SHOW_DELAY);
  };
  const scheduleTipHide = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), TIP_HIDE_DELAY);
  };
  const keepTip = () => window.clearTimeout(hideTimer.current);
  const toggleTree = () => {
    dropTip();
    setOpen((value) => !value);
  };
  const toggleDir = (dir) => {
    dropTip();
    setCollapsedDirs((previous) => {
      const next = new Set(previous);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  return (
    <div
      data-slot="file-tree"
      data-open={open ? 'true' : 'false'}
      className={['aui-file-tree', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <button
        type="button"
        className="aui-file-tree-header"
        aria-expanded={open}
        aria-controls={rowsId}
        onClick={toggleTree}
      >
        <ChevronDown className="aui-file-tree-chevron aui-file-tree-header-chevron" size={12} strokeWidth={2} aria-hidden="true" />
        <span className="aui-file-tree-summary">{fileCount === 1 ? '1 file changed' : `${fileCount} files changed`}</span>
        <span className="aui-file-tree-totals">
          <span className="aui-file-tree-added">+{additions}</span>
          {' '}
          <span className="aui-file-tree-removed">−{deletions}</span>
        </span>
      </button>
      <div className="aui-file-tree-rows" id={rowsId} hidden={!open}>
        {visibleRows.map((node, index) => (
          <FileTreeRow
            key={`${node.kind}:${node.path}:${index}`}
            node={node}
            index={index}
            // 被收起的目录，子行（文件或更深的目录）一起藏起来。
            hidden={[...collapsedDirs].some((dir) => node.path.startsWith(`${dir}/`))}
            expanded={!collapsedDirs.has(node.path)}
            onToggle={() => toggleDir(node.path)}
            onTip={scheduleTip}
            onTipEnd={scheduleTipHide}
          />
        ))}
      </div>
      {tip
        ? createPortal(
          <div
            ref={tipRef}
            className="aui-file-tree-tip"
            role="tooltip"
            style={{ width: tip.width, maxWidth: 'calc(100vw - 16px)', visibility: 'hidden' }}
            onMouseEnter={keepTip}
            onMouseLeave={scheduleTipHide}
          >
            <code className="aui-file-tree-tip-path">{tip.path}</code>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
