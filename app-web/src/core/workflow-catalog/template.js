// 模板变量：清洗 `{{...}}` 记号、参数别名与输入展示文案。纯字符串处理，无依赖。
export function sanitizeWorkflowTemplateValue(value) {
  if (typeof value === 'string') {
    let next = value;
    let previous = '';
    while (next !== previous) {
      previous = next;
      next = next.replace(/{{([^{}]*){{\s*([^{}]+?)\s*}}([^{}]*)}}/g, '{{$2}}');
    }
    return next;
  }
  if (Array.isArray(value)) return value.map(sanitizeWorkflowTemplateValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeWorkflowTemplateValue(item)]));
  }
  return value;
}

function replaceWorkflowTemplateToken(value, from, to) {
  if (!from || from === to) return value;
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => replaceWorkflowTemplateToken(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceWorkflowTemplateToken(item, from, to)]),
    );
  }
  return value;
}

export function workflowParameterEntries(parameters) {
  if (Array.isArray(parameters)) {
    return parameters
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => ({
        id: String(entry.id || `parameter_${index + 1}`),
        name: String(entry.name || ''),
        value: sanitizeWorkflowTemplateValue(entry.value ?? ''),
      }));
  }
  if (parameters && typeof parameters === 'object') {
    return Object.entries(parameters).map(([name, value], index) => ({
      id: `parameter_${index + 1}`,
      name,
      value: sanitizeWorkflowTemplateValue(value),
    }));
  }
  return [];
}

export function workflowTemplateVariablePath(value) {
  const match = String(value || '').trim().match(/^{{\s*([^{}]+?)\s*}}$/);
  return match ? match[1] : '';
}

export function workflowTemplateWithParameterAliases(value, parameters) {
  return workflowParameterEntries(parameters).reduce((template, parameter) => {
    const name = String(parameter.name || '').trim();
    const source = String(parameter.value || '').trim();
    if (!name || !workflowTemplateVariablePath(source)) return template;
    return replaceWorkflowTemplateToken(template, source, `{{${name}}}`);
  }, sanitizeWorkflowTemplateValue(value));
}

export function reconcileWorkflowParameterTemplate(value, previousParameters, nextParameters) {
  const previous = workflowParameterEntries(previousParameters);
  const next = workflowParameterEntries(nextParameters);
  const nextById = new Map(next.map((parameter) => [parameter.id, parameter]));
  let template = sanitizeWorkflowTemplateValue(value);
  previous.forEach((parameter) => {
    const oldName = String(parameter.name || '').trim();
    if (!oldName) return;
    const replacement = nextById.get(parameter.id);
    if (!replacement) {
      template = replaceWorkflowTemplateToken(template, `{{${oldName}}}`, parameter.value || '');
      return;
    }
    const nextName = String(replacement.name || '').trim();
    if (nextName && nextName !== oldName) {
      template = replaceWorkflowTemplateToken(template, `{{${oldName}}}`, `{{${nextName}}}`);
    }
  });
  return workflowTemplateWithParameterAliases(template, next);
}

export function workflowTokenRangeAt(text, start, end) {
  const selectedStart = Math.min(start, end);
  const selectedEnd = Math.max(start, end);
  const exactMatch = text.match(/^{{\s*[^{}]+?\s*}}$/);
  if (exactMatch) return { start: 0, end: text.length };
  const tokenPattern = /{{\s*[^{}]+?\s*}}/g;
  let match = tokenPattern.exec(text);
  while (match) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    const cursorInsideToken = selectedStart === selectedEnd && selectedStart > tokenStart && selectedStart < tokenEnd;
    const selectionTouchesToken = selectedStart < tokenEnd && selectedEnd > tokenStart;
    if (cursorInsideToken || selectionTouchesToken) return { start: tokenStart, end: tokenEnd };
    match = tokenPattern.exec(text);
  }
  return { start: selectedStart, end: selectedEnd };
}

export function workflowArgumentsText(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function workflowDisplayString(value) {
  const raw = String(value || '');
  const trimmed = raw.trim();
  if (/^(?:\{|\[|")/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== raw) return workflowInputDisplayText(parsed);
    } catch {
      // Not JSON: keep the original user text and only restore escaped line breaks.
    }
  }
  return raw.replace(/\\r\\n|\\n|\\r/g, '\n');
}

function hasWorkflowDisplayValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function workflowInputDisplayText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return workflowDisplayString(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const message = typeof value.message === 'string' ? workflowDisplayString(value.message).trim() : '';
    const metadata = Object.fromEntries(
      Object.entries(value).filter(([key, item]) => key !== 'message' && hasWorkflowDisplayValue(item)),
    );
    if (message && Object.keys(metadata).length === 0) return message;
    const metadataText = Object.keys(metadata).length > 0 ? workflowArgumentsText(metadata) : '';
    if (message && metadataText) return `${message}\n\n**Input metadata**\n\n\`\`\`json\n${metadataText}\n\`\`\``;
    if (metadataText) return `\`\`\`json\n${metadataText}\n\`\`\``;
  }
  return `\`\`\`json\n${workflowArgumentsText(value)}\n\`\`\``;
}

export function workflowVariableTypeForValue(value, variables) {
  const path = workflowTemplateVariablePath(value);
  if (!path) return 'any';
  return variables.find((item) => item.path === path)?.type || 'any';
}
