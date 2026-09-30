// CommonMark has no notion of JSON: a model that answers with a bare JSON object
// (Goal Loop's Verifier verdict, an API payload) produces one mdast paragraph, so
// the bubble collapses its newlines into spaces and unwraps every `\"` as a
// Markdown escape — unreadable, and no longer parseable once the user copies it.
// Only fenced (```) or 4-space-indented blocks are code to Markdown, so the fix
// belongs in the remark pipeline Streamdown already runs.
//
// The payload is sliced from the *raw* source: by the time a paragraph is an
// mdast node its text has already lost the escapes that made the JSON valid. The
// paragraph is then replaced by a `code` node with the pretty-printed value,
// which hands the rest to Streamdown's stock fenced-code path (Shiki
// highlighting, copy, download, line numbers).
const JSON_LANGUAGE = 'json';
// Nodes whose text is not prose: `table` keeps cells (and their pipes) intact.
const SKIP_CHILDREN = new Set(['code', 'inlineCode', 'table']);

/** Pretty-printed JSON when `raw` is a whole JSON object/array, else `null`. */
export function jsonBlockText(raw) {
  const text = String(raw ?? '').trim();
  const wrapped = (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
  if (!wrapped) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  // `JSON.parse` also accepts primitives; those are ordinary prose far more often
  // than they are JSON, so only containers are converted.
  if (!parsed || typeof parsed !== 'object') return null;
  return JSON.stringify(parsed, null, 2);
}

/**
 * True when any blank-line-separated chunk of `source` is a JSON container — the
 * cheap "this message will contain a code block" gate (top-level mdast
 * paragraphs are exactly those chunks).
 */
export function hasJsonBlock(source) {
  return String(source ?? '').split(/\n[ \t]*\n/).some((chunk) => jsonBlockText(chunk) != null);
}

/** The raw markdown a node covers, or `null` when the tree carries no offsets. */
function rawSource(source, node) {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  return source.slice(start, end);
}

function asJsonBlock(node, source) {
  if (node?.type !== 'paragraph') return null;
  const value = jsonBlockText(rawSource(source, node));
  if (value == null) return null;
  return { type: 'code', lang: JSON_LANGUAGE, meta: null, value, position: node.position };
}

function walk(node, source) {
  const children = Array.isArray(node?.children) ? node.children : null;
  if (!children || SKIP_CHILDREN.has(node.type)) return;
  node.children = children.map((child) => {
    const block = asJsonBlock(child, source);
    if (block) return block;
    walk(child, source);
    return child;
  });
}

/** Remark plugin: a paragraph that is entirely JSON becomes a fenced `json` block. */
export function remarkJsonBlock() {
  return (tree, file) => {
    // Streamdown runs `remarkPlugins` as `unified().run(tree, file)` with the raw
    // block source on the file; without it there is nothing trustworthy to parse.
    const source = typeof file?.value === 'string' ? file.value : (typeof file === 'string' ? file : '');
    if (!source) return;
    walk(tree, source);
  };
}
