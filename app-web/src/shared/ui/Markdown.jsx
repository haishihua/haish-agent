import React from 'react';
import { cjk } from '@streamdown/cjk';
import { defaultRehypePlugins, defaultRemarkPlugins, Streamdown } from 'streamdown';
import { remarkHardBreaks } from '../lib/remark-hard-breaks.js';
import { hasJsonBlock, remarkJsonBlock } from '../lib/remark-json-block.js';
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
const MARKDOWN_COMPONENTS = { pre: MarkdownBlockCode };

function safeMarkdownUrl(url, key) {
  const value = String(url || '').trim();
  if (/^https?:/i.test(value)) return value;
  if (key === 'href' && /^(?:mailto:|file:|#)/i.test(value)) return value;
  return null;
}

export function Markdown({ source, streaming = false, hardBreaks = false }) {
  const text = String(source || '');
  const [code, setCode] = React.useState(null);
  const [mermaid, setMermaid] = React.useState(null);
  // 代码块有两种来源：正文里的 ``` 围栏，和 remarkJsonBlock 把裸 JSON 转出来的块——
  // 后者没有围栏，闸门不认它就永远不会去加载 Shiki 插件（高亮缺席）。
  const hasCode = /(`{3,}|~{3,})/.test(text) || hasJsonBlock(text);
  const hasMermaid = /(?:`{3,}|~{3,})mermaid\b/i.test(text);
  // User-authored text keeps the line structure it was typed with; assistant
  // answers stay plain CommonMark, where a single newline is a soft break.
  const remarkPlugins = React.useMemo(
    () => (hardBreaks ? HARD_BREAK_REMARK_PLUGINS : REMARK_PLUGINS),
    [hardBreaks],
  );

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
        components={MARKDOWN_COMPONENTS}
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
