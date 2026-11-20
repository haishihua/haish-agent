import React from 'react';
import { createRoot } from 'react-dom/client';
import { NodeConversation } from '../../src/features/workflow/components/runtime/WorkflowNodeConversation.jsx';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { taskSummaryToRuntimeTask } from '../../src/core/task-runtime.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
const image = { path: 'fixture.png', previewUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="skyblue"/%3E%3C/svg%3E' };
const annotations = [{ id: 'quote', source_message_id: 'answer', text: 'Original answer', comment: 'Please check this claim.' }];
const cases = [ ['text', 'Check this task.', [], []], ['image', '', [image], []], ['paths', '/Users/example/project\n./src/main.js\nCheck these paths.', [], []], ['annotation', '', [], annotations], ['combined', '/Users/example/project\nReview this.', [image], annotations] ];
const restored = new URLSearchParams(location.search).has('restored');
createRoot(document.getElementById('root')).render(<AppTooltipProvider><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>{['workflow.goal-loop','fixture.custom'].flatMap(workflowId => cases.map(([name,text,images,quotes]) => {
  const nodes=[{id:'agent',type:'agent'},{id:'downstream',type:'agent'}];
  const task = restored ? taskSummaryToRuntimeTask({task_id:name,title:'Generated title',display_text:text,image_attachments:images,annotations:quotes,workflow_snapshot:{workflow_id:workflowId,nodes},status:'done'}) : {taskId:name,title:'Generated title',displayText:text,imageAttachments:images,annotations:quotes,workflowSnapshot:{workflow_id:workflowId,nodes},status:'done'};
  return <React.Fragment key={workflowId+name}><section data-case={`${workflowId}:${name}:chat`}><h3>Chat / {name}</h3><ChatMessageRow message={{role:'user',text,images,annotations:quotes}} /></section><section data-case={`${workflowId}:${name}:workflow`}><h3>Workflow / {name}</h3><NodeConversation node={nodes[0]} task={task} status="done" /></section></React.Fragment>;
}))}</div></AppTooltipProvider>);
