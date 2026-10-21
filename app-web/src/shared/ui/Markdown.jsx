import React from 'react';
import { cjk } from '@streamdown/cjk';
import { defaultRehypePlugins, defaultRemarkPlugins, Streamdown } from 'streamdown';
import { remarkHardBreaks } from '../lib/remark-hard-breaks.js';
import { hasJsonBlock, remarkJsonBlock } from '../lib/remark-json-block.js';
import { remarkImagePaths } from '../lib/remark-image-paths.js';
import { isChatImagePreviewUrl } from '../api/chat-image.js';
import { PATH_IMAGE_RETRY_DELAYS_MS, withRetryParam } from '../lib/markdown-image-retry.js';
import { localFileHref, localFilePath, openLocalFile } from '../lib/local-file-link.js';
import { MarkdownBlockCode } from './deferred-code-block.jsx';
import '../../../styles/markdown.css';

let codePluginPromise;
let mermaidPluginPromise;


// Keep Electron file links while retaining HTML sanitization and URL filtering.
const [sanitizePlugin, sanitizeSchema] = defaultRehypePlugins.sanitize;
const MARKDOWN_REHYPE_PLUGINS = [
  defaultRehypePlugins.raw,
  [sanitizePlugin, {
    ...sanitizeSchema,
    protocols: {
      ...sanitizeSchema.protocols,
      href: [...sanitizeSchema.protocols.href, 'file'],
    },
  }],
];
const LINK_SAFETY = { enabled: false };
// remarkPlugins 的引用身份同样要稳（Streamdown 的 memo 会按引用比）：
// 两种组合各留一份常量，别在 render 里拼数组。
//
// Streamdown 对 remarkPlugins 是「传了就用你这份、没传才用默认那套」（`e.remarkPlugins || 默认`），
// 所以 `defaultRemarkPlugins`（gfm + codeMeta）必须自己拼在最前面：少了 gfm，聊天里的表格、
// 删除线、任务列表会整套退化成带竖线的普通文本（答案里的表就是正文的一部分）。
// 两种文本都过 remarkJsonBlock——模型把 JSON 当正文吐出来（Goal Loop 的 verdict）时要变成
// json 代码块；用户自己敲的文本那档先跑 remarkHardBreaks，保住手敲的换行。
const STREAMDOWN_REMARK_PLUGINS = Object.values(defaultRemarkPlugins);
const REMARK_PLUGINS = [...STREAMDOWN_REMARK_PLUGINS, remarkJsonBlock];
const HARD_BREAK_REMARK_PLUGINS = [...STREAMDOWN_REMARK_PLUGINS, remarkHardBreaks, remarkJsonBlock];
// 代码块按视口渲染（见 deferred-code-block.jsx）：挂载时只铺等高的纯文本占位，
// 块接近视口才挂真正的代码块——高亮插件是在那里的 useEffect 里按块跑 shiki 的。
// 常量身份也重要：Streamdown 的 memo 会按引用比 components。
const CODE_COMPONENTS = { pre: MarkdownBlockCode };
const LINK_CLASS = 'wrap-anywhere font-medium text-primary underline';

// 答案里的链接指向本机文件时，点击必须去打开那个文件，而不是让渲染层导航走：
// `file://`、绝对路径、`sandbox:` 和相对路径都先解析成绝对路径（见
// shared/lib/local-file-link.js），再交给桌面端用系统默认应用打开。
// 解析不出来的目标保持原来的普通链接行为（http(s) 等）。
function MarkdownLink({ href, children, className, node, title, ...rest }) {
  const value = String(href || '');
  const classes = className ? `${LINK_CLASS} ${className}` : LINK_CLASS;
  if (value === 'streamdown:incomplete-link') {
    return <span className="wrap-anywhere font-medium" data-incomplete="true" data-streamdown="link">{children}</span>;
  }
  const target = localFilePath(value);
  if (!target) {
    return <a {...rest} className={classes} data-streamdown="link" href={href} rel="noreferrer" target="_blank" title={title}>{children}</a>;
  }
  return (
    <a
      {...rest}
      className={classes}
      data-local-file="true"
      data-streamdown="link"
      href={href}
      rel="noreferrer"
      title={title || target}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openLocalFile(value).then((result) => {
          if (result.ok) return;
          window.dispatchEvent(new CustomEvent('haish:toast', { detail: { kind: 'error', message: result.error } }));
        });
      }}
    >{children}</a>
  );
}

const MARKDOWN_COMPONENTS = { ...CODE_COMPONENTS, a: MarkdownLink };

