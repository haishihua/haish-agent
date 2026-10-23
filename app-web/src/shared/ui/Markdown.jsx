import React from 'react';
import { cjk } from '@streamdown/cjk';
import { defaultRehypePlugins, defaultRemarkPlugins, Streamdown } from 'streamdown';
import { remarkHardBreaks } from '../lib/remark-hard-breaks.js';
import { hasJsonBlock, remarkJsonBlock } from '../lib/remark-json-block.js';
import { parseImageMarker, remarkImagePaths } from '../lib/remark-image-paths.js';
import { isChatImagePreviewUrl } from '../api/chat-image.js';
import { forgetLoadedChatImage, loadedChatImage, rememberLoadedChatImage, subscribeLoadedChatImages } from '../lib/chat-image-cache.js';
import {
  IMAGE_EFFECT_CARD_BG,
  IMAGE_EFFECT_PRESET,
  IMAGE_EFFECT_THEME,
  ImageGenerationEffect,
} from '../lib/image-generation-effect.js';
import { PATH_IMAGE_RETRY_DELAYS_MS, probeImageStatus, withRetryParam } from '../lib/markdown-image-retry.js';
import { prefersReducedMotion } from '../lib/reduced-motion.js';
import { localFileHref, localFilePath, openLocalFile } from '../lib/local-file-link.js';
import { MarkdownBlockCode } from './deferred-code-block.jsx';
import { AppIcon } from './AppIcon.jsx';
import '../../../styles/markdown.css';

let codePluginPromise;
let mermaidPluginPromise;

// 每条消息自己的“路径 → 预览地址”解析器。不能用插件选项传：streamdown 的
// processor 缓存 key 是 `插件名 + JSON.stringify(选项)`，函数会被序列化成 `{}`，
// 于是全页所有 Markdown 共用第一个实例的 resolver（真实故障：图片全按第一个
// 渲染行的会话去取 → 403）。context 是每个实例独立的，不会被缓存成一份。
const ImagePathResolverContext = React.createContext(null);
// 图片预览回调也按 Markdown 实例下发：图片组件由 Streamdown 复用，不能把
// 某一条回答的 setState 闭包挂到模块级组件上。
const ImagePreviewContext = React.createContext(null);


