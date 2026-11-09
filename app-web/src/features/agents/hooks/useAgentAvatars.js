import { useCallback, useSyncExternalStore } from 'react';
import { agentAvatarIdFor, getAgentAvatarMap, saveAgentAvatar, subscribeAgentAvatars } from '../model/agent-avatars.js';

// Agent 头像存在本地偏好里：列表行和详情页共用同一份快照，选完立刻一起更新。
export function useAgentAvatars() {
  const avatars = useSyncExternalStore(subscribeAgentAvatars, getAgentAvatarMap, getAgentAvatarMap);
  const avatarIdFor = useCallback((agentId) => agentAvatarIdFor(agentId, avatars), [avatars]);
  const setAvatar = useCallback((agentId, avatarId) => saveAgentAvatar(agentId, avatarId), []);
  return { avatars, avatarIdFor, setAvatar };
}
