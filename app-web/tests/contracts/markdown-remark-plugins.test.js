import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { defaultRemarkPlugins } from 'streamdown';
import { remarkJsonBlock } from '../../src/shared/lib/remark-json-block.js';

// Regression: 「workflow 的节点返回的是 json，但被解析成 md」——两边的翻车都出自同一条
// 「remarkPlugins 怎么拼」。
//
//   ① 裸 JSON：Goal Loop 的 Verifier 把结构化结果当正文吐出来，一整段 JSON、没有 ```
//      围栏。CommonMark 眼里那只是一「段」：换行折成空格、`\"` 被当成 Markdown 转义吃掉，
//      气泡里是一坨读不动、复制出来也不再是合法 JSON 的文字。修法在 remark 管线里
//      （shared/lib/remark-json-block.js，Node 侧的 mdast 断言在
//      tests/features/chat/remark-json-block.test.js），这一条钉渲染器有没有把它接上。
//   ② 默认 remark 插件：Streamdown 对 remarkPlugins 是「传了就用你这份、没传才用默认」
//      （`e.remarkPlugins || 默认`，默认那套 = gfm + codeMeta）。`Markdown.jsx` 为了挂
//      remarkJsonBlock 必须自己传数组，于是默认那套会被整套换掉——gfm 一丢，答案里的
//      表格 / 删除线 / 任务列表当场退化成带竖线的普通文本。所以默认那套必须自己拼在最
//      前面（`defaultRemarkPlugins` 是 streamdown 自己导出的那份默认值，不再手抄）。
//
// 几何 / DOM 由浏览器夹具 fixtures/markdown-json-answer.* 量（真实 Markdown + 真实
// chat.css + 真实聊天气泡；含反向断言：同一份字节按修复前的插件组合重跑必须退回修复前
// 的样子）。这一条只锁源码形状与管线行为。
const markdownSource = readFileSync(new URL('../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
const fixtureModule = readFileSync(new URL('../fixtures/markdown-json-answer.jsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

// 夹具里那份 payload / 表格就是这里的输入：一条来源（免得契约在自娱自乐）。
const payloadLiteral = fixtureModule.match(/const VERIFIER_ANSWER = ("(?:\\.|[^"\\])*");/);
assert.ok(payloadLiteral, '夹具里要有 `const VERIFIER_ANSWER = "…";` 这一行');
const payload = JSON.parse(payloadLiteral[1]);
const tableLiteral = fixtureModule.match(/const TABLE = \[([\s\S]*?)\]\.join\('\\n'\);/);
assert.ok(tableLiteral, '夹具里要有 `const TABLE = [ … ].join(\'\\n\');`（默认插件那一侧的对照组）');
const TABLE = JSON.parse(`[${tableLiteral[1].replace(/,\s*$/, '')}]`).join('\n');

/** 与 Streamdown 同款：parse → remark 插件 → remark-rehype，取顶层元素标签。 */
function topTags(source, plugins) {
  const processor = unified().use(remarkParse).use(plugins).use(remarkRehype);
  const hast = processor.runSync(processor.parse(source), source);
  return (hast.children || []).filter((node) => node.type === 'element').map((node) => node.tagName);
}

/** 顶层代码块 `code` 元素的语言类名（没有代码块时返回 null）。 */
function codeLanguage(source, plugins) {
  const processor = unified().use(remarkParse).use(plugins).use(remarkRehype);
  const hast = processor.runSync(processor.parse(source), source);
  const pre = (hast.children || []).find((node) => node.tagName === 'pre');
  const className = pre?.children?.[0]?.properties?.className;
  if (!Array.isArray(className)) return null;
  const language = className.find((name) => String(name).startsWith('language-'));
  return language ? String(language).slice('language-'.length) : null;
}

// 修复后的组合（Markdown.jsx 里那两条常量就是这么拼的）与修复前的两种写法。
const FIXED = [...Object.values(defaultRemarkPlugins), remarkJsonBlock];
const OLD_NO_JSON_PLUGIN = [...Object.values(defaultRemarkPlugins)];
const OLD_NO_DEFAULTS = [remarkJsonBlock];

test('the default remark plugins stay in front of our own list', () => {
  assert.match(
    markdownSource,
    /import \{[^}]*\bdefaultRemarkPlugins\b[^}]*\} from 'streamdown'/,
    '默认那套要用 streamdown 自己导出的 defaultRemarkPlugins，别手抄 gfm / codeMeta',
  );
  assert.match(markdownSource, /const STREAMDOWN_REMARK_PLUGINS = Object\.values\(defaultRemarkPlugins\)/);
  assert.match(
    markdownSource,
    /const REMARK_PLUGINS = \[\.\.\.STREAMDOWN_REMARK_PLUGINS, remarkJsonBlock\]/,
    '助手文本：默认那套在前，裸 JSON 的插件在后',
  );
  assert.match(
    markdownSource,
    /const HARD_BREAK_REMARK_PLUGINS = \[\.\.\.STREAMDOWN_REMARK_PLUGINS, remarkHardBreaks, remarkJsonBlock\]/,
    '用户文本：默认那套同样不能少（hardBreaks 保留手敲的换行）',
  );
  assert.match(markdownSource, /remarkPlugins=\{remarkPlugins\}/, 'Streamdown 得真的收到这份列表');
  // 反向：修复前那两种「只写自家数组」的写法不许回来（它们各自对应一次线上翻车）。
  assert.doesNotMatch(markdownSource, /\[remarkJsonBlock\]/, '少了默认那套，gfm 就没了（表格退化成纯文本）');
  assert.doesNotMatch(markdownSource, /\[remarkHardBreaks, remarkJsonBlock\]/);
});

test('a bare JSON answer becomes one json code block (and without the plugin it is a paragraph)', () => {
  assert.deepEqual(topTags(payload, FIXED), ['pre'], '整段就是 JSON 时，段落换成一个代码块');
  assert.equal(codeLanguage(payload, FIXED), 'json', '语言标成 json，交给 Shiki / 代码块界面');
  // 反向：同一个插件列表去掉 remarkJsonBlock，就是修复前那一坨被折平的正文。
  assert.deepEqual(topTags(payload, OLD_NO_JSON_PLUGIN), ['p'], '去掉 remarkJsonBlock 必须退回一个段落');
});

test("a table stays a table only when streamdown's defaults stay in the list", () => {
  assert.ok(topTags(TABLE, FIXED).includes('table'), '修复后的列表里 gfm 还在，表格就是表格');
  const withoutDefaults = topTags(TABLE, OLD_NO_DEFAULTS);
  assert.ok(
    !withoutDefaults.includes('table') && withoutDefaults.includes('p'),
    `只写 [remarkJsonBlock] 时 gfm 被换掉，表格只剩带竖线的纯文本，saw ${JSON.stringify(withoutDefaults)}`,
  );
});

test('the fixture carries the reported payload and both entry points', () => {
  // 真实数据（不是玩具例子）：Goal Loop Verifier 那次「skill 那个问题」的回答，2.6KB / 17 行，
  // 字符串里带着 `\"` 转义与反引号——正是会被 CommonMark 抹掉的那一路。
  assert.ok(payload.length > 2000, `payload 要保留真实长度（实测 ${payload.length} 字节）`);
  assert.equal(payload.split('\n').length, 17, '17 行多行 JSON：软换行本来就该留在段落里');
  assert.match(payload, /"verdict": "BLOCKED"/);
  assert.match(payload, /"remaining": \[/);
  assert.ok(payload.includes('\\"skill_policy\\"'), 'payload 里要有被 Markdown 吃掉的那种转义引号');
  assert.match(fixtureModule, /window\.__markdownJsonChecks\s*=/, '夹具要暴露主检查入口');
  assert.match(fixtureModule, /window\.__markdownJsonRevertChecks\s*=/, '以及反向断言入口');
  assert.match(fixtureModule, /the bare JSON answer renders as a code block instead of a paragraph/);
  assert.match(fixtureModule, /the block is the pretty-printed payload, line for line/);
  assert.match(fixtureModule, /streamdown's default remark plugins still apply/);
  assert.match(fixtureModule, /without remarkJsonBlock the same bytes fall back to one paragraph/);
  assert.match(fixtureModule, /with only \[remarkJsonBlock\] the table is not a table any more/);
  assert.match(readme, /markdown-json-answer\.html/, 'README 的浏览器回归表要有这一页');
});