// Keep Electron file links while retaining HTML sanitization and URL filtering.
const [sanitizePlugin, sanitizeSchema] = defaultRehypePlugins.sanitize;
const MARKDOWN_REHYPE_PLUGINS = [
  defaultRehypePlugins.raw,
  [sanitizePlugin, {
    ...sanitizeSchema,
    protocols: {
      ...sanitizeSchema.protocols,
      href: [...sanitizeSchema.protocols.href, 'file'],
      // 正文路径先变成 `haish-image:` 标记地址（见 remark-image-paths.js），
      // 真正的预览地址在组件里按当前会话算。
      src: [...sanitizeSchema.protocols.src, 'haish-image'],
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

// 请求卡住（既不返回也不报错）时别永远转圈：过了这个时长把重试图标放出来。
// 注意这只控制按钮什么时候出现，图片一直在后台加载，出来了就直接展示。
// 本地预览接口正常是毫秒级，等 8 秒还没动静已经是「卡住」了；给用户一个能点的东西，
// 而不是让他对着一块空框猜还要等多久。
const PATH_IMAGE_SLOW_RETRY_MS = 8000;
// 一次失败如果已经花掉了这么久，就别再自动重试一次了：慢失败就是真的卡住/真的没图，
// 再给一次“静默重试”只是把用户多关在空框前几秒（后端每次取图都要走一遍会话的根）。
const PATH_IMAGE_SLOW_FAILURE_MS = 1500;
// 生成卡已解码成功的图片直接复用；只有真正的冷加载才显示占位动效。
// 路径在终稿持久化时可能改变，但同会话内、校验过的原图仍然是同一张（见缓存模块）。
function MarkdownPathImage({ node, src, alt, title, ...rest }) {
    // 插件只标记路径，每个实例的 resolver 经 context 下传，不参与 processor 缓存。
    const marker = React.useMemo(() => parseImageMarker(src), [src]);
    const resolveImagePath = React.useContext(ImagePathResolverContext);
    const onPreviewImage = React.useContext(ImagePreviewContext);
    const label = String(marker ? marker.path : title || '');
    const resolvedSrc = marker
        ? (typeof resolveImagePath === 'function' ? String(resolveImagePath(marker.path) || '') : '')
        : String(src || '');
    // 地址改变时换一份加载状态，不在 passive effect 里重置：缓存图的 onLoad 可能早于
    // effect，随后又被重置成 loading，且不会再收到第二次 onLoad（切会话才恢复）。
    const cached = React.useSyncExternalStore(subscribeLoadedChatImages, () => loadedChatImage(resolvedSrc));
    // 预检：本地预览地址先问一次“能不能解析”（1 字节 Range 探针）。终态 403/404
    // 直接显示路径，不挂马赛克加载框——解析不了的路径对读者就是文本，不是一块会
    // 转圈的空地。已缓存的图跳过预检；探针说不清（5xx/断网）时按可解析处理，交给
    // 正常加载流程。403 也可能是刚结束一轮、根还没登记的瞬态，所以静默复探一次，
    // 复探仍不在才算终态（与失败重试同节奏，见 PATH_IMAGE_RETRY_DELAYS_MS）。
    const [probe, setProbe] = React.useState(() => (cached || !marker || !resolvedSrc) ? 'ok' : 'pending');
    React.useEffect(() => {
        if (!marker || !resolvedSrc || cached) return undefined;
        let active = true;
        let retryTimer = 0;
        setProbe('pending');
        const check = async (attempt) => {
            const result = await probeImageStatus(resolvedSrc);
            if (!active) return;
            if (result !== 'missing') {
                setProbe('ok');
                return;
            }
            if (attempt < PATH_IMAGE_RETRY_DELAYS_MS.length) {
                retryTimer = setTimeout(() => { void check(attempt + 1); }, PATH_IMAGE_RETRY_DELAYS_MS[attempt]);
                return;
            }
            setProbe('missing');
        };
        void check(0);
        return () => {
            active = false;
            clearTimeout(retryTimer);
        };
    }, [marker, resolvedSrc, cached]);
    return <ResolvedMarkdownImage key={cached?.src || resolvedSrc} cached={cached} probe={probe} resolvedSrc={resolvedSrc} label={label} alt={alt} onPreviewImage={onPreviewImage} {...rest} />;
}

function ResolvedMarkdownImage({ cached, resolvedSrc, label, alt, onPreviewImage, probe = 'ok', ...rest }) {
    const requestSrc = cached?.src || resolvedSrc;
    const [attempt, setAttempt] = React.useState(0);
    const [reducedMotion] = React.useState(prefersReducedMotion);
    const [phase, setPhase] = React.useState(cached ? 'loaded' : resolvedSrc ? 'loading' : 'empty');
    const [frameVisible, setFrameVisible] = React.useState(!cached);
    const imageRef = React.useRef(null);
    const alive = React.useRef(true);
    const generation = React.useRef(0);
    const settled = React.useRef(-1);
    const attemptStartedAt = React.useRef(Date.now());
    const timers = React.useRef({ retry: 0, slow: 0 });
    const clearTimers = React.useCallback(() => {
        if (timers.current.retry) clearTimeout(timers.current.retry);
        if (timers.current.slow) clearTimeout(timers.current.slow);
        timers.current = { retry: 0, slow: 0 };
    }, []);
    React.useEffect(() => {
        // StrictMode 会执行 setup → cleanup → setup，不能只在 cleanup 里永久标死。
        alive.current = true;
        return () => {
            alive.current = false;
            generation.current += 1;
            clearTimers();
        };
    }, [clearTimers]);
    const handleLoad = React.useCallback(() => {
        const image = imageRef.current;
        if (!image?.complete || !image.naturalWidth) return;
        clearTimers();
        generation.current += 1;
        void rememberLoadedChatImage(resolvedSrc, image);
        setPhase('loaded');
    }, [clearTimers, resolvedSrc]);
    // 原生缓存命中时事件可能已经触发；提交后直接检查解码状态。这里只能升级到 loaded，
    // 绝不能把已经 loaded 的图片退回 loading，首次显示与重挂载都无需切换会话。
    React.useLayoutEffect(() => {
        handleLoad();
    }, [handleLoad, attempt]);
    const handleError = React.useCallback(() => {
        // 浏览器已淘汰原图字节时不能死守旧缓存：先忘掉它，再用持久化地址正常
        // 走一次重试。这里不能直接 return，否则地址没变、key 没变，组件会停在
        // loaded 上留下空白图。
        if (cached) {
            forgetLoadedChatImage(resolvedSrc);
            clearTimers();
            settled.current = -1;
            attemptStartedAt.current = Date.now();
            setFrameVisible(true);
            setPhase('loading');
            setAttempt((value) => value + 1);
            return;
        }
        if (settled.current === attempt) return;
        settled.current = attempt;
        clearTimers();
        const tookTooLong = Date.now() - attemptStartedAt.current > PATH_IMAGE_SLOW_FAILURE_MS;
        if (tookTooLong || attempt >= PATH_IMAGE_RETRY_DELAYS_MS.length) {
            setPhase('failed');
            const current = ++generation.current;
            void probeImageStatus(withRetryParam(requestSrc, attempt)).then((result) => {
                // 旧请求/旧重试的探针不能覆盖已加载成功的结论。
                if (alive.current && current === generation.current && result === 'missing') setPhase('missing');
            });
            return;
        }
        timers.current.retry = setTimeout(() => {
            attemptStartedAt.current = Date.now();
            setAttempt((value) => value + 1);
        }, PATH_IMAGE_RETRY_DELAYS_MS[attempt]);
    }, [attempt, cached, clearTimers, requestSrc, resolvedSrc]);
    React.useEffect(() => {
        if (!requestSrc || phase !== 'loading') return undefined;
        timers.current.slow = setTimeout(() => setPhase('slow'), PATH_IMAGE_SLOW_RETRY_MS);
        return () => clearTimeout(timers.current.slow);
    }, [requestSrc, attempt, phase]);
    const retry = () => {
        clearTimers();
        generation.current += 1;
        settled.current = -1;
        attemptStartedAt.current = Date.now();
        setFrameVisible(true);
        setPhase('loading');
        setAttempt((value) => value + 1);
    };
    // 图片已经解码出来后，点击直接复用 ChatPanel 的 ImagePreviewOverlay，
    // 不再另写一套放大/下载逻辑。加载中、失败退回路径时没有可预览的图。
    const canPreview = phase === 'loaded' && Boolean(resolvedSrc) && typeof onPreviewImage === 'function';
    const openPreview = () => {
        if (!canPreview) return;
        onPreviewImage({ src: resolvedSrc, title: label || alt || 'Generated image' });
    };
    const previewKeyDown = (event) => {
        if (!canPreview || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openPreview();
    };
    if (!resolvedSrc || phase === 'empty') {
        // 没有预览地址时保持原文，不发必然失败的请求。
        return label ? <span className="haish-markdown-image-path" data-preview-failed="missing-src">{label}</span> : null;
    }
    if (probe === 'pending') {
        // 预检还没回来：既不出马赛克占位，也不先露路径文本，避免抖一下。
        return null;
    }
    if (probe === 'missing') {
        // 预检已判定“不在本会话可见范围”：不挂框、不发请求，直接显示路径。
        return label ? <span className="haish-markdown-image-path" data-preview-failed="missing">{label}</span> : null;
    }
    if (phase === 'missing' || phase === 'failed') {
        // 图片确实取不到时不再留空框或重试图标，直接把原始路径显示出来。
        return label ? <span className="haish-markdown-image-path" data-preview-failed={phase}>{label}</span> : null;
    }
    // 冷图加载才挂马赛克，已加载的生成图从第一帧起直接展示。
    return (
        <span className="haish-markdown-image" data-phase={phase}>
            <img
                {...rest}
                className="haish-markdown-image-img"
                ref={imageRef}
                src={withRetryParam(requestSrc, attempt)}
                alt={alt}
                data-previewable={canPreview ? 'true' : undefined}
                role={canPreview ? 'button' : undefined}
                tabIndex={canPreview ? 0 : undefined}
                aria-label={canPreview ? (alt || label || 'Preview image') : undefined}
                onClick={canPreview ? openPreview : undefined}
                onKeyDown={canPreview ? previewKeyDown : undefined}
                onLoad={handleLoad}
                onError={handleError}
            />
            {frameVisible ? (
                <span
                    className={`haish-markdown-image-frame${phase === 'loaded' ? ' is-leaving' : ''}`}
                    aria-hidden="true"
                    onAnimationEnd={() => setFrameVisible(false)}
                >
                    {reducedMotion || (phase !== 'loading' && phase !== 'slow') ? null : (
                        <React.Suspense fallback={null}>
                            <ImageGenerationEffect
                                preset={IMAGE_EFFECT_PRESET}
                                theme={IMAGE_EFFECT_THEME}
                                cardBg={IMAGE_EFFECT_CARD_BG}
                                className="haish-markdown-image-mosaic"
                            >
                                <span className="haish-markdown-image-loader" />
                            </ImageGenerationEffect>
                        </React.Suspense>
                    )}
                </span>
            ) : null}
            {phase === 'slow' ? (
                <button
                    type="button"
                    className="haish-markdown-image-retry"
                    onClick={retry}
                    aria-label="图片还在加载，重新加载"
                    title="图片还在加载，重新加载"
                >
                    <AppIcon name="retry" size={18} />
                </button>
            ) : null}
        </span>
    );
}
const PATH_IMAGE_COMPONENTS = { ...MARKDOWN_COMPONENTS, img: MarkdownPathImage };

function safeMarkdownUrl(url, key) {
  const value = String(url || '').trim();
  if (/^https?:/i.test(value)) return value;
  // Generated pictures live on disk; the remark plugin turns the path into a
  // `haish-image:` marker that MarkdownPathImage resolves per conversation. Both
  // that marker and the resolved preview URL are the only non-http `src` values
  // this renderer accepts.
  if (key === 'src' && (parseImageMarker(value) || isChatImagePreviewUrl(value))) return value;
  if (key === 'href') {
    if (/^(?:mailto:|#)/i.test(value)) return value;
    // Local targets keep a real `file://` href so the anchor stays a link (and a
    // middle-click still lands on the file); MarkdownLink intercepts the click.
    return localFileHref(value) || null;
  }
  return null;
}

export function Markdown({ source, streaming = false, hardBreaks = false, imagePathResolver = null, pathImages = true, onPreviewImage = null }) {
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
    if (!pathImages || typeof imagePathResolver !== 'function') return base;
    // 插件本身不收选项（收也传不到：streamdown 会把选项 JSON.stringify 进缓存 key，
    // 函数会变成 {} → 全页共用第一个 resolver）。路径→预览地址在组件里做，
    // resolver 经 context 下传（每个实例自己的）。
    return [...base, remarkImagePaths];
  }, [hardBreaks, imagePathResolver, pathImages]);
  // 只有能解析本机路径的调用方（最终回答）才换 img 组件，其他地方的图片渲染不变。
  const components = pathImages && typeof imagePathResolver === 'function' ? PATH_IMAGE_COMPONENTS : MARKDOWN_COMPONENTS;

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
      <ImagePathResolverContext.Provider value={imagePathResolver}>
        <ImagePreviewContext.Provider value={onPreviewImage}>
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
        </ImagePreviewContext.Provider>
      </ImagePathResolverContext.Provider>
    </div>
  );
}
