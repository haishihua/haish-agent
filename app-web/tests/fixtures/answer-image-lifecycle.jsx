import React from 'react';
import { createRoot } from 'react-dom/client';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
import { ImageGenerateToolDetail } from '../../src/features/chat/components/ImageGenerateToolDetail.jsx';
import { ChatMessageRow, ImagePreviewOverlay } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { chatImagePreviewUrl } from '../../src/shared/api/chat-image.js';
import { buildChatTimeline } from '../../src/features/chat/model/chat-timeline.js';
import { taskDetailToRuntimeTask } from '../../src/features/tasks/model/task-runtime.js';

// 离线回归启动：npx vite app-web --config app-web/tests/fixtures/answer-image-lifecycle.config.mjs
// 打开 /tests/fixtures/answer-image-lifecycle.html，先“生成完成”，再“显示最终回答”。
// 正常图片都走会话 images/；失败场景使用 /tmp 路径验证直接显示路径。
// fixture 对 /tasks/ 或 /artifacts/ 路径返回 404，模拟任务缓存已清理。
// 断言 window.imageLifecycle.history 中 final/warm 第一帧就是 loaded，而非 loading。
const DURABLE = '/Users/zhanruitao/Library/Application Support/Haish (Dev)/runtime/state/workspaces/w/conversations/c1/images/82382d78acabb489-gen-lifecycle.png';
const OLD = '/runtime/state/workspaces/w/conversations/c1/images/0123456789abcdef-gen-old.png';
const NEW = '/runtime/state/workspaces/w/conversations/c1/images/2f8b0d6c1a3e4f50-gen-new.png';
const resolver = (path) => chatImagePreviewUrl({ path }, 'c1');
// 与历史恢复相同，经过任务详情归一、时间线构建，再送入普通 ChatMessageRow。
function generatedTimeline(path, taskId) {
    const task = taskDetailToRuntimeTask({ task_id: taskId, conversation_id: 'c1', status: 'done', events: [{
        type: 'tool_call_started', task_id: taskId, payload: { call_id: taskId, tool_name: 'image_generate' },
    }, {
        type: 'tool_call_completed', task_id: taskId, payload: {
            call_id: taskId, tool_name: 'image_generate', tool_response: {
                status: 'ok', artifacts: { images: [{ path }] },
            },
        },
    }] });
    return buildChatTimeline(task, 'done').items;
}
const oldTimeline = generatedTimeline(OLD, 't1');
const newTimeline = generatedTimeline(NEW, 't2');
// 最终回答的图片必须来自任务详情的结构化 answer_images，而不是 fixture 手写字段。
const finalAnswerTask = taskDetailToRuntimeTask({
    task_id: 't-final', conversation_id: 'c1', status: 'done',
    answer_images: [{ image_id: 'final', path: DURABLE }],
});
const oldAnswerTask = taskDetailToRuntimeTask({
    task_id: 't1', conversation_id: 'c1', status: 'done',
    answer_images: [{ image_id: 'old', path: OLD }],
});
const newAnswerTask = taskDetailToRuntimeTask({
    task_id: 't2', conversation_id: 'c1', status: 'done',
    answer_images: [{ image_id: 'new', path: NEW }],
});
function PreviewableAnswer({ rowKey, message }) {
    const [preview, setPreview] = React.useState(null);
    return (
        <>
            <ChatMessageRow key={rowKey} message={message} onPreviewImage={setPreview} />
            {preview ? <ImagePreviewOverlay image={preview} onClose={() => setPreview(null)} /> : null}
        </>
    );
}

function PreviewableTool({ view }) {
    const [preview, setPreview] = React.useState(null);
    return (
        <>
            <ImageGenerateToolDetail view={view} conversationId="c1" onPreviewImage={setPreview} />
            {preview ? <ImagePreviewOverlay image={preview} onClose={() => setPreview(null)} /> : null}
        </>
    );
}

