import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';
const workflow = { id: 'end-fixture', nodes: [{ id: 'start', type: 'start' }, { id: 'output', type: 'output', label: 'End' }], edges: [{ from: 'start', to: 'output' }] };
const task = { taskId: 'finished', status: 'done', executionMode: 'bot', workflowSnapshot: workflow, answerText: '## 最终结果\n\n- 验证通过\n- 保留产品行为', workflowRun: { status: 'succeeded', nodes: { output: { status: 'done' } } }, eventLog: [] };
createRoot(document.getElementById('root')).render(<AppTooltipProvider><WorkflowRuntimePage workflow={workflow} task={task} /></AppTooltipProvider>);
