import React from 'react';
import { LoadingState } from '../../shared/ui/agent-elements/LoadingState.jsx';
import { MetalFxRuntimeKeeper } from '../../shared/ui/MotionEffects.jsx';
import { ResultDialog } from '../../shared/ui/ResultDialog.jsx';
import { SchedulesProvider } from '../schedules/components/SchedulesProvider.jsx';
import { createScheduleBinding } from '../../core/schedule.js';
import { ConversationsPanel } from '../conversations/components/ConversationsPanel.jsx';
import { ChatPanel } from '../chat/components/ChatPanel.jsx';
import { DraftProjectPicker } from '../chat/components/DraftProjectPicker.jsx';
import { ChatComposer } from '../chat/components/ChatComposer.jsx';
import { useAnnotationDraft } from '../chat/hooks/useAnnotationDraft.js';
import { annotationError } from '../chat/model/message-annotations.js';
import { QuoteBlock } from '../../shared/ui/agent-elements/Quote.jsx';
import { petActivityFromWorkflow } from '../../core/pet-state.js';
import { WorkflowRuntimeEntry as WorkflowRuntimePage } from '../workflow/components/WorkflowRuntimeEntry.jsx';
import { nodeRuntimeConfigRequest } from '../../core/node-runtime-config.js';
import { conversationNoticesFromTasks, taskNoticesByTaskId } from '../../core/task-completion-notices.js';
import { TopBar } from './components/TopBar.jsx';
import { BottomNav, TabPlaceholder } from './components/Shell.jsx';
import { AppToastStack } from './components/AppToast.jsx';
import { GoalPreparingPage } from './components/GoalPreparingPage.jsx';
import { latestChatTaskId } from './model/chat-rows.js';
import { isDraftEntrySelected } from '../conversations/model/new-entry.js';

const SettingsPage = React.lazy(() => import('../settings/components/SettingsPage.jsx').then((module) => ({ default: module.SettingsPage })));

/**
 * app shell 的骨架：纯展示组件，状态与回调全部由 AppShell 注入，这里不持有任何
 * state / effect / ref。入参按区域分了六组（schedules / chrome / settings / sidebar /
 * chat / workflow），组件内把每组摊平成局部变量，让下面子组件的 props 绑定与拆分前
 * 逐字一致——源码契约测试按原文断言这些绑定。
 */
