import { useEffect } from 'react';
import { applyMemorySettingsPayloadToRecords } from '../../settings/model/settings-payload.js';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';

/**
 * 设置页的 workflow 分区：进入该分区（或设置刷新 epoch 变化）时重读一次工作流目录，
 * 桌面端启动期 Python 侧可能还没就绪，所以要带几次递进重试。
 */
export function useWorkflowSettingsSectionSync({
  settingsMode,
  settingsSection,
  refreshEpoch,
  settingsApiRef,
  runtimeApiRef,
}) {
  useEffect(() => {
    if (!settingsMode || settingsSection !== 'workflow') return undefined;
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await settingsApiRef.current.fetchWorkflowSettingsPayload();
        if (!cancelled) settingsApiRef.current.applyWorkflowSettingsPayload(payload);
      } catch (error) {
        if (cancelled) return;
        if (attempt < 4) {
          retryTimer = window.setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
          return;
        }
        console.warn('failed to fetch workflow settings', error);
        runtimeApiRef.current.showToast?.('error', String(error?.message || error));
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [settingsMode, settingsSection, refreshEpoch, settingsApiRef, runtimeApiRef]);
}

/**
 * 设置页的 memory 分区：进入该分区（或设置刷新 epoch 变化）时把服务端记忆记录合并进草稿。
 */
export function useMemorySettingsSectionSync({
  settingsMode,
  settingsSection,
  refreshEpoch,
  setSettingsRecordsDraft,
}) {
  useEffect(() => {
    if (!settingsMode || settingsSection !== 'memory') return undefined;
    let cancelled = false;
    apiFetch(`${API_BASE}/api/settings/memory`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setSettingsRecordsDraft((prev) => applyMemorySettingsPayloadToRecords(prev, payload));
      })
      .catch((error) => console.warn('failed to fetch memory settings', error));
    return () => { cancelled = true; };
  }, [settingsMode, settingsSection, refreshEpoch, setSettingsRecordsDraft]);
}
