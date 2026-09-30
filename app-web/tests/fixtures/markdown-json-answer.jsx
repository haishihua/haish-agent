// 裸 JSON 的回答必须变成一个 json 代码块 —— workflow 的节点（Goal Loop 的 Verifier）
// 把结构化结果当正文吐出来时就是这种形状：整段 JSON、没有 ``` 围栏。
//
// 现场：CommonMark 眼里那是一「段」——换行折成空格、`\"` 转义被 Markdown 当成转义吃掉，
// 气泡里是一坨读不动、复制出来也不再是合法 JSON 的文字（用户报的「workflow 的节点返回的
// 是 json 但是被解析成 md」）。修法在 remark 管线里（shared/lib/remark-json-block.js）：
// 整段就是 JSON 的段落换成 ```json 代码块，其余交给 streamdown 现成的围栏代码块路径
// （Shiki 高亮、语言标签、复制 / 下载），见 Markdown.jsx 的 codes 闸门。
//
// 这一页钉两件事——它们是同一条 remarkPlugins 的两种翻车方式：
//   ① 裸 JSON → 一个 json 代码块：Node 侧的 mdast 管线在
//      tests/features/chat/remark-json-block.test.js，这一页跑真实 Markdown
//      （真实 streamdown + 真实 chat.css）+ 真实聊天气泡结构，量渲染出来的 DOM：
//      一段变一块、字节不丢、代码块界面真的挂上来（data-language=json + 块体 + 行号）；
//   ② streamdown 默认那套 remark 插件（gfm + codeMeta）必须拼在最前面：少了 gfm，
//      同一页里的表格会退化成带竖线的普通文本（`Markdown.jsx` 自己传 remarkPlugins
//      数组会把默认那套整套换掉）。
//
// 反向断言（window.__markdownJsonRevertChecks）：按修复前的插件组合重跑同一份字节——
// 去掉 remarkJsonBlock，那段 JSON 必须退回「一个段落」；只留 [remarkJsonBlock]（默认
// 那套被换掉），表格必须不再是表格。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { defaultRemarkPlugins } from 'streamdown';
import { unified } from 'unified';
import { remarkJsonBlock } from '../../src/shared/lib/remark-json-block.js';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

