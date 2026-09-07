const stages = [{ name: 'Check', weight: 0 }, { name: 'Download', weight: 1 }, { name: 'Install', weight: 0 }];

export function updateJobProgress(state) {
  if (state?.status === 'not-available') {
    // This confirms the installed version is current, not that an install ran.
    return { title: 'Up to date', stages: [{ name: 'Check', weight: 1 }], stageIndex: 1, stageProgress: 1, eta: 'Done', indeterminate: false };
  }
  if (!['checking', 'downloading', 'downloaded'].includes(state?.status)) return null;
  const downloading = state.status === 'downloading';
  const percent = Number.isFinite(state.progressPercent) ? Math.max(0, Math.min(100, state.progressPercent)) : null;
  return {
    title: state.status === 'checking' ? 'Checking updates' : state.status === 'downloaded' ? 'Installing update' : 'Downloading update',
    stages,
    stageIndex: state.status === 'checking' ? 0 : downloading ? 1 : 2,
    stageProgress: downloading && percent !== null ? percent / 100 : 0,
    eta: downloading && percent !== null ? `${Math.floor(percent)}%` : '…',
    indeterminate: !downloading || percent === null,
  };
}
