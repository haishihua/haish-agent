// 纠偏发送带图片：真实 ChatComposer + 真实 base.css / chat.css。
//
// 用户反馈：运行中（纠偏）发一条带图片的指令，发完之后同一张图还留在输入框里「留了一份」
// （截图里输入框挂着缩略图），再按一次发送就会把同一张图发第二遍。
//
// 根因：两条发送路径的清空出口不一致——普通发送在成功后清正文 + 清图片，running（纠偏）
// 分支只调 clearComposerAfterSend()，而这个出口当时只清正文，图片草稿留在 store 里继续
// 渲染。修复把「清图片」并进唯一的清空出口（只丢 store 条目、不 revoke blob URL，刚发出的
// 那条消息的缩略图还要用）。这个页面按真实交互锁住修复后的口径：
//   1. 拖入一张图 → 输入框出现一张图片缩略图（chip），而且在屏幕上真的有布局盒子；
//   2. 运行中按「Add instruction」：onSend 收到的载荷里带着这张图（图片确实随纠偏发出去了）；
//   3. 发送被接受后：chip 0 张、图片 store 里这个会话的条目被删掉、正文清空、按钮回到 Stop；
//   4. 发送被拒绝（onSend 返回 false，例如 queueTaskInput 报错）：图片和正文都留在输入框里，
//      可以原样重试；重试被接受后同样清空；
//   5. 普通发送（没在跑）同样清空图片——两条路径共用同一个出口；
//   6. 反向断言（revert）：把发送前那张图重新塞回 store（就是修复前残留的样子），chip 会
//      重新出现在输入框上——说明上面量到的「0 张」是清空的结果，不是页面本来就没有图。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) =>
  window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`),
);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = async () => {
  await sleep(30);
  await sleep(40);
};

// 离线夹具：只有模型目录这一条请求是真的走 compose 的（和 workflow-composer-dock 同一套桩）。
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const model = JSON.parse(init.body).model;
      return Promise.resolve(Response.json({ models: [model], default_model: model }));
    }
    return Promise.reject(new Error('Unexpected API call in offline fixture'));
  }
  return originalFetch(input, init);
};

const PROVIDER_OPTIONS = [
  { id: 'openai-dev', provider: 'openai', requestProvider: 'openai', defaultModelId: 'gpt-4o-mini' },
];
const AGENT_OPTIONS = [{ id: 'simple-agent', label: 'Simple Agent' }];
const SCOPE_ID = 'steering-image';

// 图片草稿的 store 就是 AppShell → ChatPanel(imageDrafts) → ChatComposer(imageStore) 传下来的
// 那一份（scopeId → 草稿数组）。传了它，拖拽/粘贴附件才走 attachImageFile。
const imageStore = new Map();
const sentPayloads = [];
// 下一笔发送服务端接不接受（false = 走 handleDeploy 里 queueTaskInput 报错那条路）。
let acceptNextSend = true;

function steeringPng(name) {
  // 一个最小的 PNG 头字节：夹具只关心「这是一张 image/png 的 File」。
  return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' });
}

function onSend(text, attachment, modelId, reasoningEffort, images) {
  sentPayloads.push({ text, attachment, images });
  return sleep(40).then(() => acceptNextSend);
}

function Harness() {
  const [draft, setDraft] = React.useState('');
  const [running, setRunning] = React.useState(true);
  const [, setEpoch] = React.useState(0);
  React.useEffect(() => {
    window.__steeringImage = {
      setDraft: (value) => flushSync(() => setDraft(value)),
      setRunning: (value) => flushSync(() => setRunning(value)),
      // 外部 store（imageStore）是普通 Map，改完要自己催一次渲染。
      rerender: () => flushSync(() => setEpoch((value) => value + 1)),
      getDraft: () => draft,
    };
  }, [draft]);
  return (
    <ChatComposer
      scopeId={SCOPE_ID}
      draft={draft}
      onDraftChange={setDraft}
      onSend={onSend}
      onStop={() => {}}
      running={running}
      imageStore={imageStore}
      idlePlaceholder="Ask, draft, or delegate..."
      disabledPlaceholder="Agents are currently busy executing..."
      providerOptions={PROVIDER_OPTIONS}
      agentOptions={AGENT_OPTIONS}
      defaultAgentId="simple-agent"
    />
  );
}

createRoot(document.getElementById('root')).render(
  <AppTooltipProvider searchRoot={document.body}>
    <Harness />
  </AppTooltipProvider>,
);

const composerForm = () => document.querySelector('.chat-composer');
const chips = () => [...document.querySelectorAll('.chat-composer-image-chip')];
const submitButton = (label) => document.querySelector(`button[aria-label="${label}"]`);

// 从外面把一张图放进输入框：走真实的 drop 通道（.chat-composer 的 onDropCapture）。
function dropImage(file) {
  const form = composerForm();
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  form.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
  form.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
}

async function runChecks() {
  await tick();

  // 1. 拖一张图进来
  dropImage(steeringPng('steering-1.png'));
  await tick();
  check('dropping an image fills the composer with one chip', chips().length === 1, `chips=${chips().length}`);
  check(
    'the chip is really laid out on screen (not a detached node)',
    Boolean(chips()[0]?.getClientRects().length),
    `boxes=${chips()[0]?.getClientRects().length || 0}`,
  );

  // 2. 运行中发一条带图片的纠偏指令
  window.__steeringImage.setDraft('有问题 你也顺手修了');
  await tick();
  const addInstruction = submitButton('Add instruction');
  check(
    'the running composer offers the steering send button',
    Boolean(addInstruction),
    `send buttons=${document.querySelectorAll('.chat-send').length}`,
  );
  addInstruction.click();
  await tick();
  const [steering] = sentPayloads;
  check(
    'the steering payload carried the image into the running task',
    steering?.images?.length === 1 && steering.images[0].file instanceof File,
    `images=${steering?.images?.length} file=${steering?.images?.[0]?.file?.name}`,
  );
  check(
    'the steering payload carried the typed instruction',
    steering?.text === '有问题 你也顺手修了',
    `text=${JSON.stringify(steering?.text)}`,
  );

  // 3. 被接受之后：图片必须离开输入框（本次修复的断言）
  check('the accepted steering send takes the image chip away', chips().length === 0, `chips=${chips().length}`);
  check(
    'the image draft store for this conversation is emptied',
    !imageStore.has(SCOPE_ID),
    `store entries=${imageStore.size}`,
  );
  check(
    'the instruction text is cleared as well',
    window.__steeringImage.getDraft() === '',
    `draft=${JSON.stringify(window.__steeringImage.getDraft())}`,
  );
  check(
    'the send button flips back to Stop once the composer is empty',
    Boolean(submitButton('Stop')),
    'running + empty payload = Stop',
  );

  // 4. 被拒绝：图片与正文都留在输入框里，可以重试
  acceptNextSend = false;
  dropImage(steeringPng('steering-2.png'));
  window.__steeringImage.setDraft('这一笔会被服务端拒掉');
  await tick();
  submitButton('Add instruction').click();
  await tick();
  check(
    'a rejected steering send keeps the image so the user can retry',
    chips().length === 1 && imageStore.get(SCOPE_ID)?.length === 1,
    `chips=${chips().length} store=${imageStore.get(SCOPE_ID)?.length}`,
  );
  check(
    'a rejected steering send keeps the instruction text',
    window.__steeringImage.getDraft() === '这一笔会被服务端拒掉',
    `draft=${JSON.stringify(window.__steeringImage.getDraft())}`,
  );
  acceptNextSend = true;
  submitButton('Add instruction').click();
  await tick();
  check(
    'the retry clears the image once it is accepted',
    chips().length === 0 && !imageStore.has(SCOPE_ID),
    `chips=${chips().length} store=${imageStore.size}`,
  );

  // 5. 普通发送（没在跑）同样清空——两条路径共用一个出口
  window.__steeringImage.setRunning(false);
  dropImage(steeringPng('normal-1.png'));
  window.__steeringImage.setDraft('普通发送也要清图片');
  await tick();
  const send = submitButton('Send');
  check(
    'the idle composer offers the normal send button',
    Boolean(send) && !send.disabled,
    `disabled=${send?.disabled}`,
  );
  send.click();
  await tick();
  check(
    'a normal send clears the image drafts the same way',
    chips().length === 0 && !imageStore.has(SCOPE_ID),
    `chips=${chips().length} store=${imageStore.size}`,
  );

  check(
    'no page error was raised while sending with images',
    window.__pageErrors.length === 0,
    window.__pageErrors.join(' | '),
  );
  return results;
}

// 反向断言：把发送前那张图重新塞回 store（修复前残留的样子），chip 应该重新出现。
async function revertChecks() {
  const leftoverFile = steeringPng('leftover.png');
  imageStore.set(SCOPE_ID, [
    { id: 'leftover-1', file: leftoverFile, previewUrl: URL.createObjectURL(leftoverFile), uploading: false },
  ]);
  window.__steeringImage.rerender();
  await tick();
  const withLeftover = chips().length;
  imageStore.delete(SCOPE_ID);
  window.__steeringImage.rerender();
  await tick();
  return [
    {
      name: 'revert: a leftover image draft (the pre-fix state) puts a chip back into the composer',
      pass: withLeftover === 1 && chips().length === 0,
      detail: `leftover chips=${withLeftover} then ${chips().length}`,
    },
  ];
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent =
    `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n` +
    list
      .map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` [${entry.detail}]` : ''}`)
      .join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  document.title = `${failed.length ? 'FAIL' : 'PASS'}: ${list.length - failed.length}/${list.length} steering image checks`;
  return { failed: failed.length, total: list.length, results: list };
};

// 手动看的时候用：把输入框摆成「运行中 + 一张图 + 一句纠偏」的样子。
window.__steeringImageShowDraft = () => {
  window.__steeringImage.setRunning(true);
  dropImage(steeringPng('manual.png'));
  window.__steeringImage.setDraft('有问题 你也顺手修了');
};
window.__steeringImageChecks = async () => report(await runChecks());
window.__steeringImageRevertChecks = async () => report(await revertChecks());
window.__steeringImageAutoRun = () => {
  runChecks()
    .then(report)
    .catch((error) => {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    });
};

window.__steeringImageAutoRun();