// 真实数据：Goal Loop 那次「skill 那个问题」任务的 Verifier 节点最终回答（run 里
// goal_verifier.summary，逐字抄，2666 字节 / 17 行）。字符串里带着 \" 转义、反引号、
// 反斜杠路径——按 CommonMark 渲染就是一个被折平、被吃掉转义的段落。
const VERIFIER_ANSWER = "{\n  \"verdict\": \"BLOCKED\",\n  \"reason\": \"\u8bca\u65ad\u4e0e\u4ee3\u7801\u4fa7\u4fee\u590d\u90fd\u5df2\u72ec\u7acb\u9a8c\u8bc1\u901a\u8fc7\uff0c\u4f46\u76ee\u6807\u6ca1\u6709\u95ed\u73af\uff1a\u7528\u6237\u5b9e\u9645\u62a5\u7684 'skill \u90a3\u4e2a\u95ee\u9898' \u7684\u4fee\u590d\u7f3a\u53e3\u5728\u914d\u7f6e/UI \u5c42\u4ecd\u672a\u5904\u7406\uff0c\u4e14\u8be5\u6b65\u9700\u8981\u7528\u6237\u62cd\u677f\u2014\u2014\u4e09\u79cd\u53ef\u9009\u4fee\u6cd5\uff08Agent \u8bbe\u7f6e\u91cc\u52fe\u9009 esx / \u524d\u7aef\u5728\u65e0\u9650\u5236\u65f6\u53d1 null / \u76f4\u63a5\u6539\u7528\u6237\u7684 agent-1783440010656.json\uff09\u90fd\u9700\u8981\u7528\u6237\u51b3\u7b56\u4e0e\u6388\u6743\u5199\u7528\u6237 App \u6570\u636e\uff08\u5f53\u524d\u4e0d\u53ef\u7528\uff09\uff0cWorker \u81ea\u5df1\u4e5f\u4ee5 '\u8fd8\u9700\u8981\u4f60\u51b3\u5b9a\u7684\u4e00\u6b65\uff08\u6211\u4e0d\u64c5\u81ea\u52a8\uff09' \u7ed3\u5c3e\u3002\u6309 Goal Loop \u8bbe\u8ba1\u6587\u6863\u8bed\u4e49\uff0c'progress requires user input' \u5373 BLOCKED\uff1b\u4e14\u65e0\u4efb\u4f55\u53ef\u88ab Worker \u5355\u65b9\u6267\u884c\u7684\u5269\u4f59\u5de5\u4f5c\uff08\u524d\u7aef\u4e0d\u5728\u672c\u4ed3\u5e93\uff0c\u914d\u7f6e\u6539\u52a8\u5c5e\u7528\u6237\u6570\u636e\uff09\uff0c\u6545\u4e0d\u9002\u7528 CONTINUE\u3002\",\n  \"evidence\": [\n    \"\u6839\u56e0 A \u5df2\u5728\u4ee3\u7801\u4e2d\u6838\u5b9e\uff1asrc/haish_agent_core/app/profiles.py \u7684 `allowed_skill_names = None if skill_include_value is None else skill_include`\uff0c\u5373 `allow: []` = \u5168\u7981\uff1b\u7528\u6237\u7684\u771f\u5b9e\u914d\u7f6e ~/Library/Application Support/Haish (Dev)/runtime/.haish/agents/agent-1783440010656.json \u4ecd\u662f `\\\"skill_policy\\\": {\\\"allow\\\": [], \\\"deny\\\": [document-qa, product-planning, software-development, test-acceptance]}`\uff08\u672c\u6b21\u672a\u88ab\u6539\u52a8\uff09\u3002\",\n    \"\u6839\u56e0 B \u7684\u4fee\u590d\u5df2\u843d\u5730\uff1asrc/haish_agent_core/skill/registry.py \u65b0\u589e suppress()/suppressed_names()\u3001\u7b2c\u4e09\u79cd\u76ee\u5f55\u6587\u6848\uff08'Installed in this runtime but not enabled for this Agent: `esx`'\uff09\u3001clone_from_sources \u4fdd\u7559\u6291\u5236\u72b6\u6001\uff1bsrc/haish_agent_core/app/assistant.py::_apply_profile_skill_policy \u533a\u5206 deny\uff08unregister\uff0c\u4fdd\u6301\u9690\u8eab\uff09\u4e0e allow/Settings \u672a\u542f\u7528\uff08suppress + INFO \u65e5\u5fd7\uff09\uff0c\u6307\u7eb9\u7eb3\u5165 suppressed\u3002\",\n    \"\u7528\u771f\u5b9e\u6570\u636e\u7aef\u5230\u7aef\u590d\u73b0\uff08/tmp \u53ea\u8bfb\u811a\u672c\uff0c\u4ed3\u5e93\u96f6\u5199\u5165\uff09\uff1a\u771f\u5b9e esx\uff08~/.haish/skills + \u672c\u4ed3\u5e93 .haish/skills\uff09+ \u771f\u5b9e Simple Agent profile \u2192 \u4fee\u590d\u540e\u76ee\u5f55\u4e3a 'No skills are enabled for this Agent. Installed in this runtime but not enabled for this Agent: `esx`...'\uff1b\u6309 HEAD \u65e7\u903b\u8f91\uff08unregister-only\uff09\u5219\u4ecd\u662f 'No skills are currently registered ... answer that none are installed ... the absence is authoritative'\uff0c\u4e14\u8be5\u65e7\u6587\u6848\u4e0e HEAD \u4e2d\u539f\u6587\u9010\u5b57\u4e00\u81f4\uff0c\u6545 allow=null\uff08Code Agent\uff09\u8def\u5f84\u8f93\u51fa\u4e0d\u53d8\u3002\",\n    \"\u6d4b\u8bd5\uff1a.venv/bin/python -m pytest tests -q -p no:cacheprovider\uff08PYTHONDONTWRITEBYTECODE=1\uff09\u2192 1884 passed, 49 skipped, 0 failed\uff08Worker \u62a5 1883/49/0\uff0c\u5dee 1 \u6761\u6765\u81ea\u540c workspace \u53e6\u4e00\u4e2a\u5e76\u884c\u6539\u52a8\u7684\u6d4b\u8bd5\uff1b\u65e0\u5931\u8d25\uff09\u3002\u65b0\u589e\u7528\u4f8b\u8986\u76d6 registry \u7684 'installed but not enabled'\u3001\u90e8\u5206\u542f\u7528\u8ffd\u52a0\u8bf4\u660e\u3001deny \u6c38\u4e0d\u51fa\u73b0\u3001clone \u4fdd\u7559\u6291\u5236\uff0c\u4ee5\u53ca assistant \u7684 allow=[] / allow=null / deny \u4e09\u6761\u8def\u5f84\u3002\",\n    \"\u6587\u6863\u5df2\u540c\u6b65\uff1adocs/config/agent-settings.md \u5199\u660e null / [\\\"a\\\"] / [] \u4e09\u79cd\u8bed\u4e49\u4e0e\u524d\u7aef\u5e94\u53d1 null\uff1bdocs/skill/skill-mechanism-design.md \u5199\u660e suppress vs unregister\uff1bdocs/system-prompt/system-prompt.md \u8865\u5145\u7b2c\u4e09\u79cd\u76ee\u5f55\u6587\u6848\u3002\",\n    \"\u672a\u5904\u7406\u9879\u7684\u8bc1\u636e\uff1asrc/haish_agent_core/app/api.py \u7684 _normalize_custom_agent_payload \u4ecd\u628a\u5ba2\u6237\u7aef\u4f20\u6765\u7684 [] \u539f\u6837\u6301\u4e45\u5316\u4e3a []\uff08\u4ec5 null \u900f\u4f20\uff09\uff0c\u6240\u4ee5 `[]` \u8bed\u4e49\u5728 UI/\u914d\u7f6e\u5c42\u5c1a\u672a\u6536\u655b\uff1b\u524d\u7aef\u4e0d\u5728\u6b64\u4ed3\u5e93\u3002\"\n  ],\n  \"remaining\": [\n    \"\u7528\u6237\u51b3\u7b56\u5e76\u6388\u6743\u4e09\u9009\u4e00\uff1a(1) \u5728 App \u7684 Agent \u8bbe\u7f6e\u91cc\u7ed9 Simple Agent \u52fe\u4e0a esx\uff08\u524d\u7aef\u5e94\u53d1 allow: [\\\"esx\\\"]\uff09\uff1b(2) \u524d\u7aef\u5728'\u4e0d\u9650\u5236'\u65f6\u6539\u53d1 allow: null\uff08UI \u4fa7\u957f\u671f\u4fee\u6cd5\uff09\uff1b(3) \u6388\u6743\u4fee\u6539\u7528\u6237 App \u6570\u636e\u6587\u4ef6 agent-1783440010656.json \u7684 \\\"allow\\\": [] \u2192 null\uff08\u6ce8\u610f\uff1a\u82e5\u968f\u610f\u5728\u670d\u52a1\u7aef\u628a [] \u5f52\u4e00\u6210 null\uff0c\u4f1a\u7834\u574f CR/Ops \u6a21\u677f\u4e0e tests/test_agent_roles.py \u65ad\u8a00\u7684'\u96f6\u6280\u80fd'\u8bed\u4e49\uff09\u3002\",\n    \"\u51b3\u7b56\u540e\u505a\u4e00\u6b21\u771f\u5b9e\u8fd0\u884c\u9a8c\u8bc1\uff1a\u5728\u6b63\u5728\u8fd0\u884c\u7684 App \u91cc\u786e\u8ba4 Simple Agent \u7684\u7cfb\u7edf\u63d0\u793a\u8bcd\u628a esx \u6807\u4e3a\u53ef\u7528/\u672a\u542f\u7528\uff0c\u4e14 esx skill \u80fd\u88ab\u52a0\u8f7d\u6267\u884c\u3002\",\n    \"\u8303\u56f4\u5916\uff08\u672c\u76ee\u6807\u672a\u8981\u6c42\uff0c\u6545\u4e0d\u8ba1\u5165\uff09\uff1a\u626b\u63cf\u62a5\u544a\u4e2d\u7684\u5176\u4f59 harness \u95ee\u9898\uff08\u4e09\u5957\u4e0a\u4e0b\u6587\u9884\u7b97\u6570\u5b57\u4e0d\u4e00\u81f4\u3001\u91cd\u8bd5\u8017\u5c3d\u4e22\u6574\u8f6e\u7b54\u6848\u3001exec_command \u4e0e write_stdin \u7684 yield_time_ms \u8303\u56f4\u4e0d\u4e00\u81f4\uff09\u672c\u6b21\u672a\u6539\u3002\"\n  ]\n}";

