// @haish-esm
import React from 'react';
import { subscribeApprovalEvents } from '../approval-overlay.jsx';
import { selectPendingUserInput } from '../lib/pending-user-input.js';

function resolveApiBase() {
  const explicit = String(window.HAISH_API_BASE || '').trim();
  return explicit ? explicit.replace(/\/$/, '') : '';
}

const API_BASE = resolveApiBase();
const INITIAL_STATE_RETRY_MS = 2000;

const inputStore = (() => {
  let pending = [];
  let unsubscribeEvents = null;
  let initialPromise = null;
  let initialController = null;
  let initialRetryTimer = null;
  const listeners = new Set();

  function notify() {
    const snapshot = pending.slice();
    for (const listener of listeners) listener(snapshot);
  }

  function add(request) {
    if (!request?.request_id || pending.some((item) => item.request_id === request.request_id)) return;
    clearInitialRetry();
    pending = [...pending, request];
    notify();
  }

  function remove(requestId) {
    const next = pending.filter((item) => item.request_id !== requestId);
    if (next.length === pending.length) return false;
    pending = next;
    notify();
    return true;
  }

  function closeStream() {
    if (!unsubscribeEvents) return;
    unsubscribeEvents();
    unsubscribeEvents = null;
  }

  function clearInitialRetry() {
    if (!initialRetryTimer) return;
    clearTimeout(initialRetryTimer);
    initialRetryTimer = null;
  }

  function scheduleInitialRetry() {
    if (initialRetryTimer || listeners.size === 0) return;
    initialRetryTimer = setTimeout(() => {
      initialRetryTimer = null;
      ensureInitialState();
    }, INITIAL_STATE_RETRY_MS);
  }

  function resetWhenIdle() {
    if (listeners.size > 0) return;
    closeStream();
    clearInitialRetry();
    initialController?.abort();
    initialController = null;
    initialPromise = null;
    pending = [];
  }

  function ensureInitialState() {
    if (initialPromise) return initialPromise;
    const fetcher = typeof window.authFetch === 'function' ? window.authFetch : fetch;
    const controller = new AbortController();
    initialController = controller;
    initialPromise = fetcher(`${API_BASE}/api/approvals/state`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (controller.signal.aborted || listeners.size === 0) return;
        for (const item of Array.isArray(payload?.pending_user_inputs) ? payload.pending_user_inputs : []) {
          add({ ...item, type: 'input_requested' });
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.warn('[ask_user] failed to load pending input state', error);
        }
      })
      .finally(() => {
        if (initialController !== controller) return;
        initialController = null;
        initialPromise = null;
        // The tool event and the pending-input registration arrive on separate
        // transports. Retry the snapshot while the form is mounted so either
        // ordering still renders the request.
        if (!controller.signal.aborted && pending.length === 0) scheduleInitialRetry();
      });
    return initialPromise;
  }

  function ensureStream() {
    if (unsubscribeEvents) return;
    unsubscribeEvents = subscribeApprovalEvents((payload) => {
      if (payload.type === 'input_requested') add(payload);
      if (payload.type === 'input_resolved') remove(payload.request_id);
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      ensureStream();
      ensureInitialState();
      listener(pending.slice());
      return () => {
        listeners.delete(listener);
        resetWhenIdle();
      };
    },
    resolve(requestId) {
      remove(requestId);
    },
  };
})();

