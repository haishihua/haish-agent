/**
 * ask_user 每题的回答草稿：默认选项和补充文字分开存，互相不清空。
 *
 * 一题只产出一条答案，形状由这里统一决定（组件不许自己拼）：
 * - 只勾选：{ question_id, kind: 'selection', values: [...] }
 * - 只写字：{ question_id, kind: 'freeform', text: '...' }
 * - 又勾又写：selection 再带 note（core 的 _normalize_user_input_answers 只认这个形状）
 */

function draftValues(draft) {
  return Array.isArray(draft?.values) ? draft.values : [];
}

function draftText(draft) {
  return typeof draft?.text === 'string' ? draft.text : '';
}

/** 读一道题的草稿（题没动过就是空草稿）。 */
export function readDraft(drafts, questionId) {
  const draft = drafts?.[questionId];
  return { values: [...draftValues(draft)], text: draftText(draft) };
}

/** 勾选/取消一个默认选项：只动 values，已写下的备注保留。 */
export function toggleDraftSelection(draft, label, multiple = false) {
  const values = draftValues(draft);
  const nextValues = multiple
    ? (values.includes(label) ? values.filter((value) => value !== label) : [...values, label])
    : [label];
  return { values: nextValues, text: draftText(draft) };
}

/** 写备注：只动 text，已勾选的选项保留。 */
export function writeDraftText(draft, text) {
  return { values: [...draftValues(draft)], text: String(text ?? '') };
}

/** 一题的答案；没勾也没写返回 null。 */
export function buildAnswer(question, draft) {
  const values = draftValues(draft);
  const text = draftText(draft).trim();
  if (values.length) {
    return text
      ? { question_id: question.id, kind: 'selection', values: [...values], note: text }
      : { question_id: question.id, kind: 'selection', values: [...values] };
  }
  return text ? { question_id: question.id, kind: 'freeform', text } : null;
}

export function buildAnswers(questions, drafts) {
  return (Array.isArray(questions) ? questions : []).flatMap((question) => {
    const answer = buildAnswer(question, readDraft(drafts, question.id));
    return answer ? [answer] : [];
  });
}

/** 每题都能交（选了选项，或写了字，或两者都有）。 */
export function allQuestionsAnswered(questions, drafts) {
  const list = Array.isArray(questions) ? questions : [];
  return list.length > 0
    && list.every((question) => buildAnswer(question, readDraft(drafts, question.id)) !== null);
}
