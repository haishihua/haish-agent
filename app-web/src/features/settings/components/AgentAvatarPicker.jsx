import React from 'react';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../../../shared/ui/settings-elements/ui/dialog.tsx';
import {
  AGENT_AVATARS,
  AGENT_AVATAR_CATEGORIES,
  agentAvatarsInCategory,
  agentAvatarImageSrc,
} from '../../agents/model/agent-avatars.js';

/**
 * 头像选择弹窗：只允许从素材库里挑，不接受自定义上传。
 * 分类页签只是过滤 54 张素材，All 永远是完整清单。
 */
export function AgentAvatarPicker({ open, value, onSelect, onClose }) {
  const [category, setCategory] = React.useState('all');
  const options = agentAvatarsInCategory(category);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="agent-avatar-picker" showCloseButton={false} aria-describedby={undefined}>
        <DialogTitle className="agent-avatar-picker-title">Change Avatar</DialogTitle>
        <div className="agent-avatar-tabs" role="tablist" aria-label="Avatar categories">
          {AGENT_AVATAR_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={`agent-avatar-tab${category === item.id ? ' is-active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="agent-avatar-grid" role="listbox" aria-label="Avatars">
          {options.map((item) => {
            const selected = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={item.label}
                title={item.label}
                className={`agent-avatar-option${selected ? ' is-selected' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <img src={agentAvatarImageSrc(item.id)} alt="" draggable={false} />
                {selected ? (
                  <span className="agent-avatar-option-check" aria-hidden="true">
                    <Check size={12} strokeWidth={3.2} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="agent-avatar-picker-hint">
          {options.length} of {AGENT_AVATARS.length} avatars
        </p>
      </DialogContent>
    </Dialog>
  );
}