// 对照组（都不能被转成代码块）：普通文字里的花括号、还有半截流式 JSON。
const PROSE_WITH_BRACES = '这段 {不是} JSON，只是普通文字。';
const HALF_STREAMED = '{\n  "verdict": "BLO';

// 默认 remark 插件（gfm）那一侧的同页证据：表格必须还是表格。
// （写成 JSON 能直接读的字符串数组：契约 tests/contracts/markdown-remark-plugins.test.js
// 把这一份当输入，一条来源。）
const TABLE = [
  "| 产品 | 机制 |",
  "| --- | --- |",
  "| Grok Build | `/goal` |",
  "| Ralph | `prd.json` |",
].join('\n');

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function report(items) {
  const box = document.getElementById('checks');
  const failures = items.filter((item) => !item.pass);
  const lines = items.map((item) => `${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `  —  ${item.detail}` : ''}`);
  const summary = `${failures.length === 0 ? 'PASS' : 'FAIL'}  ${items.length - failures.length}/${items.length} checks`;
  if (box) {
    box.textContent = `${summary}\n\n${lines.join('\n')}`;
    box.dataset.result = failures.length === 0 ? 'PASS' : 'FAIL';
  }
  return { summary, failures, items };
}

const count = (root, selector) => (root ? root.querySelectorAll(selector).length : 0);
const textOf = (root, selector) => root?.querySelector(selector)?.textContent ?? null;
const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Node 侧那条管线在浏览器里的同款：parse → remark 插件 → remark-rehype。 */
function topTagsFor(source, plugins) {
  const processor = unified().use(remarkParse).use(plugins).use(remarkRehype);
  const hast = processor.runSync(processor.parse(source), source);
  return (hast.children || []).filter((node) => node.type === 'element').map((node) => node.tagName);
}

