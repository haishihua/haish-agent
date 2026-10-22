// 搜索 / 浏览器类工具：web_search、web_fetch、browser_use。
import { browserPresentation, fetchPresentation, searchPresentation } from '../tool-presentation.js';
import {
  isToolFailure,
  outputJsonText,
  toolDisplayOutput,
  toolJsonText,
} from './shared.js';

export function buildSearchToolView(item, name) {
  const output = toolDisplayOutput(item);
  return {
    mode: name === 'browser_use' ? 'browser' : 'web-search',
    label: item.label || name.replaceAll('_', ' '),
    failed: isToolFailure(item),
    running: ['running', 'pending'].includes(item.status || 'pending'),
    cancelled: item.status === 'cancelled',
    requestJson: toolJsonText(item.toolInput),
    responseJson: outputJsonText(output),
    ...(name === 'browser_use' ? { browser: browserPresentation(item) }
      : { search: name === 'web_fetch' ? fetchPresentation(item) : searchPresentation(item) }),
  };
}
