import React from 'react';
import { createRoot } from 'react-dom/client';
import { NodeConversation } from '../../src/features/workflow/components/runtime/WorkflowNodeConversation.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
const result = { status: 'done', summary: JSON.stringify({ ok: false, reason: '**结论：还需验证。**\n\n- 已完成模块重构。\n- 下一步运行 `npm test`。', impossible: false, blocked: false }) };
createRoot(document.getElementById('root')).render(<AppTooltipProvider><NodeConversation node={{ id: 'judge', type: 'llm' }} task={{ taskId: 'fixture', workflowSnapshot: { id: 'workflow.goal-loop' }, eventLog: [] }} result={result} status="done" running={false} /></AppTooltipProvider>);
