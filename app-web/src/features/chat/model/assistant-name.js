// 助手气泡上显示哪个 agent（React-free，纯函数）。
//
// 会话一旦开始，agent 就锁死了（`Cannot change agent for this conversation.`），
// 所以整段对话的助手气泡应该一直写着用户在会话开始时选的那个 agent，而不是固定
// 的 "Assistant"。名字按可信度取：
//   1. 这一轮任务记录上的 profile_display_name：真正跑它的是谁（agent 之后改名、
//      下线都留得住，服务端每次落库都会写）；
//   2. 这一轮记录的 agent id 在 catalog 里的名字：最新一轮还没落库时，就是选单里
//      当前那一项，和用户看到的选择器一致；
//   3. 会话记录的 profile_display_name / agent id：会话开始时选定的 agent，兜住
//      早期没有记 agent 的任务；
// 三者都拿不到返回 ''，由气泡决定显示什么。
import { agentDisplayNameForId } from '../../agents/model/agent-settings.js';

function cleanName(value) {
  return String(value || '').trim();
}

function taskAgentName(task, agentOptions) {
  return cleanName(task?.profileDisplayName)
    || agentDisplayNameForId(task?.profileId || task?.requestedAgentId, agentOptions);
}

function conversationAgentName(conversation, agentOptions) {
  return cleanName(conversation?.profileDisplayName)
    || agentDisplayNameForId(conversation?.agentId, agentOptions);
}

/** 一条助手消息（这一轮任务）该显示的 agent 名字，拿不到返回 ''。 */
export function assistantNameForTask(task, conversation, agentOptions = []) {
  return taskAgentName(task, agentOptions) || conversationAgentName(conversation, agentOptions);
}

/**
 * 工作流节点详情里这条回复该署谁的名：只有 agent 节点在配置里绑了 agent_id
 * （llm / tool / condition / human_approval 在 core 里都没有 agent），所以其余节点
 * 返回 ''，气泡退回 "Assistant"。名字和节点图标一样只从 catalog 取——catalog 里
 * 查不到的 id（下线 / 删掉的 agent）不给名字，绝不把内部 id 漏到界面上。
 */
export function workflowNodeAgentName(node, agentOptions = []) {
  if (node?.type !== 'agent') return '';
  return agentDisplayNameForId(node.agent_id, agentOptions);
}
