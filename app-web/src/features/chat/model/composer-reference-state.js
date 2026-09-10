import { createState } from 'lexical';
import { localPathReference } from './path-references.js';

// Keep references in the same undo history as text, but outside the editable DOM.
export const composerReferenceState = createState('pathReferences', {
  parse: (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && localPathReference(item)) : [],
});
