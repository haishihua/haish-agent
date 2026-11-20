import {createInterface} from 'node:readline';
import {createNodeConfigActions} from '../../src/features/workflow/model/node-config-actions.js';
import {createNodeConfigWrites} from '../../src/features/workflow/model/node-config-writes.js';
const lines=createInterface({input:process.stdin});const pending=[];
lines.on('line',line=>pending.shift()(JSON.parse(line)));
function rpc(method,payload){return new Promise(resolve=>{pending.push(resolve);console.log(JSON.stringify({method,payload}));});}
const initial=JSON.parse(process.argv[2]);
const queue=createNodeConfigWrites(initial.configs);
const selection={change:(...args)=>queue.change(...args),ensureSaved:()=>queue.flush()};
import {workflowDisplayConfig} from '../../src/features/workflow/model/workflow-display-config.js';
import {createTaskStreamHandlers} from '../../src/features/tasks/hooks/createTaskStreamHandlers.js';
import {createDeployHandlers} from '../../src/features/tasks/hooks/createDeployHandlers.js';
const runtime={cancelledRunIds:new Set(),taskRuntimeState:{taskOrder:[],tasksById:{}}};
const noop=()=>{};
const context={providerOptions:[{id:'route',provider:'custom'}],generateHexId:()=> 'derived',getRuntime:()=>runtime,
 mutateRuntime:(_id,update)=>update(runtime),updateTaskRuntimeState:update=>{runtime.taskRuntimeState=update(runtime.taskRuntimeState);},
 setRuntimeFetchController:c=>{runtime.fetchController=c;},setRuntimeActiveTaskId:id=>{runtime.activeTaskId=id;},setRuntimeBusy:noop,
 chatFinalizedTaskIdsRef:{current:new Set()},userCancelledTaskIdsRef:{current:new Set()},removeConversationTaskFromWorkspace:noop,
 runTaskStream:async command=>{command.display=workflowDisplayConfig({id:'judge',type:'llm',runtime_config_from:'agent'},fullWorkflow,null,queue.read(),false,context.providerOptions);await rpc('transport',command);command.onAccepted?.();}};
const streams=createTaskStreamHandlers(context);
const fullWorkflow={...initial.workflow,workflow_id:'workflow.goal-loop'};
const deploy=createDeployHandlers({...context,executeQuest:streams.executeQuest,
 viewModeRef:{current:'bot'},conversationIdRef:{current:'conversation'},conversationId:'conversation',selectedConversationId:'conversation',
 conversationReady:true,draftConversationRef:{current:null},pendingCreatedDetailRef:{current:null},
 normalizeWorkflowSettings:()=>({presets:[fullWorkflow],custom:[]}),workflowSettingsDraft:{},
 findConversationById:()=>null,titleFromTaskText:()=>'',setComposerAttachment:noop,setWorkspaceState:noop,
 isTaskActuallyActive:()=>false,showToast:(...args)=>{throw Error(args.join(' '));}});
const actions=createNodeConfigActions({selection,task:{...initial.task,title:'Run',executionMode:'bot',workflowSnapshot:fullWorkflow,conversationId:'conversation',requestedWorkflowId:'workflow.goal-loop'},workflow:fullWorkflow,providers:[],
 saveNode:(nodeId,config)=>rpc('patch',{nodeId,config}),
 rerun:streams.executeWorkflowNodeRerun,
 deploy:deploy.handleDeploy});
const change=actions.change('agent',initial.edited);
const retry=actions.retry('agent');
await change;await retry;
runtime.fetchController=null;runtime.activeTaskId=null;runtime.activeRunId=null;runtime.busy=false;runtime.taskRuntimeState.activeTaskId=null;
await actions.send('new input',null,null,null,[],'workflow.goal-loop',null,'new input');
console.log(JSON.stringify({method:'done'}));lines.close();
