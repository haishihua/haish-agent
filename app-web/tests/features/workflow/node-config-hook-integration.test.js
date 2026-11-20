import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const harness = `
let slots=[], cursor=0, effects=[];
export function reset(){slots=[];cursor=0;effects=[];}
export function render(fn){cursor=0;effects=[];const result=fn();for(const effect of effects)effect();return result;}
export default {
 useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
 useRef(initial){const index=cursor++;return slots[index] ||= {current:initial};},
 useMemo(fn,deps){const index=cursor++;if(!slots[index]||deps.some((d,i)=>d!==slots[index].deps[i]))slots[index]={deps,value:fn()};return slots[index].value;},
 useEffect(fn){cursor++;effects.push(fn);}
};`;
const bundle = await build({ stdin: { contents: `export {useNodeRuntimeConfigs} from './app-web/src/features/workflow/hooks/useNodeRuntimeConfigs.js'; export {render,reset} from 'react';`, resolveDir: process.cwd() }, bundle:true, write:false, format:'esm', platform:'node', plugins:[{name:'hook-runtime',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'harness'}));b.onLoad({filter:/.*/,namespace:'harness'},()=>({contents:harness,loader:'js'}));}}] });
const {useNodeRuntimeConfigs,render,reset}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const workflow={id:'workflow',nodes:[{id:'a',type:'agent',agent_id:'default'},{id:'b',type:'agent',agent_id:'default'}]};

test('actual Hook: immediate execution, task/conversation switch and reload preserve displayed config',async()=>{
 reset(); const storage=new Map();globalThis.window={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 let key='conversation-a', task='task-a', saved={};
 const draw=()=>render(()=>useNodeRuntimeConfigs(key,workflow,saved,task));
 let hook=draw();let release;const gate=new Promise(r=>release=r);const persisted={};
 const selected={agent_id:'selected',llm_config_id:'route',model_id:'model',reasoning_effort:'high'};
 const write=hook.change('a',selected,async(id,config)=>{await gate;persisted[id]=structuredClone(config);});
 hook=draw();assert.deepEqual(hook.configs.a,selected);
 let executed=false;const request=hook.ensureSaved().then(c=>{executed=true;return c;});
 await Promise.resolve();assert.equal(executed,false);release();await write;
 assert.deepEqual((await request).a,persisted.a);
 saved=persisted; task='task-b';let other=draw();assert.deepEqual(other.configs.a,selected);
 key='conversation-b';saved={b:{agent_id:'other'}};other=draw();assert.equal(other.configs.b.agent_id,'other');
 key='conversation-a';task='task-a';saved=persisted;hook=draw();assert.deepEqual(hook.configs.a,selected);
 reset();hook=draw();assert.deepEqual(hook.configs.a,selected);assert.deepEqual((await hook.ensureSaved()).a,persisted.a);
});

test('actual Hook prevents pending execution after changing conversation',async()=>{
 reset();globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{}}};
 let key='first';const draw=()=>render(()=>useNodeRuntimeConfigs(key,workflow,{},'task'));
 const hook=draw();let release;const gate=new Promise(r=>release=r);
 const write=hook.change('a',{agent_id:'new'},()=>gate);const execution=hook.ensureSaved();
 key='second';draw();release();await write;await assert.rejects(execution,/Workflow changed/);
});
