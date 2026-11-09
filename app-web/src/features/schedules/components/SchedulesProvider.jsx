import React from 'react';
import { SchedulesContext, useSchedulesState } from '../hooks/useSchedules.js';
import { schedulesApi } from '../api/schedules.js';
import { ScheduleDialog } from './ScheduleDialog.jsx';
import { runConfigApi } from '../../../core/run-config.js';
import { createRunConfigSync } from '../../../core/run-config-sync.js';

export function SchedulesProvider({ children, ensureConversation, currentConversationId, onRuntimeEvent, onRecover, api = schedulesApi, configApi = runConfigApi, configSync: suppliedConfigSync, subscribe }) {
  const state = useSchedulesState({ api, subscribe, onRuntimeEvent, onRecover });
  const localConfigSync = React.useMemo(() => createRunConfigSync(configApi), [configApi]);
  const configSync = suppliedConfigSync || localConfigSync;
  // context value 稳定化：避免父组件每次渲染（如今外部还有流式重渲染）都让所有
  // 消费者（每个会话行、composer）跟着重渲染。state 的各字段引用不变时 value 不变。
  const value = React.useMemo(() => ({ ...state, currentConversationId, configSync }),
    [state, currentConversationId, configSync]);
  return <SchedulesContext.Provider value={value}>
    {children}
    {state.dialog && <ScheduleDialog key={`${state.dialog.mode}:${state.dialog.conversationId}`} state={value} api={api} ensureConversation={ensureConversation} />}
  </SchedulesContext.Provider>;
}
