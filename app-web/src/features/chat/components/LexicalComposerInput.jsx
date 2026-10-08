import React from 'react';
import { BookOpen, Target } from 'lucide-react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AttachmentFileChip } from '../../../shared/ui/AttachmentFileChip.jsx';
import { composePathReferenceDraft, localPathReference, splitPathReferenceDraft, splitPathReferences } from '../model/path-references.js';
import { composerReferenceState } from '../model/composer-reference-state.js';
import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $nodesOfType,
  $setState,
  DecoratorNode,
  HISTORY_PUSH_TAG,
} from 'lexical';

class SkillTokenNode extends DecoratorNode {
  constructor(skillName = '', key, command = false) {
    super(key);
    this.__skillName = skillName;
    this.__command = command;
  }

  static getType() {
    return 'skill-token';
  }

  static clone(node) {
    return new SkillTokenNode(node.__skillName, node.__key, node.__command);
  }

  static importJSON(serializedNode) {
    return new SkillTokenNode(serializedNode.skillName || '', undefined, serializedNode.command === true);
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      skillName: this.__skillName,
      command: this.__command,
      type: 'skill-token',
      version: 1,
    };
  }

  getSkillName() {
    return this.getLatest().__skillName;
  }

  isCommand() {
    return this.getLatest().__command;
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
    const Icon = this.__command ? Target : BookOpen;
    return (
      <span
        className="chat-skill-token"
        data-skill-token={this.__command ? undefined : this.__skillName}
        data-command-token={this.__command ? this.__skillName : undefined}
        role="button"
        aria-label={`Remove ${this.__skillName} ${this.__command ? 'command' : 'skill'}`}
        title={`Click to remove ${this.__command ? 'command' : 'skill'}`}
      >
        <Icon className="chat-skill-menu-icon" size={15} strokeWidth={1.5} aria-hidden="true" />
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

function $createSkillTokenNode(skillName, command = false) {
  return $applyNodeReplacement(new SkillTokenNode(skillName, undefined, command));
}

function appendPlainText(parent, value) {
  parent.append(...composerNodes(value));
}

function composerNodes(value) {
  return value.split('\n').flatMap((line, index) => [
    ...(index > 0 ? [$createLineBreakNode()] : []),
    ...(line ? [$createTextNode(line)] : []),
  ]);
}

function $composerValue() {
  const root = $getRoot();
  return composePathReferenceDraft(root.getTextContent(), $getState(root, composerReferenceState));
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
  fragment.querySelectorAll?.('.chat-skill-token-host, [data-skill-token], [data-command-token]').forEach((node) => node.remove());
  return Boolean(fragment.textContent || fragment.querySelector?.('br'));
}

function ComposerController({ value, selectedSkill, selectedCommand, disabled, maxLength, onChange, onTokenChange, onReferencesChange, apiRef }) {
  const [editor] = useLexicalComposerContext();
  const lastEmittedValueRef = React.useRef(String(value || ''));
  const lastEmittedTokenRef = React.useRef({
    name: selectedCommand?.name || selectedSkill?.name || '',
    command: Boolean(selectedCommand),
  });

  React.useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  React.useEffect(() => {
    const nextValue = String(value || '').slice(0, maxLength);
    const nextSkillName = selectedCommand?.name || selectedSkill?.name || '';
    const nextCommand = Boolean(selectedCommand);
    let shouldSync = false;
    editor.getEditorState().read(() => {
      const currentToken = $nodesOfType(SkillTokenNode)[0];
      const currentSkillName = currentToken?.getSkillName() || '';
      shouldSync = $composerValue() !== nextValue || currentSkillName !== nextSkillName
        || Boolean(currentToken?.isCommand()) !== nextCommand;
    });
    if (!shouldSync) return;

    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      const { text, references } = splitPathReferenceDraft(nextValue);
      $setState(root, composerReferenceState, references);
      if (nextSkillName) paragraph.append($createSkillTokenNode(nextSkillName, nextCommand));
      appendPlainText(paragraph, text);
      root.append(paragraph);
      lastEmittedValueRef.current = $composerValue();
      lastEmittedTokenRef.current = { name: nextSkillName, command: nextCommand };
    }, { tag: 'composer-controlled-value' });
  }, [editor, maxLength, selectedSkill?.name, selectedCommand, value]);

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
        let accepted = false;
        editor.update(() => {
          if (!editor.isEditable()) return;
          const selection = $getSelection() || $getRoot().selectEnd();
          if (!$isRangeSelection(selection)) return;
          const root = $getRoot();
          const insertion = splitPathReferenceDraft(String(text || '').replace(/\r\n?/g, '\n'));
          const references = [...$getState(root, composerReferenceState), ...insertion.references];
          const bodyLength = root.getTextContent().length + insertion.text.length
            - (insertion.text ? selection.getTextContent().length : 0);
          const nextLength = references.join('\n').length + (references.length && bodyLength ? 1 : 0) + bodyLength;
          // Never turn an over-limit path into a different, truncated path.
          if (nextLength > maxLength) return;
          if (insertion.references.length) $setState(root, composerReferenceState, references);
          if (insertion.text) selection.insertNodes(composerNodes(insertion.text));
          accepted = true;
        }, { tag: HISTORY_PUSH_TAG, discrete: true });
        return accepted;
      },
      removeReference(index) {
        if (!editor.isEditable()) return;
        editor.update(() => {
          $setState($getRoot(), composerReferenceState, (references) => references.filter((_, itemIndex) => itemIndex !== index));
        }, { tag: HISTORY_PUSH_TAG });
        editor.focus();
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
      onReferencesChange($getState($getRoot(), composerReferenceState));
      // Undo/redo can change only the token, whose text content is empty.
      const token = $nodesOfType(SkillTokenNode)[0];
      const name = token?.getSkillName() || '';
      const command = Boolean(token?.isCommand());
      if (name !== lastEmittedTokenRef.current.name || command !== lastEmittedTokenRef.current.command) {
        lastEmittedTokenRef.current = { name, command };
        onTokenChange?.(name ? { name, command } : null);
      }
      const nextValue = $composerValue().slice(0, maxLength);
      if (nextValue === lastEmittedValueRef.current) return;
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    });
  }, [maxLength, onChange, onTokenChange, onReferencesChange]);

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
}

