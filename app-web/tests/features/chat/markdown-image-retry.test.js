import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PATH_IMAGE_RETRY_DELAYS_MS, probeImageStatus, withRetryParam } from '../../../src/shared/lib/markdown-image-retry.js';

const markdownSource = fs.readFileSync(new URL('../../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
const markdownCss = fs.readFileSync(new URL('../../../styles/markdown.css', import.meta.url), 'utf8');
const effectSource = fs.readFileSync(new URL('../../../src/shared/lib/image-generation-effect.js', import.meta.url), 'utf8');
const cardSource = fs.readFileSync(
  new URL('../../../src/features/chat/components/ImageGenerateToolDetail.jsx', import.meta.url),
  'utf8',
);
const cardCss = fs.readFileSync(new URL('../../../styles/image-generate-tool.css', import.meta.url), 'utf8');
const timelineSource = fs.readFileSync(
  new URL('../../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const rowSource = fs.readFileSync(
  new URL('../../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url),
  'utf8',
);
const remarkImageSource = fs.readFileSync(
  new URL('../../../src/shared/lib/remark-image-paths.js', import.meta.url),
  'utf8',
);
const PREVIEW = '/api/conversations/c1/messages/images/preview?image_path=%2Ftmp%2Fgen.png';
// chat-image 在 import 时解析 API base，会读 `window`。
globalThis.window = globalThis.window || {};
const { chatImagePreviewUrl } = await import('../../../src/shared/api/chat-image.js');

test('the row conversation decides the preview scope, never the path', () => {
  // 路径里即使带着别的会话编号，也不能改变请求范围；否则 A 会话的回答会
  // 去 B 的预览接口取图。服务端仍按行所属会话再做一次根目录校验。
  const path = '/Users/z/Library/Application Support/Haish (Dev)/runtime/state/workspaces/w/'
    + 'conversations/6fd92b39cf184ff7a9dcb4e3b52df6c6/images/7c59cf10-x.png';
  const url = chatImagePreviewUrl({ path }, '22a1f2f005794b13beb09d5dc96b5630');
  assert.match(url, /^\/api\/conversations\/22a1f2f005794b13beb09d5dc96b5630\/messages\/images\/preview\?/);
  assert.doesNotMatch(url.split('?')[0], /6fd92b39cf184ff7a9dcb4e3b52df6c6/);
  assert.match(url, /image_path=%2FUsers%2Fz%2FLibrary%2FApplication\+Support%2FHaish\+%28Dev%29/);
  // 拿不到行上的会话编号时不发请求，避免猜错会话。
  assert.equal(chatImagePreviewUrl({ path }, ''), '');
  // artifact 路径同样按行会话。
  const artifact = '/Users/z/Library/Application Support/Haish (Dev)/runtime/cache/workspaces/w/'
    + 'tasks/98bcbe9f/artifacts/images/gen.png';
  assert.match(chatImagePreviewUrl({ path: artifact }, 'abc'), /^\/api\/conversations\/abc\//);
  assert.equal(chatImagePreviewUrl({ path: artifact }, ''), '');
});

test('a preview URL is retried with a cache-busting param', () => {
  assert.equal(withRetryParam(PREVIEW, 0), PREVIEW);
  assert.equal(withRetryParam(PREVIEW, 1), `${PREVIEW}&haish_retry=1`);
  assert.equal(withRetryParam(PREVIEW, 2), `${PREVIEW}&haish_retry=2`);
  // No query string yet: the param still has to be well formed.
  assert.equal(withRetryParam('/api/x', 1), '/api/x?haish_retry=1');
  assert.equal(withRetryParam('', 1), '');
});

test('retries are bounded and spaced out', () => {
  // 只允许一次自动重试：多一点就是看着空框等（失败是接口真的不给图，重试次数不解决）。
  assert.equal(PATH_IMAGE_RETRY_DELAYS_MS.length, 1);
  for (const delay of PATH_IMAGE_RETRY_DELAYS_MS) {
    assert.ok(Number.isFinite(delay) && delay > 0);
    // 自动重试要快：它盖的是「刚跑完一轮、根还没登记」这类几毫秒的竞争。
    assert.ok(delay <= 1000, 'the silent retry must not become a wait');
  }
});

test('a picture the server says is missing is not retried behind an empty frame', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 403 });
    };
    assert.equal(await probeImageStatus(PREVIEW), 'missing');
    assert.equal(calls.length, 1);
    // 只要状态码：Range 探针不会把整张图拉下来。
    assert.equal(calls[0].options.headers.Range, 'bytes=0-0');
    assert.equal(calls[0].options.cache, 'no-store');
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.equal(await probeImageStatus(PREVIEW), 'missing');
    // 2xx（含 Range 的 206）是“能解析”：预检放行，交给正常加载。
    globalThis.fetch = async () => new Response(null, { status: 206 });
    assert.equal(await probeImageStatus(PREVIEW), 'ok');
    globalThis.fetch = async () => new Response(null, { status: 503 });
    assert.equal(await probeImageStatus(PREVIEW), 'unavailable');
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    assert.equal(await probeImageStatus(PREVIEW), 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a missing picture falls back to the original path, not an empty box', () => {
  assert.match(markdownSource, /import \{ PATH_IMAGE_RETRY_DELAYS_MS, probeImageStatus, withRetryParam \}/);
  assert.match(markdownSource, /void probeImageStatus\(withRetryParam\(requestSrc, attempt\)\)\.then/);
  assert.match(markdownSource, /if \(phase === 'missing' \|\| phase === 'failed'\) \{/);
  assert.match(markdownSource, /data-preview-failed=\{phase\}/);
  // 不再靠 origin 区分正文路径和 Markdown 图片，二者都直接显示路径。
  assert.doesNotMatch(markdownSource, /const origin = marker && marker\.origin/);
  assert.doesNotMatch(markdownCss, /\.haish-markdown-image\[data-phase='missing'\]/);
  // 来源必须经图片地址传：默认 sanitize 白名单会把 data-* 全剥掉（浏览器里实测只剩 src/alt）。
  assert.doesNotMatch(markdownSource, /data-haish-image-source/);
  // 状态按源地址隔离，不能用 effect 在挂载后重置（会盖掉已经到达的 onLoad）。
  assert.match(markdownSource, /<ResolvedMarkdownImage key=\{cached\?\.src \|\| resolvedSrc\}/);
  assert.doesNotMatch(markdownSource, /setAttempt\(0\)/);
});

test('unresolvable paths never show the mosaic loading frame', () => {
  // 预检在挂框之前：1 字节 Range 探针问一次预览接口，终态 403/404 直接显示路径。
  // 探针说不清（5xx/断网）时不能拦：那可能只是运行时还没就绪。
  assert.match(markdownSource, /const \[probe, setProbe\] = React\.useState/);
  assert.match(markdownSource, /void check\(0\);/);
  assert.match(markdownSource, /const result = await probeImageStatus\(resolvedSrc\);/);
  assert.match(markdownSource, /if \(probe === 'pending'\) \{/);
  assert.match(markdownSource, /if \(probe === 'missing'\) \{/);
  // 预检的静默复探与失败重试同节奏，不复用旧的 attempt 状态。
  assert.match(markdownSource, /retryTimer = setTimeout\(\(\) => \{ void check\(attempt \+ 1\); \}, PATH_IMAGE_RETRY_DELAYS_MS\[attempt\]\)/);
  // 预检期间不渲染任何占位（不闪路径文本也不闪框）。
  assert.match(markdownSource, /return null;/);
  // 已缓存的图不走预检：warm 复用不能多出一次探针。
  assert.match(markdownSource, /if \(!marker \|\| !resolvedSrc \|\| cached\) return undefined;/);
  assert.match(markdownSource, /useState\(\(\) => \(cached \|\| !marker \|\| !resolvedSrc\) \? 'ok' : 'pending'\)/);
  assert.match(markdownSource, /probe=\{probe\}/);
  assert.match(markdownSource, /probe = 'ok',/);
});

test('a tool card whose preview is gone shows its path instead of an empty frame', () => {
  assert.match(cardSource, /const imagePath = String\(view\?\.generatedImagePath \|\| ''\)/);
  assert.match(cardSource, /<p className="aui-imagegen-path">\{imagePath\}<\/p>/);
  assert.match(cardCss, /\.aui-imagegen-path \{/);
  assert.doesNotMatch(cardSource, /aui-imagegen-broken/);
});

test('structured answer paths replace the prose path inline, never append a block', () => {
  assert.match(rowSource, /normalizeLocalImagePath/);
  assert.match(rowSource, /answerImagePathBySuffix/);
  // 模型经常把长目录缩写成 `.../images/x.png`；缩写尾部要能命中结构化路径，
  // 命中后改用结构化路径本身去拼预览。
  assert.match(rowSource, /const bound = resolveAnswerImagePath\(path\);/);
  assert.match(rowSource, /chatImagePreviewUrl\(\{ path: bound \}, conversationId\)/);
  // 纯文件名不作为匹配依据：不同代同名图会冲突。
  assert.match(rowSource, /depth >= 2/);
  assert.doesNotMatch(rowSource, /answerImagesSource/);
  assert.doesNotMatch(rowSource, /chat-answer-images/);
  assert.doesNotMatch(rowSource, /pathImages=\{answerImages\.length === 0\}/);
});

test('decoded answer and tool-card images open the shared chat preview overlay', () => {
  assert.match(markdownSource, /const ImagePreviewContext = React\.createContext\(null\);/);
  assert.match(markdownSource, /React\.useContext\(ImagePreviewContext\)/);
  assert.match(markdownSource, /onPreviewImage\(\{ src: resolvedSrc, title: label \|\| alt/);
  assert.match(markdownSource, /data-previewable=\{canPreview \? 'true' : undefined\}/);
  assert.match(rowSource, /<FinalAnswerMarkdown[^>]*onPreviewImage=\{onPreviewImage\}/);
  assert.match(cardSource, /export function ImageGenerateToolDetail\(\{ view, conversationId, onPreviewImage \}\)/);
  assert.match(cardSource, /onPreviewImage\(\{ src: previewUrl, title: alt \}\)/);
  assert.match(cardSource, /data-previewable=\{canPreview \? 'true' : undefined\}/);
  assert.match(timelineSource, /<ImageGenerateToolDetail view=\{view\} conversationId=\{conversationId\} onPreviewImage=\{onPreviewImage\}/);
  assert.match(markdownCss, /\.haish-markdown-image-img\[data-previewable='true'\] \{/);
  assert.match(cardCss, /\.aui-imagegen-frame\[data-previewable='true'\]/);
});

test('the resolver is per Markdown instance, never a shared remark option', () => {
  // 真实故障：把 resolveImage 当插件选项传。streamdown 的 processor 缓存 key 是
  // `插件名 + JSON.stringify(选项)`，函数序列化成 `{}` → 全页共用第一个实例的
  // resolver，所有图片都按第一行的会话去取 → 403。
  assert.match(markdownSource, /return \[\.\.\.base, remarkImagePaths\];/);
  assert.doesNotMatch(markdownSource, /\[remarkImagePaths, \{/);
  // 插件这一层不许再知道 resolver（知道就说明它又被当选项传了）。注释不算，只看代码。
  assert.doesNotMatch(remarkImageSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /resolveImage/);
  // 路径 → 预览地址在组件里做，resolver 由 context 下发。
  assert.match(markdownSource, /const ImagePathResolverContext = React\.createContext\(null\);/);
  assert.match(markdownSource, /<ImagePathResolverContext\.Provider value=\{imagePathResolver\}>/);
  assert.match(markdownSource, /const resolveImagePath = React\.useContext\(ImagePathResolverContext\);/);
  // 标记地址必须能过 sanitize 协议白名单，否则 img 的 src 直接被当成非法 URL 抽掉。
  assert.match(markdownSource, /src: \[\.\.\.sanitizeSchema\.protocols\.src, 'haish-image'\]/);
  assert.match(markdownSource, /if \(key === 'src' && \(parseImageMarker\(value\) \|\| isChatImagePreviewUrl\(value\)\)\)/);
});

test('a sub-agent answer renders its pictures too', () => {
  // 兼容检查：子代理卡片也保留 resolver；本次故障发生在普通最终回答。
  assert.match(timelineSource, /<Markdown source=\{view\.finalText\} imagePathResolver=\{resolveImagePath\} \/>/);
  assert.match(timelineSource, /<Markdown source=\{streamAnswerText\} imagePathResolver=\{resolveImagePath\} \/>/);
  assert.match(timelineSource, /return \(path\) => chatImagePreviewUrl\(\{ path \}, id\) \|\| null;/);
  assert.match(timelineSource, /import \{ chatImagePreviewUrl \} from '\.\.\/\.\.\/\.\.\/shared\/api\/chat-image\.js';/);
});

test('the answer shows a frame, then the image on success', () => {
  // 用浏览器原生的 <img>：不经过 fetch()->blob，请求迟迟不返回时也不会把答案永远
  // 停在一个占位块上。
  assert.match(markdownSource, /import \{ PATH_IMAGE_RETRY_DELAYS_MS, probeImageStatus, withRetryParam \} from '\.\.\/lib\/markdown-image-retry\.js';/);
  assert.match(markdownSource, /src=\{withRetryParam\(requestSrc, attempt\)\}/);
  assert.match(markdownSource, /onLoad=\{handleLoad\}/);
  assert.match(markdownSource, /onError=\{handleError\}/);
  // 先出框，而且动效必须是生图卡同款的 img-fx 马赛克，不是自己画的 CSS 扫光。
  assert.match(markdownSource, /<span className="haish-markdown-image" data-phase=\{phase\}>/);
  assert.match(markdownSource, /<ImageGenerationEffect\n\s+preset=\{IMAGE_EFFECT_PRESET\}/);
  assert.match(effectSource, /export const IMAGE_EFFECT_PRESET = 'pixels-organic';/);
  assert.match(effectSource, /import\('img-fx'\)/);
  // 两处共用同一个动效来源，不允许各自再写一份 preset。
  assert.match(cardSource, /from '\.\.\/\.\.\/\.\.\/shared\/lib\/image-generation-effect\.js'/);
  assert.doesNotMatch(cardSource, /import\('img-fx'\)/);
  assert.match(markdownCss, /\.haish-markdown-image-frame \{/);
  // 图到了之后框淡出交接（不是直接抽走）。
  assert.match(markdownCss, /\.haish-markdown-image-frame\.is-leaving \{/);
  assert.match(markdownSource, /onAnimationEnd=\{\(\) => setFrameVisible\(false\)\}/);
  // 出不来直接显示路径；只有加载过慢时保留重试按钮。
  assert.match(markdownSource, /className="haish-markdown-image-retry"/);
  assert.match(markdownSource, /const retry = \(\) => \{/);
  assert.match(markdownSource, /<AppIcon name="retry" size=\{18\} \/>/);
  assert.match(markdownSource, /aria-label="图片还在加载，重新加载"/);
  assert.match(markdownSource, /data-preview-failed=\{phase\}/);
  assert.doesNotMatch(markdownSource, /图片没加载出来/);
  assert.doesNotMatch(markdownSource, /'还在取图，重试'/);
  // 图标按钮是圆的、只装一个图标：没有字的按钮不需要横向 padding。
  assert.match(markdownCss, /\.haish-markdown-image-retry \{[^}]*width: 40px;/);
  assert.match(markdownCss, /\.haish-markdown-image-retry:focus-visible \{/);
  const retryRule = /(\.haish-markdown-image-retry \{[^}]*\})/.exec(markdownCss)?.[1] ?? '';
  assert.doesNotMatch(retryRule, /padding: 8px 16px/);
  assert.doesNotMatch(retryRule, /white-space/);
  assert.doesNotMatch(markdownSource, /data-preview-failed=\{`img-error/);
  assert.doesNotMatch(markdownSource, /setFailed\(true\)/);
  // 卡住不返回时，按钮要过一段时间才出现（图一直在后台加载，晚到也要能显示）。
  assert.match(markdownSource, /const PATH_IMAGE_SLOW_RETRY_MS = 8000;/);
  assert.match(markdownSource, /timers\.current\.slow = setTimeout\(\(\) => setPhase\('slow'\), PATH_IMAGE_SLOW_RETRY_MS\)/);
  // 已经等很久才失败的那一次，不再自动重试：慢失败直接给图标，不让用户再等一轮。
  assert.match(markdownSource, /const PATH_IMAGE_SLOW_FAILURE_MS = 1500;/);
  assert.match(markdownSource, /if \(tookTooLong \|\| attempt >= PATH_IMAGE_RETRY_DELAYS_MS\.length\) \{/);
  // 生成卡与正文共享已加载预览，缓存命中不再出马赛克；冷图检查 complete 兜住早到的 load。
  assert.match(markdownSource, /React\.useSyncExternalStore\(subscribeLoadedChatImages/);
  assert.match(markdownSource, /useState\(cached \? 'loaded'/);
  assert.match(markdownSource, /useState\(!cached\)/);
  assert.match(markdownSource, /React\.useLayoutEffect\(\(\) => \{\n\s+handleLoad\(\);/);
  assert.match(markdownSource, /image\?\.complete/);
  assert.match(cardSource, /rememberLoadedChatImage\(previewUrl, image\)/);
  assert.match(markdownSource, /alive\.current = true;/);
  assert.match(markdownSource, /current === generation\.current/);
  // 重试/超时的定时器在卸载或换图时必须清掉。
  assert.match(markdownSource, /clearTimeout\(timers\.current\.retry\)/);
  assert.match(markdownSource, /clearTimeout\(timers\.current\.slow\)/);
  // 图片不能把绝对路径挂到 title 上：悬停会弹一条本地目录路径（链接的 title 不受影响）。
  assert.doesNotMatch(markdownSource, /<img[^>]*title=\{/);
  // 旧的 fetch->blob 方案会把 "请求不返回" 变成 "永久占位"，不允许再出现。
  assert.doesNotMatch(markdownSource, /createObjectURL/);
  assert.doesNotMatch(markdownSource, /await fetch\(/);
  assert.doesNotMatch(markdownSource, /haish-markdown-image-placeholder/);
});
