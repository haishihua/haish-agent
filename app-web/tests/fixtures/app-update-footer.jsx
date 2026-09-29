// 更新页脚（左栏底部那颗更新入口）的状态页。
//
// 背景：这里过去只有一种长相——一个按钮，所有状态都长成按钮：装好之后看到的是灰掉的大按钮
// （"Updates unavailable"），「已是最新」还要铺一张三阶段的进度卡。要的是：装好之后它只是个弱提示，
// 顺手把版本号写出来；只有真的不是最新版本，才给一个 update 入口。
//
// 断言：
//   1. 开发版 / 浏览器里没有桌面 API：弱提示（is-quiet：框还在——跟入口按钮同一圈边框，但没有底色，带版本号），
//      点了不做事，也不是按钮的长相；
//   2. 已是最新：弱提示写 `vX · Up to date`，不铺进度卡，点一下能重新对版本（这一次弹 toast）；
//   3. 有新版本 / 装失败但包还在本机：长出真按钮（Update to vX / Retry install），点了就走更新；
//   4. 装好后启动会自己安静地对一次版本（1.5 秒后、只更新那行字、不弹 toast、也不铺卡）；
//   5. 用户点的那次更新全程都是一张灰卡：Check → Download → Install（checking 就出卡、停在 Check——
//      卡片本来就会含这一步），没点过的静默检查仍然只是那一行字；两种形态同高、行顶不动；
//   6. 弱提示是居中的状态行（文字中心 = 页脚中心）且字体跟应用正文统一（`--conversation-font`）。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppUpdateFooter } from '../../src/features/conversations/components/AppUpdateFooter.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) =>
  window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`),
);

const report = document.getElementById('checks');
const lines = [];
const failures = [];
const log = (line) => {
  lines.push(line);
  report.textContent = lines.join('\n');
};
function check(condition, name) {
  log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
}

const tick = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const VERSION = '0.0.22';
const NEXT = { currentVersion: VERSION, isPackaged: true };
// 进度卡当前停在哪一个阶段（Check / Download / Install）。
const currentStage = (host) =>
  [...host.querySelectorAll('.haish-job-progress-stages span')].find((element) =>
    element.classList.contains('is-current'),
  )?.textContent || '';

function createFakeDesktop(initialState, options = {}) {
  const calls = { get: 0, check: 0, apply: 0, download: 0, install: 0 };
  const listeners = new Set();
  let current = initialState;
  const setState = (next) => {
    current = next;
    listeners.forEach((listener) => listener(next));
    return next;
  };
  window.haish = {
    getAppUpdateState: () => {
      calls.get += 1;
      return Promise.resolve(current);
    },
    checkForAppUpdates: async () => {
      calls.check += 1;
      return options.onCheck ? options.onCheck(current) : current;
    },
    downloadAppUpdate: async () => {
      calls.download += 1;
      return options.onDownload ? options.onDownload(current) : current;
    },
    installAppUpdate: async () => {
      calls.install += 1;
      return current;
    },
    applyLatestAppUpdate: async () => {
      calls.apply += 1;
      return options.onApply ? options.onApply(current) : current;
    },
    onAppUpdateStateChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { calls, setState, state: () => current };
}

function mountFooter(label) {
  const host = document.createElement('div');
  document.getElementById('stacks').appendChild(host);
  const root = createRoot(host);
  const toasts = [];
  // 标签也交给 React 渲染（createRoot 挂载时会清空容器里已有的子节点）。
  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <div className="sidebar">
          <div className="sidebar-label">{label}</div>
          <AppUpdateFooter onToast={(kind, text) => toasts.push({ kind, text })} />
        </div>
      </AppTooltipProvider>,
    );
  });
  return {
    host,
    toasts,
    row: () => host.querySelector('.app-update-button'),
    text: () => host.querySelector('.app-update-button span')?.textContent || '',
    rect: () => host.querySelector('.app-update-button').getBoundingClientRect(),
    unmount: () => root.unmount(),
  };
}

async function main() {
  log('—— 1. 开发版：一行弱提示，不是大按钮 ——');
  {
    const harness = createFakeDesktop({
      status: 'unsupported',
      currentVersion: VERSION,
      canInstall: false,
      isPackaged: false,
      message: 'Only in installed builds',
    });
    const mount = mountFooter('dev build');
    await tick(60);
    check(mount.text() === `v${VERSION} · Dev build`, `开发版只是安静的一行字（「${mount.text()}」）`);
    check(mount.row().classList.contains('is-quiet'), '带 is-quiet：这行是弱提示，不是灰按钮');
    const quietStyle = getComputedStyle(mount.row());
    check(
      quietStyle.borderTopStyle === 'solid' && quietStyle.borderTopColor !== 'rgba(0, 0, 0, 0)',
      `盒子还在：弱提示也是那一圈框（${quietStyle.borderTopWidth} ${quietStyle.borderTopStyle} ${quietStyle.borderTopColor}）`,
    );
    check(
      quietStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
      `只是没有底色（background-color: ${quietStyle.backgroundColor}）`,
    );
    check(mount.row().getAttribute('aria-disabled') === 'true', '这行点不动（开发版没有更新通道）');
    check(!mount.row().querySelector('svg'), '连图标都不给，纯文字弱提示');
    check(
      String(mount.row().getAttribute('aria-label') || '').includes('installed builds'),
      `悬停说明写清原因（「${mount.row().getAttribute('aria-label')}」）`,
    );
    mount.row().click();
    await tick(60);
    check(harness.calls.check === 0 && harness.calls.apply === 0, '点了不会去查版本、也不会去装');
    check(mount.toasts.length === 0, '也不会弹提示');
    mount.unmount();
  }

  log('—— 2. 浏览器（没有桌面 API）：同样的弱提示，不再是大灰按钮 ——');
  {
    delete window.haish;
    const mount = mountFooter('no desktop api');
    await tick(60);
    check(mount.text() === 'Updates unavailable', `没有更新通道时也只是一行灰字（「${mount.text()}」）`);
    check(mount.row().classList.contains('is-quiet'), 'is-quiet：这行不是按钮');
    check(mount.row().getAttribute('aria-disabled') === 'true', '点不动');
    mount.unmount();
  }

  log('—— 3. 已是最新：写清版本，不铺进度卡，点一下重新对版本 ——');
  {
    const upToDate = { status: 'not-available', ...NEXT, availableVersion: VERSION, canInstall: false };
    const harness = createFakeDesktop(upToDate, { onApply: () => upToDate });
    const mount = mountFooter('up to date');
    await tick(60);
    check(mount.text() === `v${VERSION} · Up to date`, `弱提示带版本号（「${mount.text()}」）`);
    check(mount.row().classList.contains('is-quiet'), '已是最新就只是一行字，不是按钮');
    check(!mount.host.querySelector('.haish-job-progress'), '不再为「已是最新」铺一张进度卡');
    check(mount.row().getAttribute('data-actionable') === 'true', '这行仍然能点：重新对一次版本');
    mount.row().click();
    await tick(60);
    check(harness.calls.apply === 1, '点了确实去对了版本');
    check(
      mount.toasts.some((item) => item.kind === 'success' && item.text.includes('Up to date')),
      `用户点了才弹 toast（${JSON.stringify(mount.toasts)}）`,
    );
    mount.unmount();
  }

  log('—— 4. 装好之后启动：自己安静地对一次版本（有新版才有入口）——');
  {
    let harness;
    harness = createFakeDesktop(
      { status: 'idle', ...NEXT, canInstall: false },
      {
        onCheck: () =>
          harness.setState({ status: 'available', ...NEXT, availableVersion: '0.0.23', canInstall: false }),
      },
    );
    const mount = mountFooter('installed build · launch');
    await tick(80);
    check(mount.text() === `v${VERSION} · Check for updates`, `还没查过时先写清版本（「${mount.text()}」）`);
    check(harness.calls.check === 0, '挂上就先不查（推迟 1.5 秒，别和启动请求挤在一起）');
    await tick(1700);
    check(harness.calls.check === 1, `启动后自己对了 1 次版本（${harness.calls.check} 次）`);
    check(mount.toasts.length === 0, '这次检查不弹 toast：结果只进那行弱提示');
    check(mount.text() === 'Update to v0.0.23', `查到新版本就自己长出入口（「${mount.text()}」）`);
    check(!mount.row().classList.contains('is-quiet'), '入口是按钮的长相');
    mount.unmount();
  }

  log('—— 5. 启动那次静默对版本：还是一行字 + 小转圈，不铺卡 ——');
  {
    // 这里模拟「没人点过、后台自己在对版本」的那种 checking（userInitiated 为假）：
    // 弱提示就够了，不该突然弹一张三阶段卡出来。
    const harness = createFakeDesktop({ status: 'checking', ...NEXT, canInstall: false });
    const mount = mountFooter('silent checking');
    await tick(60);
    check(mount.text() === `v${VERSION} · Checking…`, `静默检查也只是那行字（「${mount.text()}」）`);
    check(mount.row().classList.contains('is-quiet'), '还是 is-quiet');
    check(Boolean(mount.row().querySelector('svg.update-icon.is-loading')), '带一颗在转的小图标');
    check(!mount.host.querySelector('.haish-job-progress'), '静默对版本不铺灰卡（后台看一眼，不打扰）');
    check(mount.row().getAttribute('aria-disabled') === 'true' && harness.calls.apply === 0, '点不动：不会重复发检查');
    mount.unmount();
  }

  log('—— 6. 点了更新入口：灰卡从 Check 一路走到 Install（同一张卡）——');
  {
    let harness;
    harness = createFakeDesktop(
      { status: 'available', ...NEXT, availableVersion: '0.0.23', canInstall: false },
      {
        onApply: async () => {
          // 用户点出来的就是 check → download → install 一条流程：卡片本身就含 Check 这一步，
          // 所以点完一广播 checking 就该切出卡、先去 Check 阶段停着。
          harness.setState({ status: 'checking', ...NEXT, availableVersion: '0.0.23', canInstall: false });
          await tick(150);
          harness.setState({
            status: 'downloading',
            ...NEXT,
            availableVersion: '0.0.23',
            progressPercent: 42,
            canInstall: false,
          });
          await tick(150);
          return harness.setState({
            status: 'downloaded',
            ...NEXT,
            availableVersion: '0.0.23',
            progressPercent: 100,
            canInstall: true,
          });
        },
      },
    );
    const mount = mountFooter('update run');
    await tick(60);
    check(mount.text() === 'Update to v0.0.23', `入口写着要升到哪一版（「${mount.text()}」）`);
    check(!mount.row().classList.contains('is-quiet'), '有更新时它是真按钮');
    check(Boolean(mount.row().querySelector('svg.update-icon')), '按钮带一颗更新图标');
    check(mount.row().getAttribute('aria-disabled') === null, '入口可点');
    mount.row().click();
    await tick(60);
    const card = mount.host.querySelector('.haish-job-progress');
    check(Boolean(card), '点完立刻切出灰卡（用户点的这次更新是一条 Check → Download → Install 的流程）');
    check(currentStage(mount.host) === 'Check', `先停在 Check 阶段（当前「${currentStage(mount.host)}」）`);
    check(
      mount.host.querySelector('.haish-job-progress-title')?.textContent === 'Checking updates',
      `卡上写着在检查（「${mount.host.querySelector('.haish-job-progress-title')?.textContent}」）`,
    );
    check(!mount.host.querySelector('.app-update-button'), '灰卡接手后不再留第二个入口');
    check(mount.toasts.length === 0, '检查阶段不弹提示');
    await tick(150);
    check(currentStage(mount.host) === 'Download', `对完版本自动走到 Download（当前「${currentStage(mount.host)}」）`);
    check(
      mount.host.querySelector('.haish-job-progress-value')?.textContent === '42%',
      `进度是真的（${mount.host.querySelector('.haish-job-progress-value')?.textContent}）`,
    );
    await tick(150);
    check(currentStage(mount.host) === 'Install', `装的时候停在 Install（当前「${currentStage(mount.host)}」）`);
    check(mount.host.querySelector('.haish-job-progress') === card, '全程就这一张卡：元素没换过');
    check(harness.calls.apply === 1, '点了就去更新');
    check(
      mount.toasts.some((item) => item.kind === 'info' && item.text.includes('Installing v0.0.23')),
      `装的时候弹一次提示（${JSON.stringify(mount.toasts)}）`,
    );
    mount.unmount();
  }

  log('—— 7. 装失败但包还在本机：入口变成「重试安装」 ——');
  {
    const harness = createFakeDesktop(
      { status: 'error', ...NEXT, canInstall: true, message: 'Install stalled · try again' },
      {
        onApply: () => ({
          status: 'downloaded',
          ...NEXT,
          availableVersion: '0.0.23',
          canInstall: true,
          progressPercent: 100,
        }),
      },
    );
    const mount = mountFooter('install retryable');
    await tick(60);
    check(mount.text() === 'Retry install', `入口是重试安装（「${mount.text()}」）`);
    check(!mount.row().classList.contains('is-quiet') && mount.row().classList.contains('is-error'), '错误色的真按钮');
    mount.row().click();
    await tick(80);
    check(harness.calls.apply === 1, '点了就重试');
    mount.unmount();
  }

  log('—— 8. 检查失败：回到弱提示（写清原因），点一下再试 ——');
  {
    const harness = createFakeDesktop(
      { status: 'error', ...NEXT, canInstall: false, message: 'Network error' },
      {
        onApply: () => ({ status: 'error', ...NEXT, canInstall: false, message: 'Network error' }),
      },
    );
    const mount = mountFooter('check failed');
    await tick(60);
    check(mount.text() === `v${VERSION} · Network error`, `失败原因写在那行字里（「${mount.text()}」）`);
    check(mount.row().classList.contains('is-quiet'), '失败也不是大按钮：是那行弱提示');
    mount.row().click();
    await tick(60);
    check(harness.calls.apply === 1, '点了会再试一次');
    check(
      mount.toasts.some((item) => item.kind === 'error'),
      `这次失败弹一次错误提示（${JSON.stringify(mount.toasts)}）`,
    );
    mount.unmount();
  }

  log('—— 9. 两种形态同一个元素、同一个高度：上面的列表不跳 ——');
  {
    let harness;
    harness = createFakeDesktop({ status: 'not-available', ...NEXT, availableVersion: VERSION, canInstall: false });
    const mount = mountFooter('same row, two skins');
    await tick(60);
    const row = mount.row();
    const quietRect = mount.rect();
    harness.setState({ status: 'available', ...NEXT, availableVersion: '0.0.23', canInstall: false });
    await tick(80);
    const entryRect = mount.rect();
    check(mount.row() === row, '换状态没换元素（同一个 DOM 节点换长相）');
    check(
      Math.abs(entryRect.height - quietRect.height) < 0.5,
      `两种形态同高（${quietRect.height} → ${entryRect.height}）`,
    );
    check(Math.abs(entryRect.top - quietRect.top) < 0.5, '行顶不动：上面的对话列表不跳');
    mount.unmount();
  }

  log('—— 10. 弱提示是居中的状态行：文字居中 + 应用统一字体 ——');
  {
    createFakeDesktop({ status: 'unsupported', currentVersion: VERSION, canInstall: false, isPackaged: false });
    const mount = mountFooter('centered hint');
    await tick(60);
    const row = mount.row();
    const rowRect = mount.rect();
    const spanRect = row.querySelector('span').getBoundingClientRect();
    const style = getComputedStyle(row);
    check(style.justifyContent === 'center', `弱提示居中（justify-content: ${style.justifyContent}）`);
    const offset = spanRect.left + spanRect.width / 2 - (rowRect.left + rowRect.width / 2);
    check(Math.abs(offset) <= 1, `文字中心 = 页脚中心（差 ${offset.toFixed(2)}px）`);
    check(
      style.fontVariantNumeric.includes('tabular-nums'),
      `版本号数字等宽（font-variant-numeric: ${style.fontVariantNumeric}）`,
    );
    check(
      style.fontFamily.includes('LXGW WenKai Screen'),
      `状态行跟应用同一套字体（${style.fontFamily.slice(0, 42)}…）`,
    );
    mount.unmount();
  }

  delete window.haish;
  check(window.__pageErrors.length === 0, `页面无报错（${window.__pageErrors.join(' | ') || 'none'}）`);

  report.dataset.result = failures.length ? 'FAIL' : 'PASS';
  log(
    failures.length
      ? `✗ ${failures.length} 项不一致`
      : 'ALL PASS — 装好之后只是一行弱提示（版本 + 状态），只有不是最新版本才长出入口',
  );
  window.__updateFooterChecks = { failures, lines };
}

main().catch((error) => {
  report.dataset.result = 'FAIL';
  log(`FAIL 页面脚本抛错：${error?.stack || error}`);
});
