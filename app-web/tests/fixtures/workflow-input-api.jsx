import React from 'react';
import { createRoot } from 'react-dom/client';
import { NodeConversation } from '../../src/features/workflow/components/runtime/WorkflowNodeConversation.jsx';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { taskSummaryToRuntimeTask } from '../../src/core/task-runtime.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/chat.css';
const phase = new URLSearchParams(location.search).get('phase') || 'submitted';
const rows = await Promise.all(['workflow.goal-loop','workflow.direct-agent'].flatMap(id => ['text','image','paths','annotation','combined'].map(async kind => {
  const payload = await fetch(`./input-api-data/${id}-${kind}-${phase}.json`).then(r => r.json());
  return {id,kind,payload};
})));
createRoot(document.getElementById('root')).render(<AppTooltipProvider><main className="chat-page" style={{padding:24}}>{rows.map(({id,kind,payload}) => {
  const task = taskSummaryToRuntimeTask(payload);
  const downstream = {id:'downstream',type:'agent',data:{input:'{{nodes.agent.output}}'}};
  const nodes = [downstream,{id:'agent',type:'agent',data:{input:'{{input.message}}'}}];
  const customTask = {...task,workflowSnapshot:{...task.workflowSnapshot,nodes}};
  const attempt = value => ({events:[{type:'workflow_node_started',nodeInput:value}]});
  return <section key={id+kind} data-pair={id+':'+kind} style={{borderBottom:'1px solid #555',padding:20}}><h2>{id} / {kind} / {phase}</h2><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}><div data-role="chat"><ChatMessageRow message={{role:'user',text:payload.display_text,images:payload.image_attachments,annotations:payload.annotations,createdAt:task.createdAt}} /></div><div data-role="workflow"><NodeConversation node={nodes[1]} task={task} status="failed" /></div><div data-role="downstream"><NodeConversation node={downstream} task={customTask} attempt={attempt('Actual downstream input')} status="failed" /></div><div data-role="retry"><NodeConversation node={nodes[1]} task={task} attempt={attempt({evaluation_feedback:'Retry this claim'})} status="failed" /></div></div></section>;
})}</main></AppTooltipProvider>);
