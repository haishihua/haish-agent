import React from 'react';
import { BookOpen, Clock, CornerDownLeft, Target } from 'lucide-react';

// 斜杠菜单：DOM 结构被 chat 的键盘导航契约测试读源码断言，改动前先看那几条断言。
export function ComposerSkillMenu({ menuRef, skills, activeIndex, onSelect, onHover }) {
  return (
    <div ref={menuRef} className="chat-skill-menu" role="listbox" aria-label="Skills and actions">
      {skills.map((skill, index) => (
        <button
          key={skill.name}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          title={`/${skill.name}${skill.description ? ` — ${skill.description}` : ''}`}
          className={`chat-skill-menu-item${index === activeIndex ? ' is-active' : ''}`}
          onMouseDown={(event) => { onSelect(skill, event); }}
          onMouseEnter={() => onHover(index)}
        >
          {skill.command && skill.name === 'goal' ? <Target className="chat-skill-menu-icon" size={15} strokeWidth={1.5} aria-hidden="true" /> : skill.command ? <Clock className="chat-skill-menu-icon" size={15} strokeWidth={1.5} aria-hidden="true" /> : <BookOpen className="chat-skill-menu-icon" size={15} strokeWidth={1.5} aria-hidden="true" />}
          <span className="chat-skill-menu-name">/{skill.name}</span>
          {skill.description ? (
            <span className="chat-skill-menu-description">{skill.description}</span>
          ) : null}
          <span className="chat-skill-menu-enter" aria-hidden="true"><CornerDownLeft size={12} /></span>
        </button>
      ))}
    </div>
  );
}
