// Goal 提交后的整页等待态：项目、会话和节点配置还没就绪时先停在这里，
// 不靠聊天输入框的占位文案假装“准备中”；有任务描述时，任务交接完成后再揭开 Bot 页。
import { LoadingState } from '../../../shared/ui/agent-elements/LoadingState.jsx';

export function GoalPreparingPage() {
  return (
    <div className="app-body-loading goal-preparing-overlay">
      <LoadingState role="status" label="Preparing Goal Loop…" />
    </div>
  );
}
