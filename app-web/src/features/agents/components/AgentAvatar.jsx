import { Pencil } from 'lucide-react';
import { useAgentAvatars } from '../hooks/useAgentAvatars.js';
import { agentAvatarById, agentAvatarIdFor, agentAvatarImageSrc } from '../model/agent-avatars.js';

/**
 * Agent 头像。素材是透明黑线稿，米色底由 CSS 提供（见 settings.css 的 .agent-avatar-frame），
 * 这样同一张图在深色列表和弹窗里都不用另存一份。
 *
 * 传 onChange 才出铅笔按钮；没选过头像时回落到素材库第一只企鹅。
 */
export function AgentAvatar({ agentId, avatarId, size = 'list', label = '', onChange }) {
  const { avatars } = useAgentAvatars();
  const selectedId = agentAvatarById(avatarId)?.id || agentAvatarIdFor(agentId, avatars);
  return (
    <span className={`agent-avatar agent-avatar-${size}`}>
      <span className="agent-avatar-frame">
        <img src={agentAvatarImageSrc(selectedId)} alt="" draggable={false} />
      </span>
      {onChange ? (
        <button
          type="button"
          className="agent-avatar-edit"
          onClick={onChange}
          aria-label={label ? `Change avatar for ${label}` : 'Change avatar'}
          title="Change avatar"
        >
          <Pencil size={11} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
