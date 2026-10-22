import React from 'react';
import { ModelPicker } from '../ModelPickers.jsx';
import { WorkflowPicker } from '../WorkflowPicker.jsx';

/**
 * 模型 / 工作流选择器（外加 provider、reasoning effort）。
 * 只做渲染和转发：选择状态仍然是 ChatComposer 里的 usePersistentRunConfig，
 * 这里拿到的 runConfig 就是那个 hook 的返回值，setter 原样接回去，
 * 所以可用性判定（readOnly / configDisabled）也由主文件算好再传进来。
 */
export function ComposerToolbar({
  executionMode,
  runConfig,
  providerModels,
  providerOptions,
  agent,
  readOnly,
  configDisabled,
}) {
  const { providerId, setProviderId, modelId, setModelId, setAgentId, reasoningEffort, setReasoningEffort } = runConfig;
  return (
    <>
      {executionMode === 'bot' ? <WorkflowPicker value={agent.value} options={agent.options} disabled={readOnly || configDisabled} onChange={setAgentId} /> : <ModelPicker
        value={modelId}
        reasoningEffort={reasoningEffort}
        options={providerModels.options}
        onChange={setModelId}
        onReasoningChange={setReasoningEffort}
        disabled={configDisabled}
        readOnly={readOnly}
        loading={providerModels.loading}
        providerValue={providerId}
        providerOptions={providerOptions}
        onProviderChange={setProviderId}
        agentValue={agent.value}
        agentOptions={agent.options}
        onAgentChange={agent.onChange}
        agentLoading={agent.loading}
        agentError={agent.error}
        onAgentRetry={agent.onRetry}
        agentLocked={agent.locked}
        agentLockedReason={agent.lockedReason}
      />}
    </>
  );
}
