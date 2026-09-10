import { normalizeToolName } from './tool-names.js';

function object(value) {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function skillTrigger(item) {
  const name = normalizeToolName(item?.toolName || item?.tool_name);
  if (!['read_file', 'load_skill', 'skill'].includes(name)) return null;
  const input = object(item.toolInput || item.tool_input);
  const skillName = item.skillName || item.skill_name;
  const explicitPath = item.skillPath || item.skill_path;
  const path = String(input.path || input.file_path || explicitPath || '').replace(/\\/g, '/');
  // A Skill's references and scripts may carry the same metadata. Only its
  // entry document counts as loading instructions; writes never count.
  if (path && !/\/SKILL\.md$/i.test(path)) return null;
  const match = path.match(/(?:^|\/)(?:\.haish\/skills|\.agents\/skills|\.codex\/skills|\.mounted-skills|\.skills(?:-src)?)\/([^/]+)\/SKILL\.md$/i);
  if (!match && !skillName && !explicitPath) return null;
  const displayName = String(skillName || match?.[1] || path.split('/').at(-2) || '').trim();
  return displayName ? { name: displayName, path } : null;
}

export function safeToolUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function searchPresentation(item) {
  const input = object(item.toolInput);
  const response = object(item.toolResponse || item.toolOutput);
  const data = object(response.data);
  return {
    query: String(input.query || object(response.subject).query || data.query || ''),
    answer: typeof data.direct_answer === 'string' ? data.direct_answer.slice(0, 8000) : '',
    error: String(object(response.error).message || response.summary || '').slice(0, 1000),
    results: (Array.isArray(data.results) ? data.results : []).filter((result) => result && typeof result === 'object').map((result) => {
      const url = safeToolUrl(result.url);
      return {
        url,
        domain: url ? new URL(url).hostname.replace(/^www\./, '') : '',
        title: String(result.title || '').slice(0, 500),
        snippet: String(result.snippet || '').slice(0, 1500),
      };
    }),
  };
}

export function fetchPresentation(item) {
  const input = object(item.toolInput);
  const response = object(item.toolResponse || item.toolOutput);
  const data = object(response.data);
  const requestedUrl = safeToolUrl(input.url || object(response.subject).url || item.toolInput);
  const url = safeToolUrl(data.final_url) || requestedUrl;
  const content = typeof data.content === 'string' ? data.content : '';
  return {
    kind: 'fetch',
    query: requestedUrl || url,
    content: content.slice(0, 8000),
    truncated: data.truncated === true || object(response.limits).truncated === true || content.length > 8000,
    error: String(object(response.error).message || response.summary || '').slice(0, 1000),
    results: data.final_url || data.title || content ? [{
      url,
      domain: url ? new URL(url).hostname.replace(/^www\./, '') : '',
      title: String(data.title || '').slice(0, 500),
    }] : [],
  };
}

function browserText(value, tail = false) {
  const text = typeof value === 'string' ? value : '';
  if (text.length <= 8000) return text;
  return tail ? `… output truncated …\n${text.slice(-8000)}` : `${text.slice(0, 8000)}\n… truncated …`;
}

export function browserPresentation(item) {
  const input = object(item.toolInput);
  const response = object(item.toolResponse || item.toolOutput);
  const data = object(response.data);
  const artifacts = object(response.artifacts);
  const screenshot = data.screenshot || artifacts.screenshot;
  return {
    screenshot: typeof screenshot === 'string' ? screenshot : '',
    // Code and stdout may mention many pages. They are not navigation state.
    url: safeToolUrl(data.url || object(response.subject).url || input.url),
    code: browserText(input.code),
    stdout: browserText(data.stdout || artifacts.stdout, true),
    stderr: browserText(data.stderr || artifacts.stderr, true),
    error: browserText(object(response.error).message || response.summary),
  };
}

export function toolCardHeading(item, view) {
  if (view.mode === 'web-search') return { label: view.search.kind === 'fetch' ? 'Web fetch' : 'Web search', query: view.search.query };
  if (view.mode === 'browser') return { label: 'Browser use', query: view.browser.url };
  if (view.command) return { label: 'Shell', query: view.command };
  const input = object(item.toolInput);
  const path = input.path || input.file_path || view.path;
  if (typeof path === 'string' && path && view.label?.includes(path)) {
    return { label: view.label.replace(path, '').trim(), query: path };
  }
  return { label: view.label };
}