const history = [];
const lastStates = new Map();
window.imageLifecycle = {
    history,
    earlyLoads: 0,
    assert() {
        const check = (value, label) => { if (!value) throw new Error(label); };
        for (const id of ['cold', 'final', 'warm', 'change', 'slow']) {
            const section = document.querySelector(`[data-case="${id}"]`);
            check(section.querySelector('.haish-markdown-image')?.dataset.phase === 'loaded', `${id}: not loaded`);
            check(section.querySelector('img')?.naturalWidth === 320, `${id}: not decoded`);
            check(!section.querySelector('.haish-markdown-image-frame,.haish-markdown-image-retry'), `${id}: still covered`);
        }
        check(document.querySelector('[data-case=final] [data-message-id=answer]'), 'not an ordinary answer row');
        check(!history.some((state) => ['final', 'warm'].includes(state[0]) && ['loading', 'slow', 'failed'].includes(state[1])), 'warm answer replayed loading');
        for (const [id, color, suffix] of [['old-answer', [185, 28, 28], 'gen-old.png'], ['new-answer', [21, 128, 61], 'gen-new.png']]) {
            const section = document.querySelector(`[data-case="${id}"]`);
            const image = section.querySelector('.haish-markdown-image-img');
            check(image?.complete && image.naturalWidth === 320, `${id}: not decoded`);
            check(decodeURIComponent(image.currentSrc).includes(suffix), `${id}: wrong generation URL`);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            check(color.every((value, index) => context.getImageData(0, 0, 1, 1).data[index] === value), `${id}: wrong pixels`);
            check(!section.querySelector('.haish-markdown-image-frame,.haish-markdown-image-retry'), `${id}: still covered`);
        }
        check(!history.some((state) => state[0] === 'new-answer' && ['loading', 'slow', 'failed'].includes(state[1])), 'new generation replayed loading');
        const historicalTool = document.querySelector('[data-case=historical-tool] .aui-imagegen-image');
        check(historicalTool?.complete && historicalTool.naturalWidth === 320, 'historical tool card did not load durable image');
        check(decodeURIComponent(historicalTool.currentSrc).includes('gen-old.png'), 'historical tool card used the wrong path');
        const newTool = document.querySelector('[data-case=new-tool] .aui-imagegen-image');
        check(newTool?.complete && newTool.naturalWidth === 320, 'new tool card did not load durable image');
        check(decodeURIComponent(newTool.currentSrc).includes('gen-new.png'), 'new tool card used the wrong path');
        check(!document.querySelector('[data-case=foreign] .haish-markdown-image'), 'foreign image substituted or displayed');
        const brokenTool = document.querySelector('[data-case=broken-tool] .aui-imagegen-path');
        check(brokenTool?.textContent === '/tmp/missing-tool.png', 'broken tool card path fallback missing');
        // 403/404/5xx 不再留占位框或重试图标，直接显示原始路径。
        const pathIn = (id) => document.querySelector(`[data-case="${id}"] .haish-markdown-image-path`)?.textContent;
        for (const [id, path] of [
            ['forbidden', '/tmp/forbidden.png'],
            ['missing', '/tmp/missing.png'],
            ['server-error', '/tmp/server-error.png'],
            ['answer-forbidden', '/tmp/forbidden.png'],
            ['answer-missing', '/tmp/missing.png'],
            ['answer-server-error', '/tmp/server-error.png'],
        ]) {
            check(pathIn(id) === path, `${id}: path fallback missing`);
            check(!document.querySelector(`[data-case="${id}"] .haish-markdown-image-retry`), `${id}: retry icon still shown`);
        }
        // 预检：解析不了的路径（终态 403/404）从第一帧起就不许出马赛克框，直接是路径文本。
        for (const id of ['forbidden', 'missing', 'answer-forbidden', 'answer-missing']) {
            check(!document.querySelector(`[data-case="${id}"] .haish-markdown-image-frame`), `${id}: mosaic frame shown for unresolvable path`);
            check(!history.some((state) => state[0] === id && state[1]), `${id}: frame phase ever recorded`);
        }
        // 慢图仍要走马赛克加载框：预检只拦“解析不了”，不拦“慢”。探针返回 ok 后
        // 必须出现 loading/slow 框阶段，最终 loaded；不能因为预检把框并没了。
        check(history.some((state) => state[0] === 'slow' && (state[1] === 'loading' || state[1] === 'slow')), 'slow image skipped its loading frame');
        check(!document.querySelector('[data-case=final] .haish-markdown-image-path'), 'final answer still shows the raw path');
        check(!document.querySelector('.chat-answer-images'), 'answer images still appended at the tail');
        const previewEntries = performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => name.includes('/messages/images/preview'));
        check(previewEntries.length > 0, 'no preview requests');
        check(previewEntries.every((name) => new URL(name).pathname.startsWith('/api/conversations/c1/')), 'preview scope escaped the row conversation');
        check(
            previewEntries.every((name) => {
                const path = decodeURIComponent(new URL(name).searchParams.get('image_path') || '');
                return !path.includes('/tasks/') && !path.includes('/artifacts/');
            }),
            'artifact cache was requested for an image',
        );
        return 'PASS';
    },
};
new MutationObserver(() => {
    for (const element of document.querySelectorAll('[data-case]')) {
        const frame = element.querySelector('.haish-markdown-image');
        const image = element.querySelector('.haish-markdown-image-img');
        const state = [element.dataset.case, frame?.dataset.phase, image?.complete, image?.naturalWidth];
        if (lastStates.get(element.dataset.case) !== JSON.stringify(state)) {
            lastStates.set(element.dataset.case, JSON.stringify(state));
            history.push(state);
        }
    }
}).observe(document.getElementById('root'), { subtree: true, childList: true, attributes: true });

