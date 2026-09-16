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