const containsTag = (source, plugins, tagName) =>
  topTagsFor(source, plugins).some((tag) => tag === tagName || tagName === 'any');

async function runChecks() {
  results.length = 0;
  const payload = document.getElementById('payload');
  const prose = document.getElementById('prose');
  const streaming = document.getElementById('streaming');
  const table = document.getElementById('table');

  // ——— ① 裸 JSON → 一个 json 代码块 ———
  const block = payload?.querySelector('[data-streamdown="code-block"]');
  check(
    'the bare JSON answer renders as a code block instead of a paragraph',
    count(payload, 'pre') === 1 && count(payload, 'p') === 0 && Boolean(block),
    `pre=${count(payload, 'pre')} p=${count(payload, 'p')} block=${Boolean(block)}`,
  );

  check(
    'the block is presented as json (language label on the block, body rendered)',
    block?.dataset.language === 'json' && Boolean(payload?.querySelector('[data-streamdown="code-block-body"]')),
    `data-language="${block?.dataset.language ?? ''}" body=${Boolean(payload?.querySelector('[data-streamdown="code-block-body"]'))}`,
  );

  // 字节不丢：块里的文字 = JSON.stringify(parse(原文), null, 2)，行数也一样。
  let parsed = null;
  try {
    parsed = JSON.parse(VERIFIER_ANSWER);
  } catch (error) {
    check('the fixture payload itself is valid JSON', false, String(error));
  }
  // 代码块体是「一行一个 span」（行号用 CSS 计数器画），所以按行取文字再拼回原文——
  // 逐行相等就等于「字节没丢、转义没被 Markdown 吃掉、缩进还是 2」。
  const codeBody = payload?.querySelector('[data-streamdown="code-block-body"] code');
  const codeLines = Array.from(codeBody?.children || []).map((line) => line.textContent);
  const codeText = codeLines.join('\n');
  const expected = parsed ? JSON.stringify(parsed, null, 2) : '';
  check(
    'every byte survives: the block is the pretty-printed payload, line for line',
    Boolean(parsed) && codeText === expected && codeLines.length === expected.split('\n').length,
    `lines=${codeLines.length} expectedLines=${expected.split('\n').length} exact=${codeText === expected}`,
  );

  // 高亮：Shiki 真的跑过（块体里是带颜色变量的 token span），行号也开着。
  check(
    'the block body is really highlighted (shiki tokens + line numbers)',
    count(payload, '[data-streamdown="code-block-body"] code span') > 10 &&
      /line/.test(String(payload?.querySelector('[data-streamdown="code-block-body"] code')?.className || '')),
    `tokens=${count(payload, '[data-streamdown="code-block-body"] code span')} class="${payload?.querySelector('[data-streamdown="code-block-body"] code')?.className ?? ''}"`,
  );

  check(
    'the payload keeps its own newlines (no <br> inside the block)',
    count(payload, 'br') === 0 && count(payload, 'p') === 0,
    `br=${count(payload, 'br')}`,
  );

  // ——— 对照组 ———
  check(
    'braces in ordinary prose stay prose',
    count(prose, 'p') === 1 && count(prose, 'pre') === 0 && (prose?.textContent || '').includes('这段 {不是} JSON，只是普通文字。'),
    `p=${count(prose, 'p')} pre=${count(prose, 'pre')}`,
  );

  check(
    'a half-streamed payload stays prose until it parses',
    count(streaming, 'pre') === 0 && count(streaming, 'p') === 1,
    `p=${count(streaming, 'p')} pre=${count(streaming, 'pre')}`,
  );

  // ——— ② 默认那套 remark 插件（gfm）没被挤掉 ———
  check(
    "streamdown's default remark plugins still apply: a table stays a table",
    Boolean(table?.querySelector('[data-streamdown="table-wrapper"]')) &&
      count(table, 'table') === 1 &&
      count(table, '[data-streamdown="table-row"]') === 3,
    `wrapper=${Boolean(table?.querySelector('[data-streamdown="table-wrapper"]'))} rows=${count(table, '[data-streamdown="table-row"]')}`,
  );

  check('no page errors while rendering', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return report(results);
}

// 反向断言：同一份字节换成修复前的插件组合，必须退回修复前的样子。
function revertChecks() {
  const defaults = Object.values(defaultRemarkPlugins);
  const payloadTags = topTagsFor(VERIFIER_ANSWER, defaults);            // 修复前：没有 remarkJsonBlock
  const tableTags = topTagsFor(TABLE, [remarkJsonBlock]);               // 修复前：只有自家数组，默认那套被换掉
  const list = [
    {
      name: 'revert: without remarkJsonBlock the same bytes fall back to one paragraph',
      pass: jsonEqual(payloadTags, ['p']),
      detail: `top-level tags = ${JSON.stringify(payloadTags)}（修复前这段 JSON 就是一个段落）`,
    },
    {
      name: 'revert: with only [remarkJsonBlock] the table is not a table any more',
      pass: !tableTags.includes('table') && tableTags.includes('p'),
      detail: `top-level tags = ${JSON.stringify(tableTags)}（gfm 被换掉后表格只剩带竖线的纯文本）`,
    },
  ];
  return report(list);
}

const root = createRoot(document.getElementById('root'));
flushSync(() =>
  root.render(
    <div className="json-fixture">
      <header>markdown bare JSON — workflow 节点吐出来的裸 JSON 要变成 json 代码块（gfm 也不能被挤掉）</header>
      <div id="stage">
        <div className="chat-message-list">
          <section id="payload" className="chat-message-row agent">
            <div className="chat-bubble message-shell agent-response">
              <div className="chat-bubble-text">
                <Markdown source={VERIFIER_ANSWER} />
              </div>
            </div>
          </section>
          <section id="prose" className="chat-message-row agent">
            <div className="chat-bubble message-shell agent-response">
              <div className="chat-bubble-text">
                <Markdown source={PROSE_WITH_BRACES} />
              </div>
            </div>
          </section>
          <section id="streaming" className="chat-message-row agent">
            <div className="chat-bubble message-shell agent-response">
              <div className="chat-bubble-text">
                <Markdown source={HALF_STREAMED} streaming />
              </div>
            </div>
          </section>
          <section id="table" className="chat-message-row agent">
            <div className="chat-bubble message-shell agent-response">
              <div className="chat-bubble-text">
                <Markdown source={TABLE} />
              </div>
            </div>
          </section>
        </div>
      </div>
      <pre id="checks" role="status">Running checks…</pre>
    </div>,
  ),
);

window.__markdownJsonChecks = async () => runChecks();
window.__markdownJsonRevertChecks = async () => revertChecks();
window.__markdownJsonAutoRun = () => {
  // 用 setTimeout 轮询而不是 rAF：后台标签页也能跑完。
  (async () => {
    await document.fonts.ready;
    for (let i = 0; i < 100; i += 1) {
      if (document.querySelector('#payload [data-streamdown="code-block-body"] code span')) break;
      await sleep(100);
    }
    try {
      await runChecks();
    } catch (error) {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    }
  })();
};

window.__markdownJsonAutoRun();
