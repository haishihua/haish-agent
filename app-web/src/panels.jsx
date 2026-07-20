// @haish-esm
// Barrel re-export — keeps existing import paths stable after split.
export { PortalTooltip } from './panels/PortalTooltip.jsx';
export { fmtAgo, AttachmentFileChip } from './panels/Format.jsx';
export { TopBar } from './panels/TopBar.jsx';
export {
  STAGES,
  STAGE_INDEX,
  TaskFilterDropdown,
  TaskRecordsPanel,
  usePanelWidth,
  getTaskPillMeta,
} from './panels/TaskRecords.jsx';
export { ConversationsPanel } from './panels/ConversationsPanel.jsx';
export { LiveFeedPanel } from './panels/LiveFeedPanel.jsx';
export {
  resolveModelCatalog,
  ApprovalModePicker,
  ModelPicker,
} from './panels/ModelPickers.jsx';
export { TaskDelegation } from './panels/TaskDelegation.jsx';
export { ChatPanel } from './panels/ChatPanel.jsx';
export { normalizeToolName } from './lib/tool-names.js';
export { NAV_TABS, BottomNav, MapViewport, TabPlaceholder } from './panels/Shell.jsx';
export {
  LIVE_FEED_VISIBLE_COUNT,
  MODEL_OPTIONS,
  DEFAULT_AGENT_OPTIONS,
  PROVIDER_MODEL_CATALOG,
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORT_OPTIONS,
  CATEGORY_ICON_CLASS,
  CATEGORY_LABEL,
  NAV_ICONS,
} from './panels/shared-constants.jsx';