function Answer({ path }) {
    return <Markdown source={`文件：\n\n\`${path}\``} imagePathResolver={resolver} />;
}

function App() {
    const [cold, setCold] = React.useState(false);
    const [warm, setWarm] = React.useState(false);
    const [generated, setGenerated] = React.useState(false);
    const [final, setFinal] = React.useState(false);
    const [reopened, setReopened] = React.useState(0);
    const [path, setPath] = React.useState('/tmp/first.png');
    const [newGenerated, setNewGenerated] = React.useState(false);
    const [newFinal, setNewFinal] = React.useState(false);
    const [newReopened, setNewReopened] = React.useState(0);
    // 强制覆盖“load 在 passive effect 前到达”的窗口，不能靠网络速度碰运气。
    React.useLayoutEffect(() => {
        for (const image of document.querySelectorAll('.haish-markdown-image-img')) {
            if (image.complete && image.naturalWidth > 0) {
                image.dispatchEvent(new Event('load'));
                window.imageLifecycle.earlyLoads += 1;
            }
        }
    }, [cold, warm, final, reopened, path]);
    return <main>
        <style>{`body { background: #111722; color: #daddef; font-family: sans-serif; margin: 24px; } main { max-width: 950px; } section { border: 1px solid #3a4463; border-radius: 16px; padding: 16px; margin-top: 16px; display: inline-block; vertical-align: top; width: 420px; } h1 { font-size: 22px; } h2 { font-size: 16px; } button { margin: 4px; padding: 8px; }`}</style>
        <h1>最终回答：首次挂载、直接持久化、已加载复用</h1>
        <button id="cold" onClick={() => setCold(true)}>首次显示</button>
        <button id="generate" onClick={() => setGenerated(true)}>生成完成</button>
        <button id="final" onClick={() => setFinal(true)}>显示最终回答</button>
        <button id="warm" onClick={() => setWarm(true)}>显示已加载的同地址</button>
        <button id="reopen" onClick={() => setReopened((value) => value + 1)}>重挂载</button>
        <button id="change" onClick={() => setPath('/tmp/second.png')}>更换图片</button>
        <button id="generate-new" onClick={() => setNewGenerated(true)}>生成绿色新图</button>
        <button id="final-new" onClick={() => setNewFinal(true)}>正文误写旧图的当前回答</button>
        <button id="reopen-new" onClick={() => setNewReopened((value) => value + 1)}>重挂载新旧两轮</button>
        <section data-case="cold"><h2>冷加载</h2>{cold ? <Answer path="/tmp/cold.png" /> : null}</section>
        <section data-case="tool"><h2>生成卡</h2><PreviewableTool view={{ isRunning: !generated, generatedImagePath: generated ? DURABLE : '', task: '测试生成' }} /></section>
        <section data-case="historical-tool"><h2>历史生图卡（任务 artifacts 已清理）</h2><PreviewableTool view={{ isRunning: false, generatedImagePath: OLD, task: '历史生成' }} /></section>
        <section data-case="broken-tool"><h2>生图卡图片已失效</h2><ImageGenerateToolDetail conversationId="c1" view={{ isRunning: false, generatedImagePath: '/tmp/missing-tool.png', task: '失效生成' }} /></section>
        <section data-case="final"><h2>普通最终回答（结构化绑定）</h2><PreviewableAnswer rowKey={reopened} message={{ id: 'answer', role: 'agent', conversationId: 'c1', status: final ? 'done' : 'running', streaming: !final, text: final ? `图片已生成。文件：.../images/${DURABLE.split('/').pop()}` : '', answerImages: final ? finalAnswerTask.answerImages : [], traceTimeline: [] }} /></section>
        <section data-case="old-answer"><h2>上一轮保留红色旧图</h2><ChatMessageRow key={`old-${newReopened}`} message={{ id: 'old-answer', taskId: 't1', role: 'agent', conversationId: 'c1', status: 'done', text: `文件：\`${OLD}\``, answerImages: oldAnswerTask.answerImages, traceTimeline: oldTimeline }} /></section>
        <section data-case="new-tool"><h2>本轮生成绿色新图</h2><PreviewableTool view={{ isRunning: !newGenerated, generatedImagePath: newGenerated ? NEW : '', task: '绿色新一代' }} /></section>
        <section data-case="new-answer"><h2>本轮答案用本轮路径</h2><ChatMessageRow key={`new-${newReopened}`} message={{ id: 'new-answer', taskId: 't2', role: 'agent', conversationId: 'c1', status: newFinal ? 'done' : 'running', streaming: !newFinal, text: newFinal ? `已重新生成。文件：\`${NEW}\`` : '', answerImages: newFinal ? newAnswerTask.answerImages : [], traceTimeline: newFinal ? newTimeline : [] }} /></section>
        <section data-case="foreign"><h2>外来路径不能替换成新图</h2><ChatMessageRow message={{ id: 'foreign-answer', taskId: 't2', role: 'agent', conversationId: 'c1', status: 'done', text: `文件：\`${OLD.replace('/c1/', '/foreign/')}\``, traceTimeline: newTimeline }} /></section>
        <section data-case="warm"><h2>已加载的同地址</h2>{warm ? <Answer path={DURABLE} /> : null}</section>
        <section data-case="change"><h2>换地址</h2><Answer path={path} /></section>
        <section data-case="forbidden"><h2>403 正文</h2><Answer path="/tmp/forbidden.png" /></section>
        <section data-case="missing"><h2>404 图片</h2><Markdown source="![不存在](/tmp/missing.png)" imagePathResolver={resolver} /></section>
        <section data-case="server-error"><h2>503 重试</h2><Answer path="/tmp/server-error.png" /></section>
        <section data-case="answer-forbidden"><h2>结构化答案 403</h2><ChatMessageRow message={{ id: 'answer-forbidden', role: 'agent', conversationId: 'c1', status: 'done', text: '图片已生成。文件：`/tmp/forbidden.png`', answerImages: [{ image_id: 'forbidden', path: '/tmp/forbidden.png' }], traceTimeline: [] }} /></section>
        <section data-case="answer-missing"><h2>结构化答案 404</h2><ChatMessageRow message={{ id: 'answer-missing', role: 'agent', conversationId: 'c1', status: 'done', text: '图片已生成。文件：`/tmp/missing.png`', answerImages: [{ image_id: 'missing', path: '/tmp/missing.png' }], traceTimeline: [] }} /></section>
        <section data-case="answer-server-error"><h2>结构化答案 503</h2><ChatMessageRow message={{ id: 'answer-server-error', role: 'agent', conversationId: 'c1', status: 'done', text: '图片已生成。文件：`/tmp/server-error.png`', answerImages: [{ image_id: 'server-error', path: '/tmp/server-error.png' }], traceTimeline: [] }} /></section>
        <section data-case="slow"><h2>8.5秒晚到的图片</h2><Answer path="/tmp/slow.png" /></section>
    </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AppTooltipProvider><App /></AppTooltipProvider></React.StrictMode>);
