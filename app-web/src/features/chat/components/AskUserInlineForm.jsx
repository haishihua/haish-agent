import { ApprovalSurface } from '../../../shared/ui/agent-elements/ApprovalSurface.jsx';
import React from 'react';
import { approvalStore } from '../../approvals/model/approval-store.js';
import { selectPendingUserInput } from '../model/pending-user-input.js';
import { apiFetch } from '../../../shared/api/client.js';
import { API_BASE } from '../../../shared/api/base.js';
async function submitAnswers(requestId, answers) {
  const response = await apiFetch(`${API_BASE}/api/user-inputs/${encodeURIComponent(requestId)}/resolve`, {
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
    return approvalStore.subscribeInputs(setPending);
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
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setDrafts({});
    setStep(0);
    setSubmitting(false);
    setError('');
  }, [request?.request_id]);

  if (!request) return null;

  const questions = Array.isArray(request.questions) ? request.questions : [];
  const activeStep = Math.min(step, Math.max(0, questions.length - 1));
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
      approvalStore.removeInput(request.request_id);
    } catch (submitError) {
      setError(String(submitError?.message || submitError));
      setSubmitting(false);
    }
  };

  return (
    <ApprovalSurface className="haish-approval-card haish-user-input-card" data-busy={submitting ? '1' : '0'}>
      <div className="haish-approval-header"><span className="haish-approval-title">Questions</span></div>
      <div className="haish-approval-body">
        {request.context ? <div className="haish-approval-intent">{request.context}</div> : null}
        {error ? <div className="haish-approval-error">{error}</div> : null}
        <div className="haish-user-input-questions">
          {questions.map((question, index) => {
            const options = Array.isArray(question.options) ? question.options : [];
            const draft = drafts[question.id];
            const selected = draft?.kind === 'selection' && Array.isArray(draft.values) ? draft.values : [];
            return (
                <fieldset className="haish-user-input-question" key={question.id || index} hidden={index !== activeStep} disabled={submitting}>
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
                  aria-label={`Custom answer: ${question.question}`}
                  rows={2}
                />
              </fieldset>
            );
          })}
        </div>
        <div className="haish-approval-actions">
          {questions.length > 1 ? (
            <div className="aicss-step-nav">
              <button type="button" className="aicss-step-arrow" aria-label="Previous question" disabled={submitting || activeStep === 0} onClick={() => setStep(activeStep - 1)}>‹</button>
              <span className="aicss-step-count" role="status">{activeStep + 1} / {questions.length}</span>
              <button type="button" className="aicss-step-arrow" aria-label="Next question" disabled={submitting || activeStep === questions.length - 1} onClick={() => setStep(activeStep + 1)}>›</button>
            </div>
          ) : null}
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
    </ApprovalSurface>
  );
}
