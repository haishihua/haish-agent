import { executionConfigError } from '../../../core/execution-config.js';

// 部署请求的构造与预检：聊天和工作流发出去的是同一个对象，规则只在这里一份。

/**
 * 队列里的请求要有唯一 id：同一毫秒内连发两笔也不能撞车，重试/编辑靠它认领自己那一笔。
 */
function createQueuedDeployId() {
  return `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 只留服务端认得的图片引用：`file` 是还没上传的本地草稿，`image_id` + `path` 才是已上传的。
 * 两者都没有的条目是清空预览后留下的空壳，带上去只会让服务端多一条坏引用。
 */
function sanitizeDeployImageAttachments(imageAttachments) {
  if (!Array.isArray(imageAttachments)) return [];
  return imageAttachments
    .filter((ref) => ref && (ref.file || (ref.image_id && ref.path)))
    .map((ref) => ({
      image_id: ref.image_id,
      file: ref.file,
      path: ref.path,
      mime: ref.mime || null,
      previewUrl: ref.previewUrl || null,
    }));
}

/**
 * 结点配置必须当场深拷贝：用户在发出去之后继续改画布，不能把已排队/已重试的请求一起改掉。
 */
export function createDeployRequest({
  text,
  displayText,
  annotations,
  nodeRuntimeConfigs,
  contextTasks,
  historySourceTaskId,
  attachment,
  modelId,
  reasoningEffort,
  imageAttachments,
  selectionId,
  providerRequest,
  viewMode,
  targetConversationId,
}) {
  return {
    id: createQueuedDeployId(),
    text,
    displayText: String(displayText || text || '').trim(),
    annotations: annotations.map((item) => ({ ...item })),
    nodeRuntimeConfigs: structuredClone(nodeRuntimeConfigs),
    contextTasks,
    historySourceTaskId: historySourceTaskId || null,
    attachment,
    modelId,
    reasoningEffort,
    imageAttachments: sanitizeDeployImageAttachments(imageAttachments),
    executionMode: viewMode === 'chat' ? 'chat' : 'bot',
    agentId: viewMode === 'chat' ? selectionId : null,
    workflowId: viewMode === 'chat' ? null : selectionId,
    providerRequest: providerRequest || '',
    targetConversationId,
  };
}

/**
 * 起跑前的配置校验。工作流目录由调用方按模式决定要不要读（chat 模式没有工作流可查），
 * 这里只管拿「这一次请求 + 当前目录」算出该不该拦下去，保证预检和运行时是同一套判断。
 */
export function deployRequestConfigError(request, { workflows, providerOptions }) {
  const availableWorkflows = workflows || { presets: [], custom: [] };
  return executionConfigError({
    executionMode: request.executionMode,
    provider: request.providerRequest,
    modelId: request.modelId,
    workflow: [...availableWorkflows.presets, ...availableWorkflows.custom]
      .find((item) => item.workflow_id === request.workflowId),
    nodeRuntimeConfigs: request.nodeRuntimeConfigs,
    providerOptions: providerOptions || [],
  });
}
