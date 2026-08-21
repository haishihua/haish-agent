// @haish-esm
import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $nodesOfType,
  DecoratorNode,
} from 'lexical';

class SkillTokenNode extends DecoratorNode {
  constructor(skillName = '', key) {
    super(key);
    this.__skillName = skillName;
  }

  static getType() {
    return 'skill-token';
  }

  static clone(node) {
    return new SkillTokenNode(node.__skillName, node.__key);
  }

  static importJSON(serializedNode) {
    return new SkillTokenNode(serializedNode.skillName || '');
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      skillName: this.__skillName,
      type: 'skill-token',
      version: 1,
    };
  }

  getSkillName() {
    return this.getLatest().__skillName;
  }

  createDOM() {
    const element = document.createElement('span');
    element.className = 'chat-skill-token-host';
    return element;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return (
      <span
        className="chat-skill-token"
        data-skill-token={this.__skillName}
        role="button"
        aria-label={`Remove ${this.__skillName} skill`}
        title="Click to remove skill"
      >
        <span className="ico ico-skill chat-skill-icon" aria-hidden="true" />
        <span>{this.__skillName}</span>
      </span>
    );
  }

  getTextContent() {
    return '';
  }

  isInline() {
    return true;
  }

  isIsolated() {
    return true;
  }
}

function $createSkillTokenNode(skillName) {
  return $applyNodeReplacement(new SkillTokenNode(skillName));
}

function appendPlainText(parent, value) {
  const lines = String(value || '').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) parent.append($createLineBreakNode());
    if (line) parent.append($createTextNode(line));
  });
}

function selectionHasContent(rootElement, direction) {
  const domSelection = window.getSelection();
  if (!rootElement || !domSelection || !domSelection.isCollapsed || !domSelection.anchorNode) return false;
  if (!rootElement.contains(domSelection.anchorNode)) return false;

  const range = document.createRange();
  range.selectNodeContents(rootElement);
  if (direction === 'before') {
    range.setEnd(domSelection.anchorNode, domSelection.anchorOffset);
  } else {
    range.setStart(domSelection.anchorNode, domSelection.anchorOffset);
  }
  const fragment = range.cloneContents();
  fragment.querySelectorAll?.('.chat-skill-token-host, [data-skill-token]').forEach((node) => node.remove());
  return Boolean(fragment.textContent || fragment.querySelector?.('br'));
}

function ComposerController({ value, selectedSkill, disabled, maxLength, onChange, apiRef }) {
  const [editor] = useLexicalComposerContext();
  const lastEmittedValueRef = React.useRef(String(value || ''));

  React.useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  React.useEffect(() => {
    const nextValue = String(value || '').slice(0, maxLength);
    const nextSkillName = selectedSkill?.name || '';
    let shouldSync = false;
    editor.getEditorState().read(() => {
      const currentSkillName = $nodesOfType(SkillTokenNode)[0]?.getSkillName() || '';
      shouldSync = $getRoot().getTextContent() !== nextValue || currentSkillName !== nextSkillName;
    });
    if (!shouldSync) return;

    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      if (nextSkillName) paragraph.append($createSkillTokenNode(nextSkillName));
      appendPlainText(paragraph, nextValue);
      root.append(paragraph);
    }, { tag: 'composer-controlled-value' });
    lastEmittedValueRef.current = nextValue;
  }, [editor, maxLength, selectedSkill?.name, value]);

  React.useEffect(() => {
    apiRef.current = {
      focus() {
        editor.focus();
      },
      focusAtEnd() {
        editor.focus(() => {
          editor.update(() => $getRoot().selectEnd(), { tag: 'composer-focus' });
        });
      },
      insertText(text) {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const remaining = Math.max(0, maxLength - $getRoot().getTextContent().length);
          selection.insertText(String(text || '').slice(0, remaining));
        });
      },
      isSelectionAtStart() {
        return !selectionHasContent(editor.getRootElement(), 'before');
      },
      isSelectionAtEnd() {
        return !selectionHasContent(editor.getRootElement(), 'after');
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, editor, maxLength]);

  const handleChange = React.useCallback((editorState) => {
    editorState.read(() => {
      const nextValue = $getRoot().getTextContent().slice(0, maxLength);
      if (nextValue === lastEmittedValueRef.current) return;
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    });
  }, [maxLength, onChange]);

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
}

export const LexicalComposerInput = React.forwardRef(function LexicalComposerInput({
  value,
  selectedSkill,
  disabled = false,
  maxLength = 5000,
  placeholder = '',
  onChange,
  onKeyDown,
  onPaste,
  onRemoveSkill,
}, forwardedRef) {
  const apiRef = React.useRef(null);
  React.useImperativeHandle(forwardedRef, () => ({
    focus: () => apiRef.current?.focus(),
    focusAtEnd: () => apiRef.current?.focusAtEnd(),
    insertText: (text) => apiRef.current?.insertText(text),
    isSelectionAtStart: () => apiRef.current?.isSelectionAtStart() ?? false,
    isSelectionAtEnd: () => apiRef.current?.isSelectionAtEnd() ?? false,
  }), []);

  const initialConfig = React.useMemo(() => ({
    namespace: 'HaishChatComposer',
    nodes: [SkillTokenNode],
    editable: !disabled,
    onError(error) {
      throw error;
    },
    theme: {
      paragraph: 'chat-composer-paragraph',
    },
  }), [disabled]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div
        className="chat-composer-editor-shell"
        onMouseDown={(event) => {
          const token = event.target.closest?.('[data-skill-token]');
          if (!token) return;
          event.preventDefault();
          onRemoveSkill?.();
          requestAnimationFrame(() => apiRef.current?.focus());
        }}
      >
        <PlainTextPlugin
          contentEditable={(
            <ContentEditable
              className="chat-composer-editor"
              aria-label="Message"
              spellCheck
              onKeyDownCapture={onKeyDown}
              onPaste={onPaste}
            />
          )}
          placeholder={selectedSkill ? null : <div className="chat-composer-placeholder">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ComposerController
          value={value}
          selectedSkill={selectedSkill}
          disabled={disabled}
          maxLength={maxLength}
          onChange={onChange}
          apiRef={apiRef}
        />
      </div>
    </LexicalComposer>
  );
});