export function AppShellView({ schedules, chrome, settings, sidebar, chat, workflow }) {
  const {
    configSync, conversationId, materializeDraftConversationForSend, conversationIdRef, scheduleRuntime,
  } = schedules;
  const {
    viewMode, settingsMode, goalPreparing, activeTab, conversationPanelCollapsed, handleToggleViewMode, handleToggleSettings,
    showToast, setActiveTab, windowFocused, toasts, hollow, setHollow, contextTask, setContextTask,
  } = chrome;
  const {
    settingsSection, setSettingsSection, settingsSelection, setSettingsSelection,
    llmSettingsDraft, setLlmSettingsDraft, settingsRecordsDraft, setSettingsRecordsDraft,
    toolsSettingsState, toolsRefreshRef, agentSettingsDraft, agentSettingsReady,
    setAutomationExpanded, setSkillsExpanded, setAgentSettingsDraft,
    workflowSettingsDraft, setWorkflowSettingsDraft,
    handleSaveSettingsDraft, handleSaveToolsSettingsDraft, handleDeleteLlmProvider, handleToggleLlmProvider,
    handleTogglePresetAgent, handleCreateCustomAgent, handleSaveCustomAgent, handleDeleteCustomAgent,
    handleTogglePresetWorkflow, handleCreateCustomWorkflow, handleSaveCustomWorkflow, handleDeleteCustomWorkflow,
    handleTestLlmConfig, handleTestWebProvider, handleTestSettingsConnection, handleSettingsConnectionDirty,
    settingsConnectionStatus, handleInstallSkillPackage, handleToggleSkill, handleUninstallSkill,
    skillActionBusy, pendingSettingsEditor, setPendingSettingsEditor,
  } = settings;
  const {
    panelActions, visiblePanelWorkspaceState, taskCompletionNotices, currentWorkflowTask, ownerId, activityOpen, setActivityOpen,
    markConversationTaskCompletionsViewed, handleDeleteWorkflowTask, handleRenameProject,
    handleOpenTaskReport, handleRetryTask,
  } = sidebar;
  const {
    ensureServerConversationForActiveDraft, draftConversationRef, pendingEarlierTaskRuntimeIds, switchDraftProject, onAddDraftProject, draftProjectSelectable,
    loadEarlierTaskRuntimes, chatMessages, taskRuntimeState, conversationStopState, conversationRetryPending,
    getRuntime, conversationLoading, currentConversationRunning, currentConversationRunState, petTask, composerDisabled, submitPending,
    handleDeploy, handleGoalCommand, handleStop, handleAttachmentSelect, handleAttachmentClear,
    composerImageDraftsRef, composerAttachment, uploadState, contextUsage, localWorkspace, activeTaskText,
    llmProviderOptions, llmCatalogReady, openAddChatProvider, chatAgentSelection, defaultAgentId, agentLoading, agentState, setAgentRetry,
    runConfigStorageKey, handleForkMessage, getTaskById,
  } = chat;
  const {
    selectedWorkflow, agentOptions, openWorkflowConfig, botNodeConfigs, nodeConfigSelection,
    setViewedWorkflowTask, executeWorkflowNodeRerun, workflowLoading, workflowOptions, defaultWorkflowId,
    setSelectedWorkflowId, botRunConfigStorageKey,
  } = workflow;

  const workflowAnnotationScope = currentWorkflowTask?.taskId ? `workflow:${currentWorkflowTask.taskId}` : '';
  const acknowledgedWorkflowAnnotations = React.useMemo(() => Object.values(taskRuntimeState?.tasksById || {})
    .filter((task) => task?.runtimeHydrated && task?.annotations?.length)
    .map((task) => ({ role: 'user', messageId: task.taskId, annotations: task.annotations })), [taskRuntimeState]);
  const { items: workflowAnnotations, update: updateWorkflowAnnotations } = useAnnotationDraft(workflowAnnotationScope, acknowledgedWorkflowAnnotations);
  const saveWorkflowAnnotation = (item) => {
    const error = annotationError([...workflowAnnotations.filter((draft) => draft.id !== item.id), item]);
    if (error) { showToast?.('warn', error); return false; }
    updateWorkflowAnnotations((drafts) => [...drafts.filter((draft) => draft.id !== item.id), item]);
    return true;
  };

  const draftProjectSelector = activityOpen && draftConversationRef.current?.id === conversationId
    && !draftConversationRef.current?.serverCreated ? <DraftProjectPicker
      projects={visiblePanelWorkspaceState.projects.filter((project) => project.executionMode === 'chat')}
      selectedId={draftConversationRef.current.projectId} onSelect={switchDraftProject}
      onAddProject={onAddDraftProject} disabled={!draftProjectSelectable || submitPending || uploadState.active} /> : null;

  return (
    <SchedulesProvider configSync={configSync} currentConversationId={conversationId} ensureConversation={createScheduleBinding(materializeDraftConversationForSend, conversationIdRef)} onRuntimeEvent={scheduleRuntime.event} onRecover={scheduleRuntime.recover}>
    <div className="app-shell">
      <MetalFxRuntimeKeeper />
      <TopBar
        viewMode={viewMode}
        onToggleViewMode={() => {
          try {
            handleToggleViewMode();
          } catch (error) {
            showToast('error', String(error?.message || error));
          }
        }}
        settingsActive={settingsMode}
        onToggleSettings={handleToggleSettings}
      />
      <div className={`app-body ${settingsMode ? 'settings-mode' : viewMode === 'chat' ? 'chat-mode' : 'workflow-mode'} ${!settingsMode && conversationPanelCollapsed ? 'conversations-collapsed' : ''}`}>
        {goalPreparing ? <GoalPreparingPage /> : null}
        {settingsMode ? (
          <React.Suspense fallback={<div className="app-body-loading"><LoadingState role="status" label="Loading settings…" /></div>}>
          <SettingsPage
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            selectionBySection={settingsSelection}
            onSelectionChange={setSettingsSelection}
            llmDraft={llmSettingsDraft}
            onLlmDraftChange={setLlmSettingsDraft}
            records={settingsRecordsDraft}
            toolsSettingsState={toolsSettingsState}
            onRefreshTools={() => toolsRefreshRef.current?.()}
            onRecordsChange={setSettingsRecordsDraft}
            agentSettings={agentSettingsDraft}
            agentSettingsLoading={!agentSettingsReady}
            onAutomationExpandedChange={setAutomationExpanded}
            onSkillsExpandedChange={setSkillsExpanded}
            onAgentSettingsChange={setAgentSettingsDraft}
            workflowSettings={workflowSettingsDraft}
            onWorkflowSettingsChange={setWorkflowSettingsDraft}
            onSave={handleSaveSettingsDraft}
            onSaveTools={handleSaveToolsSettingsDraft} onToast={showToast}
            onDeleteLlmProvider={handleDeleteLlmProvider}
            onToggleLlmProvider={handleToggleLlmProvider}
            onTogglePresetAgent={handleTogglePresetAgent}
            onCreateCustomAgent={handleCreateCustomAgent}
            onSaveCustomAgent={handleSaveCustomAgent}
            onDeleteCustomAgent={handleDeleteCustomAgent}
            onTogglePresetWorkflow={handleTogglePresetWorkflow}
            onCreateCustomWorkflow={handleCreateCustomWorkflow}
            onSaveCustomWorkflow={handleSaveCustomWorkflow}
            onDeleteCustomWorkflow={handleDeleteCustomWorkflow}
            onTestLlmConfig={handleTestLlmConfig}
            onTestWebProvider={handleTestWebProvider}
            onTestSettingsConnection={handleTestSettingsConnection}
            onSettingsConnectionDirty={handleSettingsConnectionDirty}
            settingsConnectionStatus={settingsConnectionStatus}
            onInstallSkill={handleInstallSkillPackage}
            onToggleSkill={handleToggleSkill}
            onUninstallSkill={handleUninstallSkill}
            skillActionBusy={skillActionBusy}
            openEditorRequest={pendingSettingsEditor}
            onOpenEditorRequestConsumed={() => setPendingSettingsEditor(null)}
          />
          </React.Suspense>
        ) : activeTab === 'dashboard' ? (
          <>
            <ConversationsPanel
              {...panelActions}
              workspaceState={visiblePanelWorkspaceState}
              terminalNotices={conversationNoticesFromTasks(taskCompletionNotices)}
              taskTerminalNotices={taskNoticesByTaskId(taskCompletionNotices)}
              activityNotices={taskCompletionNotices}
              activityOwnerId={ownerId}
              activityOpen={activityOpen}
              onActivityOpenChange={setActivityOpen}
              isDraftSelected={isDraftEntrySelected(draftConversationRef.current, conversationId, viewMode === 'chat' ? 'chat' : 'bot')}
              onSelectActivity={panelActions.onSelectActivity}
              windowFocused={windowFocused}
              acknowledgeActiveConversation={viewMode === 'chat'}
              onViewConversationCompletions={markConversationTaskCompletionsViewed}
              collapsed={conversationPanelCollapsed}
              onToast={showToast}
              showTaskRecords={viewMode === 'chat'}
              workflowTaskMode={viewMode !== 'chat'}
              activeTaskId={currentWorkflowTask?.taskId || currentWorkflowTask?.id || null}
              onDeleteTask={handleDeleteWorkflowTask}
              onRenameProject={handleRenameProject}
              onOpenTaskReport={handleOpenTaskReport}
              onRetryTask={(task) => handleRetryTask(task)}
            />
            {viewMode === 'chat' ? (
              <div className="app-chat-stage">
                <div className="app-chat-main">
	                  <ChatPanel
                        draftProjectSelector={draftProjectSelector}
	                    conversationId={conversationId}
                        approvalDraft={Boolean(draftConversationRef.current && !draftConversationRef.current.serverCreated)}
                        ensureApprovalConversation={ensureServerConversationForActiveDraft}
	                    earlierTaskRuntimesPending={pendingEarlierTaskRuntimeIds.length > 0}
                        earlierTaskRuntimeIds={pendingEarlierTaskRuntimeIds}
	                    onLoadEarlierTasks={loadEarlierTaskRuntimes}
	                    composerScopeId={draftConversationRef.current?.id === conversationId ? draftConversationRef.current.composerScopeId : conversationId}
	                    messages={chatMessages} latestTaskId={latestChatTaskId(taskRuntimeState)}
                        taskActionsPending={Boolean(conversationStopState.pending || conversationStopState.error || conversationRetryPending)} stopError={conversationStopState.error}
                        retryPendingTaskId={conversationRetryPending ? getRuntime(conversationId)?.pendingRetry?.sourceTaskId : null}
	                    loading={conversationLoading}
	                    running={currentConversationRunning}
                        petRunState={currentConversationRunState.state}
                        petTask={petTask}
	                    disabled={composerDisabled}
	                    submitPending={submitPending}
	                    onSend={handleDeploy}
                    onGoalCommand={handleGoalCommand}
                    onToast={showToast}
                    onStop={handleStop}
                    onSelectFile={(file, selectedAgentId) => { handleAttachmentSelect(file, selectedAgentId, 'chat').catch((error) => console.error('attachment upload failed', error)); }}
                    onClearFile={handleAttachmentClear}
                    imageDrafts={composerImageDraftsRef.current}
                    attachment={composerAttachment}
                    uploading={uploadState.active}
                    contextUsage={contextUsage}
                    workspacePath={localWorkspace.path}
                    homePath={window.haish?.homePath || ''}
                    activeTaskText={activeTaskText}
                    providerOptions={llmProviderOptions}
                    showAddProvider={llmCatalogReady && llmProviderOptions.length === 0}
                    onAddProvider={openAddChatProvider}
                    {...chatAgentSelection}
                    defaultAgentId={defaultAgentId}
                    agentLoading={agentLoading}
                    agentError={agentState.error}
                    onAgentRetry={() => setAgentRetry((attempt) => attempt + 1)}
                    selectionStorageKey={runConfigStorageKey}
                    onForkMessage={handleForkMessage}
                    onEditMessage={(taskId, text, runConfig) => handleRetryTask(getTaskById(taskId, conversationId), text, runConfig)}
                    onRetryTask={(taskId, runConfig) => {
                      const pendingTask = taskRuntimeState.pendingTask;
                      const pendingTaskId = pendingTask?.taskId || pendingTask?.id;
                      return handleRetryTask(
                        getTaskById(taskId, conversationId)
                        || (pendingTaskId === taskId ? pendingTask : null),
                        null,
                        runConfig,
                      );
                    }}
		                  />
	                </div>
	              </div>
	            ) : (
	              <div className="app-workflow-stage">
                  <WorkflowRuntimePage
                    loading={conversationLoading}
                    workflow={selectedWorkflow}
                    task={currentWorkflowTask}
                    agentOptions={agentOptions}
                    onOpenConfig={openWorkflowConfig}
                    annotationDrafts={workflowAnnotations}
                    onSaveAnnotation={saveWorkflowAnnotation}
                    onAnnotationError={(error) => { if (error) showToast?.('warn', error); }}
                    {...{ providerOptions: llmProviderOptions, nodeRuntimeConfigs: currentConversationRunning ? (currentWorkflowTask?.nodeRuntimeConfigs || {}) : botNodeConfigs, onNodeRuntimeConfigChange: nodeConfigSelection.change, configReadOnly: currentConversationRunning || submitPending }}
                    onRetry={(nodeId) => {
                      if (!currentWorkflowTask) return;
                      setViewedWorkflowTask(null);
                      executeWorkflowNodeRerun(currentWorkflowTask, nodeId, ['agent', 'llm'].includes(selectedWorkflow?.nodes?.find((node) => node.id === nodeId)?.type) ? nodeRuntimeConfigRequest(botNodeConfigs[nodeId], llmProviderOptions) : null).catch((error) => {
                        console.error('workflow node rerun failed', error);
                        showToast('error', String(error?.message || error));
                      });
                    }}
                    composer={<ChatComposer
                      conversationId={conversationId}
                      approvalDraft={Boolean(draftConversationRef.current && !draftConversationRef.current.serverCreated)}
                      ensureApprovalConversation={ensureServerConversationForActiveDraft}
                      executionMode="bot"
                      onToast={showToast}
                      scheduleNodeRuntimeConfigs={nodeConfigSelection.conversationConfigs} onRestoreNodeConfigs={nodeConfigSelection.restore}
                      scopeId={draftConversationRef.current?.id === conversationId ? draftConversationRef.current.composerScopeId : conversationId}
                      onSend={(...args) => handleDeploy(...args.slice(0, 9), args[9] ?? botNodeConfigs)}
                      pendingCommentCount={workflowAnnotations.length}
                      prepareSubmit={(text) => ({ error: annotationError(workflowAnnotations, text), annotations: workflowAnnotations })}
                      beforeInput={workflowAnnotations.length ? <div className="haish-annotation-drafts" aria-label="Comment drafts">
                        {workflowAnnotations.map((item, index) => <QuoteBlock key={item.id} item={item} index={index + 1} preview
                          onRemove={() => updateWorkflowAnnotations((drafts) => drafts.filter((draft) => draft.id !== item.id))} />)}
                      </div> : null}
                      onStop={handleStop}
                      activeTaskText={activeTaskText}
                      petRunState={currentConversationRunState.state}
                      petActivityState={petActivityFromWorkflow(petTask, currentConversationRunState.state)}
                      petTask={petTask}
                      running={currentConversationRunning}
                      disabled={composerDisabled}
                      submitPending={submitPending} stopError={conversationStopState.error}
                      idlePlaceholder="Describe the task you want to delegate..."
                      disabledPlaceholder="Agents are currently busy executing..."
                      imageStore={composerImageDraftsRef.current}
                      allowRuntimeInput
                      attachment={composerAttachment}
                      contextTask={contextTask}
                      onClearContextTask={() => setContextTask(null)}
                      uploading={uploadState.active}
                      onSelectFile={(file, selectedWorkflowId) => { handleAttachmentSelect(file, selectedWorkflowId, 'bot').catch((error) => console.error('attachment upload failed', error)); }}
                      onClearFile={handleAttachmentClear}
                      providerOptions={llmProviderOptions}
                      agentOptions={workflowOptions}
                      defaultAgentId={defaultWorkflowId}
                      agentLoading={workflowLoading}
                      selectionStorageKey={botRunConfigStorageKey}
                      onAgentChange={setSelectedWorkflowId}
                      contextUsage={contextUsage}
                    />}
                  />
	              </div>
            )}
          </>
        ) : (
          <div className="app-tab-stage">
            <div className="app-tab-main">
              <TabPlaceholder name={activeTab} />
            </div>
            <BottomNav active={activeTab} onChange={setActiveTab} />
          </div>
        )}
      </div>

      <AppToastStack toasts={toasts} />

      <ResultDialog open={!!hollow} title={hollow?.title} result={hollow?.result} onClose={() => setHollow(null)}
        onUseAsContext={hollow?.contextSource
          ? () => { setContextTask(hollow.contextSource); setHollow(null); }
          : undefined} />
    </div></SchedulesProvider>
  );
}
