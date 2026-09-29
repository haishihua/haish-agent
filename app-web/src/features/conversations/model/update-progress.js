const stages = [{ name: 'Check', weight: 0 }, { name: 'Download', weight: 1 }, { name: 'Install', weight: 0 }];

// 进度卡片盖的是「用户点出来的这次更新」整条流程：Check → Download → Install——卡片第一阶段就是
// Check，所以 checking 就要出卡（停在 Check 阶段）。启动那次静默对版本（userInitiated 为假）只喂
// 页脚那行弱提示，不铺卡；not-available / error 这些没有东西在动手的状态也永远不出卡。
export function updateJobProgress(state, { userInitiated = false } = {}) {
  const status = state?.status;
  const checking = status === 'checking' && userInitiated;
  const downloading = status === 'downloading';
  const installing = status === 'downloaded';
  if (!checking && !downloading && !installing) return null;
  const percent = Number.isFinite(state.progressPercent) ? Math.max(0, Math.min(100, state.progressPercent)) : null;
  if (checking) {
    return { title: 'Checking updates', stages, stageIndex: 0, stageProgress: 0, eta: '…', indeterminate: true };
  }
  return {
    title: downloading ? 'Downloading update' : 'Installing update',
    stages,
    stageIndex: downloading ? 1 : 2,
    stageProgress: downloading && percent !== null ? percent / 100 : 0,
    eta: downloading && percent !== null ? `${Math.floor(percent)}%` : '…',
    indeterminate: !downloading || percent === null,
  };
}
