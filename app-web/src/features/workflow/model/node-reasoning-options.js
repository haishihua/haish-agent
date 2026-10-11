import { REASONING_EFFORT_OPTIONS } from '../../chat/model/run-catalog.js';

// All nodes expose the same public levels; adapters own provider wire mapping.
export function nodeReasoningOptions() {
  return REASONING_EFFORT_OPTIONS;
}
