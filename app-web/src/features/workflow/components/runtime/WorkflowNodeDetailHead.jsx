// 运行态面板头部：图标 / 名称 / 状态副标题 / 关闭键 + Runtime Config|Run Result 页签。
// 页签切换仍由主页面选中的 detailTab 驱动。
import { agentIconNameForAgentId } from '../../../../core/agent-settings.js';
import { typeLabelForWorkflowNode, workflowNodeIcon } from '../../model/workflow-catalog.js';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';

export function WorkflowNodeDetailHead({
  node,
  status,
  statusCopy,
  isAgent,
  agentOptions,
  agentName,
  detailTab,
  tabId,
  selectTab,
  onClose,
}) {
  return (
    <>
      <header className="workflow-detail-head">
        <span className="workflow-detail-icon" aria-hidden="true">
          <AppIcon name={node.type === 'agent' ? agentIconNameForAgentId(node.agent_id, agentOptions) : workflowNodeIcon(node.type)} size={26} />
        </span>
        <span className="workflow-detail-heading">
          <span className="workflow-detail-name"><strong>{agentName || node.label || typeLabelForWorkflowNode(node.type)}</strong></span>
          <span className="workflow-detail-subtitle"><i className={`workflow-detail-status-dot is-${status}`} aria-hidden="true" />{typeLabelForWorkflowNode(node.type)} · {isAgent && status === 'pending' ? 'Ready' : statusCopy}</span>
        </span>
        <button type="button" className="workflow-detail-close" onClick={onClose} aria-label="Close node details">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      {isAgent ? <div className="workflow-detail-tabs" role="tablist" aria-label="Node details">
        {['config', 'result'].map((tab) => <button key={tab} type="button" role="tab" id={`${tabId}-${tab}-tab`} aria-controls={`${tabId}-panel`} aria-selected={detailTab === tab} tabIndex={detailTab === tab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 'config' : event.key === 'End' ? 'result' : tab === 'config' ? 'result' : 'config';
            selectTab(next);
            document.getElementById(`${tabId}-${next}-tab`)?.focus();
          }
        }}>{tab === 'config' ? 'Runtime Config' : 'Run Result'}</button>)}
      </div> : null}
    </>
  );
}
