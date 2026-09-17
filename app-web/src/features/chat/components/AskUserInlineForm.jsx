import { ApprovalSurface } from '../../../shared/ui/agent-elements/ApprovalSurface.jsx';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import React from 'react';
import { approvalStore } from '../../approvals/model/approval-store.js';
import { selectPendingUserInput } from '../model/pending-user-input.js';
import {
  allQuestionsAnswered,
  buildAnswers,
  readDraft,
  toggleDraftSelection,
  writeDraftText,
} from '../model/ask-user-draft.js';
async function submitAnswers(requestId, answers) {
  await window.haish.resolveApproval('user_input', requestId, { answers });
}

// 翻页箭头。字形 ‹ › 在深色底上又细又小（18px、无边框），是「切到下一个问题太隐晦」的
// 来源；这里换成和卡片其他图标同粗细的描边 chevron。
function StepChevron({ direction }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'previous' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    setDrafts((previous) => ({
      ...previous,
      [question.id]: toggleDraftSelection(previous[question.id], label, question.multiple),
    }));
  };
  const setFreeform = (questionId, text) => {
    setDrafts((previous) => ({
      ...previous,
      [questionId]: writeDraftText(previous[questionId], text),
    }));
  };
  // 选项与手写互不排除：只选、只写、又选又写（note）三种都能交。
  const answers = buildAnswers(questions, drafts);
  const canSubmit = allQuestionsAnswered(questions, drafts);

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
            const draft = readDraft(drafts, question.id);
            const selected = draft.values;
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
                  value={draft.text}
                  onChange={(event) => setFreeform(question.id, event.target.value)}
                  placeholder={options.length
                    ? 'Add a note, or type your own answer (optional)…'
                    : 'Type your answer…'}
                  aria-label={options.length
                    ? `Note or your own answer: ${question.question}`
                    : `Your answer: ${question.question}`}
                  rows={2}
                />
              </fieldset>
            );
          })}
        </div>
        <div className="haish-approval-actions">
          {questions.length > 1 ? (
            <div className="aicss-step-nav">
              <PortalTooltip text="Previous question" position="above">
                <button type="button" className="aicss-step-arrow" aria-label="Previous question" disabled={submitting || activeStep === 0} onClick={() => setStep(activeStep - 1)}>
                  <StepChevron direction="previous" />
                </button>
              </PortalTooltip>
              <span className="aicss-step-count" role="status">Question {activeStep + 1} of {questions.length}</span>
              <PortalTooltip text="Next question" position="above">
                <button type="button" className="aicss-step-arrow" aria-label="Next question" disabled={submitting || activeStep === questions.length - 1} onClick={() => setStep(activeStep + 1)}>
                  <StepChevron direction="next" />
                </button>
              </PortalTooltip>
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
