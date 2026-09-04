import React from 'react';
import { cjk } from '@streamdown/cjk';
import { defaultRehypePlugins, Streamdown } from 'streamdown';

let codePluginPromise;

function markdownElement(tag, baseClassName) {
  return function MarkdownElement({ node: _node, className, ...props }) {
    const mergedClassName = [baseClassName, className].filter(Boolean).join(' ');
    return React.createElement(tag, { ...props, className: mergedClassName });
  };
}

function MarkdownLink({ node: _node, className, ...props }) {
  return (
    <a
      {...props}
      className={['md-link', className].filter(Boolean).join(' ')}
      target="_blank"
      rel="noopener noreferrer"
    />
  );
}

const MARKDOWN_COMPONENTS = {
  h1: markdownElement('h1', 'md-h md-h1'),
  h2: markdownElement('h2', 'md-h md-h2'),
  h3: markdownElement('h3', 'md-h md-h3'),
  h4: markdownElement('h4', 'md-h md-h4'),
  h5: markdownElement('h5', 'md-h md-h5'),
  h6: markdownElement('h6', 'md-h md-h6'),
  p: markdownElement('p', 'md-p'),
  ul: markdownElement('ul', 'md-ul'),
  ol: markdownElement('ol', 'md-ol'),
  blockquote: markdownElement('blockquote', 'md-bq'),
  table: markdownElement('table', 'md-table'),
  hr: markdownElement('hr', 'md-hr'),
  inlineCode: markdownElement('code', 'md-icode'),
  a: MarkdownLink,
};
const LINK_SAFETY = { enabled: false };
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

function safeMarkdownUrl(url, key) {
  const value = String(url || '').trim();
  if (/^https?:/i.test(value)) return value;
  if (key === 'href' && /^(?:mailto:|file:|#)/i.test(value)) return value;
  return null;
}

function useCodePlugin(enabled) {
  const [codePlugin, setCodePlugin] = React.useState(null);

  React.useEffect(() => {
    if (!enabled || codePlugin) return undefined;
    let active = true;
    codePluginPromise ||= import('@streamdown/code').then((module) => module.code);
    codePluginPromise.then((plugin) => {
      if (active) setCodePlugin(plugin);
    });
    return () => { active = false; };
  }, [enabled, codePlugin]);

  return React.useMemo(
    () => (codePlugin ? { cjk, code: codePlugin } : { cjk }),
    [codePlugin],
  );
}

export function Markdown({ source, streaming = false }) {
  const text = String(source || '');
  const plugins = useCodePlugin(/(^|\n)[ \t]{0,3}(?:`{3,}|~{3,})/.test(text));

  return (
    <Streamdown
      className="md-root"
      mode={streaming ? 'streaming' : 'static'}
      isAnimating={streaming}
      parseIncompleteMarkdown={streaming}
      components={MARKDOWN_COMPONENTS}
      rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
      plugins={plugins}
      controls={false}
      codeBlockMaxHeight={0}
      tableMaxHeight={0}
      linkSafety={LINK_SAFETY}
      urlTransform={safeMarkdownUrl}
    >
      {text}
    </Streamdown>
  );
}
