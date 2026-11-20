import React from 'react';
import {createRoot} from 'react-dom/client';
import {useNodeRuntimeConfigs} from '../../src/features/workflow/hooks/useNodeRuntimeConfigs.js';
import {WorkflowRuntimeConfig} from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import {workflowNodeRuntimeConfig} from '../../src/core/node-runtime-config.js';
const workflow={id:'offline',nodes:[{id:'agent',type:'agent',agent_id:'old'},{id:'judge',type:'llm',runtime_config_from:'agent'}]};
const providers=[{id:'route',label:'Offline route',provider:'custom',defaultModelId:'model',defaultReasoningEffort:'high'}];
function App(){
 const [task,setTask]=React.useState('one');
 const saved=JSON.parse(localStorage.getItem('offline-saved-'+task)||'{}');
 const selection=useNodeRuntimeConfigs('offline-conversation',workflow,saved,task,providers);
 const source=workflowNodeRuntimeConfig(workflow.nodes[0],null,selection.configs,false,providers);
 const judge=workflowNodeRuntimeConfig(workflow.nodes[1],null,{judge:{...source,agent_id:undefined}},false,providers);
 window.offline={selection,setTask,source,judge};
 return <><WorkflowRuntimeConfig value={source} providerOptions={providers} agentOptions={[{id:'old',label:'Old Agent'},{id:'new',label:'New Agent'}]} onChange={config=>selection.change('agent',config,async(id,value)=>{await new Promise(r=>setTimeout(r,50));localStorage.setItem('offline-saved-'+task,JSON.stringify({...saved,[id]:value}));})}/><div id="judge"><WorkflowRuntimeConfig nodeType="llm" inherited value={judge} providerOptions={providers}/></div><pre id="state">{JSON.stringify({source,judge})}</pre></>;
}
createRoot(document.getElementById('root')).render(<App/>);
