import {
  buildWorkspaceStateFromProjects,
  conversationDetailToWorkspaceConversation,
  replaceWorkspaceModeFromProjects,
  workspaceStateWithConversationDetail,
} from '../../conversations/model/workspace-state.js';
import { taskSummaryToRuntimeTask } from '../../../core/task-runtime.js';

// 组合层的绑定：会话目录投影里有任务摘要，面板要的是运行态记录（stream / attempt 都在），
// 所以这里统一预绑 core 的投影函数，调用点不必每次自己传映射。
// 名字收进 runtimeWorkspace，就不会和 conversations 里那些只差一个参数的裸函数混淆。
export const runtimeWorkspace = {
  conversationFromDetail: (detail, previousConversation = null) => (
    conversationDetailToWorkspaceConversation(detail, previousConversation, taskSummaryToRuntimeTask)
  ),
  fromProjects: (projects, previousState) => (
    buildWorkspaceStateFromProjects(projects, previousState, taskSummaryToRuntimeTask)
  ),
  modeFromProjects: (executionMode, projects, previousState, activeDraft = null) => (
    replaceWorkspaceModeFromProjects(executionMode, projects, previousState, taskSummaryToRuntimeTask, activeDraft)
  ),
  withConversationDetail: (state, detail, activate = true) => (
    workspaceStateWithConversationDetail(state, detail, activate, taskSummaryToRuntimeTask)
  ),
};