export const LexicalComposerInput = React.forwardRef(function LexicalComposerInput({
  value,
  selectedSkill,
  selectedCommand,
  disabled = false,
  maxLength = 5000,
  placeholder = '',
  onChange,
  onTokenChange,
  onKeyDown,
  onPaste,
  onRemoveSkill,
  onRemoveCommand,
  onPathLimit,
  attachments,
}, forwardedRef) {
  const apiRef = React.useRef(null);
  const [references, setReferences] = React.useState([]);
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
      <HistoryPlugin />
      {(references.length > 0 || attachments) && <div className="chat-composer-attachments" aria-label="Attachments">
        {references.map((text, index) => <AttachmentFileChip key={`${index}:${text}`}
          attachment={localPathReference(text)} pathReference disabled={disabled}
          onClear={(event) => { event.preventDefault(); apiRef.current?.removeReference(index); }} />)}
        {attachments}
      </div>}
      <div
        className="chat-composer-editor-shell"
        onMouseDown={(event) => {
          if (disabled) return;
          const token = event.target.closest?.('[data-skill-token], [data-command-token]');
          if (!token) return;
          event.preventDefault();
          if (token.hasAttribute('data-command-token')) onRemoveCommand?.();
          else onRemoveSkill?.();
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
              onPasteCapture={(event) => {
                if (disabled) { event.preventDefault(); event.stopPropagation(); return; }
                onPaste?.(event);
                if (event.defaultPrevented) { event.stopPropagation(); return; }
                const text = event.clipboardData?.getData('text/plain') || '';
                if (!splitPathReferences(text).some((part) => part.reference)) return;
                event.preventDefault();
                event.stopPropagation();
                if (!apiRef.current?.insertText(text)) onPathLimit?.();
              }}
            />
          )}
          placeholder={selectedSkill || selectedCommand ? null : <div className="chat-composer-placeholder">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ComposerController
          value={value}
          selectedSkill={selectedSkill}
          selectedCommand={selectedCommand}
          disabled={disabled}
          maxLength={maxLength}
          onChange={onChange}
          onTokenChange={onTokenChange}
          onReferencesChange={setReferences}
          apiRef={apiRef}
        />
      </div>
    </LexicalComposer>
  );
});
