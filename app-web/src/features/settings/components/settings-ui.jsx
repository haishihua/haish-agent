import tavilyLogo from '@lobehub/icons-static-svg/icons/tavily.svg?inline';
import exaLogo from '@lobehub/icons-static-svg/icons/exa.svg?inline';
import serpapiLogo from '../../../../assets/ui/icons/serpapi.svg?inline';
import braveLogo from '../../../../assets/ui/icons/brave.svg?inline';
import parallelLogo from '../../../../assets/ui/icons/parallel.svg?inline';
import firecrawlLogo from '../../../../assets/ui/icons/firecrawl.svg?inline';
import qdrantLogo from '../../../../assets/ui/icons/qdrant.svg?inline';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { AgentAvatar } from '../../../shared/ui/AgentAvatar.jsx';
import { BrandLogoIcon } from '../../../shared/ui/ProviderIcon.jsx';

export const SETTINGS_SUBTAB_ICONS = {
  chat: 'message',
  vision: 'eye',
  image: 'image',
  embedding: 'layers',
  'tools-mcp': 'nodes',
  'tools-skills': 'wrench',
  'tools-web': 'globe',
  'tools-browser': 'browser',
};
const CONNECTION_BRAND_LOGOS = {
  'memory-qdrant': qdrantLogo,
  qdrant: qdrantLogo,
};

const WEB_SEARCH_BRAND_LOGOS = {
  tavily: tavilyLogo,
  serpapi: serpapiLogo,
  exa: exaLogo,
  brave: braveLogo,
  parallel: parallelLogo,
  firecrawl: firecrawlLogo,
};

// Logos render through a CSS mask, so each file only needs an opaque silhouette.
export function WebSearchProviderIcon({ provider, label }) {
  const logo = WEB_SEARCH_BRAND_LOGOS[provider];
  if (logo) return <BrandLogoIcon logo={logo} scaleKey={provider} />;
  const initial = String(label || provider || '?').trim().slice(0, 1).toUpperCase();
  return <span className="settings-provider-icon settings-provider-initials" aria-hidden="true">{initial}</span>;
}

export function ConnectionBrandIcon({ itemId, title }) {
  const key = CONNECTION_BRAND_LOGOS[itemId] ? itemId : String(title || '').trim().toLowerCase();
  return <BrandLogoIcon logo={CONNECTION_BRAND_LOGOS[key]} scaleKey={key} />;
}


export function AgentListIcon({ item }) {
  return <AgentAvatar agentId={item?.id} size="list" />;
}

export function WorkflowListIcon({ item }) {
  if (item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <AppIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  const iconName = 'git-branch';
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <AppIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

export function SettingsTooltipIconButton({
  label,
  icon,
  onClick,
  onMouseDown,
  disabled = false,
  danger = false,
  type = 'button',
  className = '',
  iconSize = 15,
}) {
  const button = (
    <button
      type={type}
      className={`settings-tooltip-icon-button${danger ? ' danger' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
    >
      <AppIcon name={icon} size={iconSize} />
    </button>
  );
  return <PortalTooltip text={label} position="above">{button}</PortalTooltip>;
}

// 下拉菜单永远向下展开（方向保持一致）；但触发控件靠近表单底部时可用空间不足，
// 菜单会超出裁剪容器（表单滚动区）被底缘裁掉。这里把菜单最大高度压缩到触发
// 控件下方的剩余空间内（不足部分菜单内部滚动），保证列表完整可见且方向统一。