// 最终回答里的图片多半指向本机路径（见 remark-image-paths.js），页面靠预览接口把字节
// 取回来。渲染交给浏览器原生 `<img>`：它只有「加载成功 / 加载失败」两种结局，不会像
// `fetch()`→blob 那样在请求迟迟不返回时永远停在 loading 上（那会在答案里留一块永远
// 不消失的占位）。加载失败就换一个带 `haish_retry` 的地址重试（运行时刚起、或本轮
// 任务还没登记 artifact root 时，第一次失败会自己好），两轮都失败才退回原始路径文本。
function MarkdownPathImage({ node, src, alt, title, ...rest }) {
  const original = String(title || '');
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const retryTimer = React.useRef(0);
  React.useEffect(() => {
    // 换一张图（src 变了）必须从头加载，不能继承上一张的结论。
    setAttempt(0);
    setFailed(false);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = 0;
    };
  }, [src]);
  const handleError = React.useCallback(() => {
    if (attempt >= PATH_IMAGE_RETRY_DELAYS_MS.length) {
      setFailed(true);
      return;
    }
    retryTimer.current = setTimeout(
      () => setAttempt((value) => value + 1),
      PATH_IMAGE_RETRY_DELAYS_MS[attempt],
    );
  }, [attempt]);
  if (!src) {
    return original ? <span className="haish-markdown-image-path" data-preview-failed="missing-src">{original}</span> : null;
  }
  if (failed && original) {
    return (
      <span className="haish-markdown-image-path" data-preview-failed={`img-error:${attempt}`}>{original}</span>
    );
  }
  // 路径只用来在失败时当文本退回，不挂在 `title` 上：悬停弹一条绝对路径没什么用，
  // 而且会把本地目录结构摊到屏幕上。
  return <img {...rest} src={withRetryParam(src, attempt)} alt={alt} onError={handleError} />;
}
const PATH_IMAGE_COMPONENTS = { ...MARKDOWN_COMPONENTS, img: MarkdownPathImage };

function safeMarkdownUrl(url, key) {
  const value = String(url || '').trim();
  if (/^https?:/i.test(value)) return value;
  // Generated pictures live on disk and are served back through the conversation
  // preview endpoint (see remark-image-paths.js); that relative URL is the only
  // non-http `src` this renderer accepts.
  if (key === 'src' && isChatImagePreviewUrl(value)) return value;
  if (key === 'href') {
    if (/^(?:mailto:|#)/i.test(value)) return value;
    // Local targets keep a real `file://` href so the anchor stays a link (and a
    // middle-click still lands on the file); MarkdownLink intercepts the click.
    return localFileHref(value) || null;
  }
  return null;
}

export function Markdown({ source, streaming = false, hardBreaks = false, imagePathResolver = null }) {
  const text = String(source || '');
  const [code, setCode] = React.useState(null);
  const [mermaid, setMermaid] = React.useState(null);
  // 代码块有两种来源：正文里的 ``` 围栏，和 remarkJsonBlock 把裸 JSON 转出来的块——
  // 后者没有围栏，闸门不认它就永远不会去加载 Shiki 插件（高亮缺席）。
  const hasCode = /(`{3,}|~{3,})/.test(text) || hasJsonBlock(text);
  const hasMermaid = /(?:`{3,}|~{3,})mermaid\b/i.test(text);
  // User-authored text keeps the line structure it was typed with; assistant
  // answers stay plain CommonMark, where a single newline is a soft break.
  // Model prose often carries the picture as a plain local path; when the caller
  // can resolve such paths to a preview URL, the remark plugin swaps them for real
  // images. The resolver identity is stable per conversation, so this plugin array
  // keeps a stable identity too (Streamdown memoizes on it).
  const remarkPlugins = React.useMemo(() => {
    const base = hardBreaks ? HARD_BREAK_REMARK_PLUGINS : REMARK_PLUGINS;
    if (typeof imagePathResolver !== 'function') return base;
    return [...base, [remarkImagePaths, { resolveImage: imagePathResolver }]];
  }, [hardBreaks, imagePathResolver]);
  // 只有能解析本机路径的调用方（最终回答）才换 img 组件，其他地方的图片渲染不变。
  const components = typeof imagePathResolver === 'function' ? PATH_IMAGE_COMPONENTS : MARKDOWN_COMPONENTS;

  React.useEffect(() => {
    if (!hasCode || code) return undefined;
    let active = true;
    codePluginPromise ||= import('@streamdown/code').then((module) => module.code);
    codePluginPromise.then((plugin) => {
      if (active) setCode(plugin);
    }).catch((error) => {
      codePluginPromise = undefined;
      console.error('Markdown code highlighting could not load:', error);
    });
    return () => { active = false; };
  }, [hasCode, code]);

  React.useEffect(() => {
    if (!hasMermaid || mermaid) return undefined;
    let active = true;
    mermaidPluginPromise ||= import('@streamdown/mermaid').then((module) =>
      module.createMermaidPlugin({
        config: {
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: getComputedStyle(document.documentElement)
            .getPropertyValue('--conversation-font').trim() || 'sans-serif',
        },
      }));
    mermaidPluginPromise.then((plugin) => {
      if (active) setMermaid(plugin);
    }).catch((error) => {
      mermaidPluginPromise = undefined;
      console.error('Markdown diagrams could not load:', error);
    });
    return () => { active = false; };
  }, [hasMermaid, mermaid]);

  const plugins = React.useMemo(() => ({ cjk, code, mermaid }), [code, mermaid]);

  return (
    <div className="haish-markdown dark">
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        isAnimating={streaming}
        parseIncompleteMarkdown={streaming}
        remarkPlugins={remarkPlugins}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        plugins={plugins}
        components={components}
        codeBlockMaxHeight={320}
        // 表格不给高度上限（上游默认 300px）：答案里的表就是正文的一部分，被限高后会变成
        // 一个自带滚动条的盒子——macOS 的浮层滚动条平时不显示，用户看到的是「表格缺了几行」，
        // 只能靠滚轮去找。整张表照常渲染，纵向滚动交给聊天消息列表。
        tableMaxHeight={0}
        controls
        linkSafety={LINK_SAFETY}
        urlTransform={safeMarkdownUrl}
      >
        {text}
      </Streamdown>
    </div>
  );
}
