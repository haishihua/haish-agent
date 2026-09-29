import React from 'react';
import { StreamdownContext } from 'streamdown';

// 代码块（含 mermaid 这类 fenced block）挂载时并不按可见性做高亮：streamdown 的代码块
// body 用一个普通 useEffect 调 highlight()（见 @streamdown/code 的 HighlightedCodeBlockBody），
// 和屏幕位置无关。长会话里几百个块会在挂载那一帧全部跑一遍 shiki 分词——离线实测
// compute-use3.0（497 个块）是 ~790ms 冷启动，其中绝大多数在屏幕外。这一层"视口门"
// 先渲染等高的纯文本占位，等块接近视口（rootMargin 提前量）再挂真正的块：高亮与
// token 子树的成本跟着「实际看了多少」走，而不是跟着「会话里有多少」走。
const DEFAULT_REVEAL_MARGIN_PX = 800;
const FALLBACK_MAX_HEIGHT_PX = 400;
const EMPTY_CONTEXT = React.createContext(null);

/** 块级代码的原文与语言（和 streamdown 默认渲染器的取法一致）。 */
export function codeBlockSource(children) {
  const className = typeof children?.props?.className === 'string' ? children.props.className : '';
  const raw = children?.props?.children;
  return {
    language: (className.match(/language-([^\s]+)/) || [])[1] || '',
    code: typeof raw === 'string' ? raw : '',
  };
}

// streamdown 默认的 `pre` 只做一件事：把 <pre> 里的 <code> 标成 data-block，块级代码
// 随后交给代码块渲染器（<pre> 自己不落地）。门就加在这一层——命中的块先占位，
// 其余（行内代码、裸 <pre>、空块）原样走。
export function MarkdownBlockCode({ children }) {
  if (!React.isValidElement(children)) return children;
  const block = React.cloneElement(children, { 'data-block': 'true' });
  const { language, code } = codeBlockSource(children);
  if (!code) return block;
  return <DeferredCodeBlock language={language} code={code}>{block}</DeferredCodeBlock>;
}

export function DeferredCodeBlock({ language, code, children, revealMargin = DEFAULT_REVEAL_MARGIN_PX }) {
  const [revealed, setRevealed] = React.useState(false);
  const hostRef = React.useRef(null);
  const { codeBlockMaxHeight } = React.useContext(StreamdownContext ?? EMPTY_CONTEXT) || {};

  React.useEffect(() => {
    if (revealed) return undefined;
    const host = hostRef.current;
    // 没有 IntersectionObserver（老内核或测试桩）就照旧渲染，功能不打折。
    if (!host || typeof IntersectionObserver !== 'function') {
      setRevealed(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setRevealed(true);
    }, { rootMargin: `${revealMargin}px 0px ${revealMargin}px 0px` });
    observer.observe(host);
    return () => observer.disconnect();
  }, [revealed, revealMargin]);

  if (revealed) return children;

  const maxHeight = Number.isFinite(Number(codeBlockMaxHeight)) && Number(codeBlockMaxHeight) > 0
    ? Number(codeBlockMaxHeight)
    : FALLBACK_MAX_HEIGHT_PX;
  // 占位照抄代码块自己的骨架（同一个 data-streamdown 容器 + 同一个头 + 一段纯文本正文）：
  // 高度和真块一致，补上高亮时不跳；纯文本正文本身不计进 shiki 的那笔开销。
  return (
    <div
      className="my-4 flex w-full flex-col gap-2 rounded-xl border border-border bg-sidebar p-2"
      data-streamdown="code-block"
      data-language={language}
      data-deferred-code=""
      ref={hostRef}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}
    >
      <div className="flex h-8 items-center text-muted-foreground text-xs" data-language={language} data-streamdown="code-block-header">
        <span className="ml-1 font-mono lowercase">{language}</span>
      </div>
      <div
        className="overflow-x-auto overflow-y-auto rounded-md border border-border bg-background p-4 text-sm"
        data-language={language}
        data-streamdown="code-block-body"
        data-deferred-code-body=""
        style={{ maxHeight }}
      >
        <pre className="bg-[var(--sdm-bg,inherit)] dark:bg-[var(--shiki-dark-bg,var(--sdm-bg,inherit))]"><code>{code}</code></pre>
      </div>
    </div>
  );
}