async function submitAnswers(requestId, answers) {
  const fetcher = typeof window.authFetch === 'function' ? window.authFetch : fetch;
  const response = await fetcher(`${API_BASE}/api/user-inputs/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`answer submission failed: HTTP ${response.status} ${detail}`);
  }
}

function usePendingInputs(active) {
  const [pending, setPending] = React.useState([]);
  React.useEffect(() => {
    if (!active) {
      setPending([]);
      return undefined;
    }
    return inputStore.subscribe(setPending);
  }, [active]);
  return pending;
}

export function AskUserInlineForm({
  toolCallId = '',
  toolInput = null,
  conversationId = '',
  taskId = '',
  active = false,
}) {
  const pending = usePendingInputs(active);
  const request = React.useMemo(() => selectPendingUserInput(pending, {
    active,
    conversationId,
    taskId,
    toolCallId,
    toolInput,
  }), [active, conversationId, pending, taskId, toolCallId, toolInput]);
  const [drafts, setDrafts] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setDrafts({});
    setSubmitting(false);
    setError('');
  }, [request?.request_id]);

  if (!request) return null;

  const questions = Array.isArray(request.questions) ? request.questions : [];
  const toggleSelection = (question, label) => {
    setDrafts((previous) => {
      const current = previous[question.id];
      const values = current?.kind === 'selection' && Array.isArray(current.values)
        ? current.values
        : [];
      const nextValues = question.multiple
        ? (values.includes(label) ? values.filter((value) => value !== label) : [...values, label])
        : [label];
      return {
        ...previous,
        [question.id]: { kind: 'selection', values: nextValues },
      };
    });
  };
  const setFreeform = (questionId, text) => {
    setDrafts((previous) => ({
      ...previous,
      [questionId]: { kind: 'freeform', text },
    }));
  };
  const answers = questions.flatMap((question) => {
    const draft = drafts[question.id];
    if (draft?.kind === 'selection' && Array.isArray(draft.values) && draft.values.length) {
      return [{ question_id: question.id, kind: 'selection', values: draft.values }];
    }
    if (draft?.kind === 'freeform' && String(draft.text || '').trim()) {
      return [{ question_id: question.id, kind: 'freeform', text: String(draft.text).trim() }];
    }
    return [];
  });
  const canSubmit = questions.length > 0 && questions.every((question) => {
    const draft = drafts[question.id];
    return (draft?.kind === 'selection' && Array.isArray(draft.values) && draft.values.length > 0)
      || (draft?.kind === 'freeform' && String(draft.text || '').trim().length > 0);
  });

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await submitAnswers(request.request_id, answers);
      inputStore.resolve(request.request_id);
    } catch (submitError) {
      setError(String(submitError?.message || submitError));
      setSubmitting(false);
    }
  };

  return (
    <div className="haish-approval-card haish-user-input-card" data-busy={submitting ? '1' : '0'}>
      <div className="haish-approval-body">
        {request.context ? <div className="haish-approval-intent">{request.context}</div> : null}
        {error ? <div className="haish-approval-error">{error}</div> : null}
        <div className="haish-user-input-questions">
          {questions.map((question, index) => {
            const options = Array.isArray(question.options) ? question.options : [];
            const draft = drafts[question.id];
            const selected = draft?.kind === 'selection' && Array.isArray(draft.values) ? draft.values : [];
            return (
              <fieldset className="haish-user-input-question" key={question.id || index} disabled={submitting}>
                <legend>
                  {question.header ? <span className="haish-user-input-header">{question.header}</span> : null}
                  <span className="haish-user-input-prompt">{question.question}</span>
                </legend>
                {options.length ? (
                  <div className="haish-user-input-options">
                    {options.map((option, optionIndex) => {
                      const label = String(option?.label || '');
                      const checked = selected.includes(label);
                      return (
                        <label className={`haish-user-input-option ${checked ? 'is-selected' : ''}`} key={`${label}-${optionIndex}`}>
                          <input
                            className="haish-user-input-native-control"
                            type={question.multiple ? 'checkbox' : 'radio'}
                            name={`ask-user-${request.request_id}-${question.id}`}
                            checked={checked}
                            onChange={() => toggleSelection(question, label)}
                          />
                          <span className="haish-user-input-check" aria-hidden="true" />
                          <span className="haish-user-input-option-copy">
                            <strong>{label}</strong>
                            {option?.description ? <small>{option.description}</small> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                <textarea
                  className="haish-user-input-textarea"
                  value={draft?.kind === 'freeform' ? draft.text : ''}
                  onChange={(event) => setFreeform(question.id, event.target.value)}
                  placeholder={options.length ? 'Or enter a custom answer…' : 'Enter your answer…'}
                  rows={2}
                />
              </fieldset>
            );
          })}
        </div>
        <div className="haish-approval-actions">
          {submitting ? (
            <div className="haish-approval-progress" role="status" aria-live="polite">
              <span className="haish-approval-spinner" aria-hidden="true" />
              <span>Submitting answers...</span>
            </div>
          ) : (
            <button
              type="button"
              className="haish-approval-btn haish-approval-btn-once"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              Submit answers
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
