import { GOAL_WORKFLOW_ID, matchingWorkflowProject } from '../../chat/model/goal-command.js';
import { executionConfigError } from '../../workflow/model/execution-config.js';
import { nodeRuntimeConfigsForWorkflow } from '../../workflow/model/node-runtime-config.js';

// Explicit routing: never infer the destination from the currently displayed
// mode after an await, or let /goal become a chat steering instruction.
export function createGoalCommandHandler(ctx) {
  return async function handleGoalCommand({ prompt, attachment = null, images = [], runConfig = {} }) {
    const {
      API_BASE, apiFetch, buildApiHeaders, workspaceState, conversationIdRef,
      viewModeRef, draftConversationRef, workflowSettingsDraft, workflowById,
      invalidateConversationActivation, isConversationActivationCurrent,
      replaceWorkspaceModeFromProjects, normalizeWorkspaceOrdering, setWorkspaceState,
      createConversationInProject, activateConversationDetail, buildDeployRequest,
      startDeploy, setViewMode, setSelectedWorkflowId, modeLocationRef, showToast,
    } = ctx;
    const sourceId = conversationIdRef.current;
    const source = workspaceState.projects.find((project) => project.id === (
      draftConversationRef.current?.projectId || workspaceState.activeProjectId
    ));
    if (viewModeRef.current !== 'chat' || source?.executionMode !== 'chat') return false;
    const workflow = workflowById(workflowSettingsDraft, GOAL_WORKFLOW_ID);
    if (!workflow || workflow.enabled === false || workflow.executable === false) {
      showToast('error', 'Goal Loop is unavailable. Check the workflow settings and try again.');
      return false;
    }
    // Snapshot attachments and task context before navigating away from Chat.
    if (attachment && !attachment.file) {
      showToast('error', 'Reattach the document before sending it to a new Workflow task.');
      return false;
    }
    const workflowAttachment = attachment ? { ...attachment, uploaded: false } : null;
    // Capture the source composer's selection before any asynchronous navigation.
    // Only model fields cross this boundary; never copy credentials or Agent identity.
    const sourceConfig = Object.fromEntries(['provider', 'model_id', 'reasoning_effort']
      .filter((field) => typeof runConfig[field] === 'string' && runConfig[field].trim())
      .map((field) => [field, runConfig[field].trim()]));
    if (Object.hasOwn(runConfig, 'reasoning_effort')) sourceConfig.reasoning_effort = runConfig.reasoning_effort ?? null;
    if (!sourceConfig.provider) delete sourceConfig.model_id;
    const nodeRuntimeConfigs = nodeRuntimeConfigsForWorkflow(workflow, Object.fromEntries(
      (workflow.nodes || []).map((node) => [node.id, { ...sourceConfig }]),
    ), ctx.providerOptions || []);
    if (prompt) {
      const error = executionConfigError({ executionMode: 'bot', workflow, nodeRuntimeConfigs, providerOptions: ctx.providerOptions || [] });
      if (error) { showToast('error', error); return false; }
    }
    const request = buildDeployRequest(prompt, workflowAttachment, null, null, images, GOAL_WORKFLOW_ID, null, prompt, [], nodeRuntimeConfigs);
    Object.assign(request, { executionMode: 'bot', workflowId: GOAL_WORKFLOW_ID, agentId: null });
    const activationSeq = invalidateConversationActivation();
    const isCurrent = () => isConversationActivationCurrent(activationSeq)
      && conversationIdRef.current === sourceId && viewModeRef.current === 'chat';
    async function call(path, options = {}) {
      const response = await apiFetch(`${API_BASE}${path}`, { ...options, headers: buildApiHeaders() });
      if (!response.ok) throw new Error(`Goal Loop preparation failed: ${response.status}`);
      return response.json();
    }
    try {
      // Consult the server, not a possibly stale Workflow sidebar cache.
      let { projects = [] } = await call('/api/projects?execution_mode=bot');
      if (!isCurrent()) return false;
      let target = matchingWorkflowProject(projects, source);
      if (!target) {
        if (!source.workspacePath) throw new Error('The default Workflow project is unavailable.');
        target = await call('/api/projects', { method: 'POST', body: JSON.stringify({
          name: source.name, workspace_path: source.workspacePath, execution_mode: 'bot',
        }) });
        projects = [target, ...projects.filter((project) => project.project_id !== target.project_id)];
      }
      if (!isCurrent()) return false;
      setWorkspaceState((state) => replaceWorkspaceModeFromProjects('bot', projects, state));
      // One Workflow task gets its own conversation; never reuse an active run.
      const detail = await createConversationInProject({
        id: target.project_id, executionMode: 'bot', workspacePath: target.workspace_path,
      }, undefined, 'bot');
      if (!isCurrent()) return false;
      await call(`/api/conversations/${encodeURIComponent(detail.conversation_id)}/run-config`, {
        method: 'PUT', body: JSON.stringify({
          execution_mode: 'bot', workflow_id: GOAL_WORKFLOW_ID, use_history: true,
          node_runtime_configs: nodeRuntimeConfigs,
        }),
      });
      if (!isCurrent()) return false;
      modeLocationRef.current.chat = { projectId: source.id, conversationId: sourceId };
      modeLocationRef.current.workflow = { projectId: target.project_id, conversationId: detail.conversation_id };
      await activateConversationDetail(detail, { restoreLatest: false, activationSeq });
      if (!isConversationActivationCurrent(activationSeq)) return false;
      viewModeRef.current = 'workflow';
      setViewMode('workflow');
      setSelectedWorkflowId(GOAL_WORKFLOW_ID);
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state, projects: state.projects.map((project) => project.id === target.project_id
          ? { ...project, userExpanded: true, workflowTasksExpanded: true } : project),
      }));
      if (prompt) {
        request.targetConversationId = detail.conversation_id;
        startDeploy(request, detail.conversation_id, detail);
      }
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  };
}
