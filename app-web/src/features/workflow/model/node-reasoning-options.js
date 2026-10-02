import { REASONING_EFFORT_OPTIONS } from '../../chat/model/run-catalog.js';

// Only known adapter limits: unknown remote models are validated by their provider.
export function nodeReasoningOptions(model = '') {
  const id = model.toLowerCase();
  let allowed = null;
  if (id.includes('deepseek')) allowed = ['high', 'xhigh'];
  else if (id.includes('minimax')) allowed = [];
  else if (id.includes('glm') || id.includes('zhipu')) {
    const version = id.match(/glm-(\d+)(?:\.(\d+))?/);
    if (!version || Number(version[1]) < 5 || (Number(version[1]) === 5 && Number(version[2] || 0) < 2)) allowed = [];
  } else if (/^(gpt-|openai\/gpt-|o[134]|openai\/o[134])/.test(id) || /grok|xai/.test(id)) {
    allowed = ['none', 'low', 'medium', 'high', 'xhigh'];
  }
  return REASONING_EFFORT_OPTIONS.filter((option) => allowed === null || allowed.includes(option.id));
}
