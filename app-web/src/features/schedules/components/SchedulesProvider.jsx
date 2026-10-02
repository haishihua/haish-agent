import React from 'react';
import { SchedulesContext, useSchedulesState } from '../hooks/useSchedules.js';
import { schedulesApi } from '../api/schedules.js';
import { ScheduleDialog } from './ScheduleDialog.jsx';
import { runConfigApi } from '../../conversations/api/run-config.js';
import { createRunConfigSync } from '../../conversations/model/run-config-sync.js';

export function SchedulesProvider({ children, ensureConversation, currentConversationId, onRuntimeEvent, onRecover, api = schedulesApi, configApi = runConfigApi, subscribe }) {
  const state = useSchedulesState({ api, subscribe, onRuntimeEvent, onRecover });
  const configSync = React.useMemo(() => createRunConfigSync(configApi), [configApi]);
  const value = { ...state, currentConversationId, configSync };
  return <SchedulesContext.Provider value={value}>
    {children}
    {state.dialog && <ScheduleDialog key={`${state.dialog.mode}:${state.dialog.conversationId}`} state={value} api={api} ensureConversation={ensureConversation} />}
  </SchedulesContext.Provider>;
}
