import React from 'react';
import { cjk } from '@streamdown/cjk';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
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

function safeMarkdownUrl(url, key) {
  const value = String(url || '').trim();
  if (/^https?:/i.test(value)) return value;
  if (key === 'href' && /^(?:mailto:|file:|#)/i.test(value)) return value;
  return null;
}

export function Markdown({ source, streaming = false }) {
  const text = String(source || '');
  const [code, setCode] = React.useState(null);
  const [mermaid, setMermaid] = React.useState(null);
  const hasCode = /(`{3,}|~{3,})/.test(text);
  const hasMermaid = /(?:`{3,}|~{3,})mermaid\b/i.test(text);

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
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        plugins={plugins}
        codeBlockMaxHeight={320}
        controls
        linkSafety={LINK_SAFETY}
        urlTransform={safeMarkdownUrl}
      >
        {text}
      </Streamdown>
    </div>
  );
}
