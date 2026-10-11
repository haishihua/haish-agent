import {
  conversationDetailToWorkspaceConversation as mapConversationDetailToWorkspace,
  buildWorkspaceStateFromProjects as buildWorkspaceFromProjects,
  replaceWorkspaceModeFromProjects as replaceWorkspaceModeFromProjectDetails,
  workspaceStateWithConversationDetail as mergeConversationDetailIntoWorkspace,
} from '../../conversations/model/workspace-state.js';
import { taskSummaryToRuntimeTask } from '../../tasks/model/task-runtime.js';

// Bind directory task summaries to the same runtime representation used by the shell.
export const conversationDetailToWorkspaceConversation = (detail, previousConversation = null) => (
  mapConversationDetailToWorkspace(detail, previousConversation, taskSummaryToRuntimeTask)
);
export const buildWorkspaceStateFromProjects = (projects, previousState) => (
  buildWorkspaceFromProjects(projects, previousState, taskSummaryToRuntimeTask)
);
export const replaceWorkspaceModeFromProjects = (executionMode, projects, previousState, activeDraft = null) => (
  replaceWorkspaceModeFromProjectDetails(
    executionMode,
    projects,
    previousState,
    taskSummaryToRuntimeTask,
    activeDraft,
  )
);
export const workspaceStateWithConversationDetail = (state, detail, activate = true) => (
  mergeConversationDetailIntoWorkspace(state, detail, activate, taskSummaryToRuntimeTask)
);
