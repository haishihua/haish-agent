// Orchestrator — generates a quest plan from user input and produces step events.
// Each step targets one NPC, has a kind (think|tool|mcp|skill|rag|llm|report|deliver),
// and produces logs/animations.

const KIND_COLORS = {
  think: '#a78bfa',
  tool: '#67e8f9',
  mcp: '#fb7185',
  skill: '#ffd166',
  rag: '#84e1bc',
  llm: '#7c3aed',
  report: '#f5c563',
  deliver: '#f5c563',
};
window.KIND_COLORS = KIND_COLORS;

function classifyTask(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (/天气|搜|查|找|新闻|股票|汇率|价格|api/.test(t)) tags.push('tool');
  if (/笔记|文档|资料|知识|历史|记录|rag|检索/.test(t)) tags.push('rag');
  if (/代码|部署|构建|git|仓库|执行命令|shell|deploy|build/.test(t)) tags.push('mcp');
  if (/总结|整理|写|翻译|起草|分析|规划|安排/.test(t)) tags.push('skill');
  if (tags.length === 0) tags.push('skill');
  return tags;
}

function buildPlan(quest) {
  const tags = Array.from(new Set(classifyTask(quest.title)));
  const questCode = quest.id.slice(-6).toUpperCase();
  const leviKind = tags.includes('rag') ? 'rag' : 'tool';
  const leviLabel = tags.includes('rag') ? 'TOOL + RAG' : 'FUNCTION CALL';
  const steps = [];

  const workers = [
    {
      actor: 'levi',
      kind: leviKind,
      label: leviLabel,
      dispatchBubble: 'Local tools, collect the tool output and retrieved context.',
      workBubble: leviKind === 'rag' ? 'Running retrieval and external calls in parallel.' : 'Starting retrieval and tool execution.',
      route: 'lelouchToLevi',
      reportRoute: 'leviToLelouch',
      workLog: leviKind === 'rag'
        ? `function_call("${describeTool(quest.title)}") + rag.search("${describeRAG(quest.title)}", k=8)`
        : `function_call("${describeTool(quest.title)}")`,
    },
    {
      actor: 'itachi',
      kind: 'mcp',
      label: 'MCP TOOL',
      dispatchBubble: 'External tools, command execution is yours.',
      workBubble: 'External toolchain started.',
      route: 'lelouchToItachi',
      reportRoute: 'itachiToLelouch',
      workLog: `mcp.invoke({ server:"${describeMCP(quest.title)}" })`,
    },
    {
      actor: 'mikey',
      kind: 'skill',
      label: 'SKILL',
      dispatchBubble: 'Knowledge base, take care of synthesis and output.',
      workBubble: 'Understood. Starting consolidation.',
      route: 'lelouchToMikey',
      reportRoute: 'mikeyToLelouch',
      workLog: `skill.run("${describeSkill(quest.title)}")`,
    },
  ];

  // 1. Gojo walks over to brief Guts in person.
  steps.push({
    actor: 'gojo',
    kind: 'deliver',
    label: 'BRIEF GUTS',
    bubble: 'Assistant, take this task.',
    route: 'gojoToGuts',
    faceToFaceWith: 'guts',
    log: { src: 'You', kind: 'info', msg: `Delegated task #${questCode} in person: ${quest.title}` },
    duration: 1100,
  });

  // 2. Guts receives and registers it.
  steps.push({
    actor: 'guts',
    kind: 'think',
    label: 'RECEIVE',
    bubble: 'Task received. Registering now...',
    log: { src: 'Assistant', kind: 'think', msg: `Registered task #${questCode}: ${quest.title}` },
    duration: 1200,
  });

  // 3. Guts first runs to the planning side.
  steps.push({
    actor: 'guts',
    kind: 'deliver',
    label: 'DELIVER -> PROVIDER DESK',
    bubble: 'Provider, define the execution route first.',
    route: 'gutsToPlanning',
    faceToFaceWith: 'okabe',
    forceDir: 'back',
    bubbleAfterMove: true,
    returnHome: false,
    log: { src: 'Assistant', kind: 'info', msg: 'Delivering the task background and goals to the provider desk.' },
    duration: 1200,
  });

  steps.push({
    actor: 'okabe',
    kind: 'think',
    label: 'PLAN',
    bubble: 'First, align the route and responsibilities.',
    log: { src: 'DeepSeek', kind: 'think', msg: `Execution plan ready. Requires ${['tool', 'mcp', 'skill'].join(', ')} coordination.` },
    duration: 900,
  });

  steps.push({
    actor: 'kurisu',
    kind: 'llm',
    label: 'CHECK ROUTE',
    bubble: 'I will add a feasibility pass and verify the handoff path.',
    log: { src: 'OpenAI', kind: 'think', msg: 'Route validation complete. Handoff spacing is within limits.' },
    duration: 1000,
  });

  steps.push({
    actor: 'guts',
    kind: 'deliver',
    label: 'DELIVER -> TOOL MANAGER',
    bubble: 'The provider plan is ready. Tool Manager, take over execution.',
    route: 'planningToLelouch',
    faceToFaceWith: 'lelouch',
    returnRoute: ['center_left_lane'],
    log: { src: 'Assistant', kind: 'info', msg: 'Bringing the provider plan to the Tool Manager for execution.' },
    duration: 1100,
  });

  steps.push({
    actor: 'lelouch',
    kind: 'think',
    label: 'SPLIT TASK',
    bubble: 'Understood. Dispatching in sequence.',
    log: { src: 'Tool Manager', kind: 'think', msg: `Execution chain split into: ${workers.map((worker) => worker.kind).join(', ')}` },
    duration: 900,
  });

  // 4. Lelouch dispatches the core trio one by one.
  for (const worker of workers) {
    steps.push({
      actor: 'lelouch',
      kind: 'deliver',
      label: `DISPATCH → ${window.CHAR_DEFS[worker.actor].name}`,
      bubble: worker.dispatchBubble,
      route: worker.route,
      faceToFaceWith: worker.actor,
      poseVariant: worker.actor === 'levi' || worker.actor === 'itachi' ? 'vertical-command' : null,
      forceDir: worker.actor === 'levi' || worker.actor === 'itachi' ? 'back' : null,
      log: { src: 'Tool Manager', kind: 'info', msg: `Dispatch issued: ${worker.label} -> ${window.CHAR_DEFS[worker.actor].name}` },
      duration: 900,
    });
    steps.push({
      actor: worker.actor,
      kind: worker.kind,
      label: worker.label,
      bubble: worker.workBubble,
      log: { src: window.CHAR_DEFS[worker.actor].name, kind: worker.kind, msg: worker.workLog },
      fx: true,
      duration: 1900,
    });
    steps.push({
      actor: worker.actor,
      kind: 'report',
      label: 'REPORT',
      bubble: 'Execution complete. Reporting back.',
      route: worker.reportRoute,
      faceToFaceWith: 'lelouch',
      log: { src: window.CHAR_DEFS[worker.actor].name, kind: 'result', msg: 'Subtask complete. Result returned in person to the Tool Manager.' },
      duration: 900,
    });
  }

  // 5. Only after all three reports does Lelouch walk back to planning.
  steps.push({
    actor: 'lelouch',
    kind: 'deliver',
    label: 'REPORT -> PROVIDER DESK',
    bubble: 'Provider, the execution results are ready.',
    route: 'lelouchToPlanning',
    faceToFaceWith: 'okabe',
    poseVariant: 'vertical-command',
    forceDir: 'back',
    log: { src: 'Tool Manager', kind: 'info', msg: 'All execution branches consolidated. Reporting back to the provider desk.' },
    duration: 1200,
  });

  steps.push({
    actor: 'okabe',
    kind: 'think',
    label: 'CHECK',
    bubble: 'Received. I will prepare the final synthesis.',
    log: { src: 'DeepSeek', kind: 'think', msg: 'Received the consolidated results and started the final review.' },
    duration: 1100,
  });
  steps.push({
    actor: 'kurisu',
    kind: 'llm',
    label: 'VERIFY',
    bubble: 'I will run a cross-check. The result passes.',
    log: { src: 'OpenAI', kind: 'think', msg: 'Consistency check: PASS.' },
    duration: 1200,
  });
  steps.push({
    actor: 'okabe',
    kind: 'report',
    label: 'REPORT -> ASSISTANT',
    bubble: 'Assistant, the final answer is confirmed.',
    route: 'okabeToGuts',
    faceToFaceWith: 'guts',
    log: { src: 'DeepSeek', kind: 'result', msg: 'Leaving the provider desk to hand the final result to the assistant.' },
    duration: 1000,
  });

  // 6. Guts returns to Gojo with the final report.
  steps.push({
    actor: 'guts',
    kind: 'deliver',
    label: 'DELIVER -> YOU',
    bubble: 'User, here is the final report.',
    route: 'gutsToGojo',
    faceToFaceWith: 'gojo',
    log: { src: 'Assistant', kind: 'info', msg: 'Reached the user position and delivered the result.' },
    duration: 1200,
  });
  // 7. Gojo opens Hollow Purple
  steps.push({
    actor: 'gojo',
    kind: 'llm',
    label: 'FINAL REVIEW',
    bubble: 'Let me review it myself.',
    log: { src: 'You', kind: 'result', msg: 'Final review opened. Result presentation expanded.' },
    showResult: true,
    duration: 800,
  });

  return steps;
}

function describeTool(t) {
  if (/天气/.test(t)) return 'weather.get';
  if (/搜|查/.test(t)) return 'search.web';
  if (/邮件/.test(t)) return 'gmail.list';
  if (/价格|股票/.test(t)) return 'finance.quote';
  return 'http.fetch';
}
function describeMCP(t) {
  if (/部署|deploy/.test(t)) return 'k8s-deployer';
  if (/git|代码|仓库|build|构建/.test(t)) return 'github-mcp';
  if (/shell|命令/.test(t)) return 'shell-runner';
  return 'filesystem-mcp';
}
function describeSkill(t) {
  if (/总结/.test(t)) return 'summarize';
  if (/翻译/.test(t)) return 'translate';
  if (/写|起草/.test(t)) return 'draft';
  if (/规划|安排/.test(t)) return 'plan';
  return 'analyze';
}
function describeRAG(t) {
  if (/笔记/.test(t)) return 'notes-index';
  if (/会议/.test(t)) return 'meeting-corpus';
  return 'knowledge-base';
}

function makeFakeResult(title, tags) {
  const safeTitle = (title || 'Task').trim();
  const elapsed = Math.floor(8 + Math.random() * 6);
  const agentCount = tags.length + 2;

  const objectives = [];
  if (tags.includes('rag')) objectives.push('Retrieve relevant knowledge from internal corpus');
  if (tags.includes('tool')) objectives.push('Call external tools and validate timestamps');
  if (tags.includes('mcp')) objectives.push('Execute MCP commands inside sandboxed environments');
  if (tags.includes('skill')) objectives.push('Synthesize structured deliverables');
  objectives.push('Persist all results to the audit log');

  const lines = [];
  lines.push(`# ${safeTitle} Overview`);
  lines.push('');
  lines.push('This document outlines the goals, methodology, and current status of the dispatched task. The agent crew operates in iterative cycles of planning, execution, and verification.');
  lines.push('');
  lines.push('## Objectives');
  for (const obj of objectives) lines.push(`- ${obj}`);
  lines.push('');
  lines.push('## Current Hypothesis');
  lines.push('> The dispatched plan converged to a stable result; cross-validation by Kurisu reports **PASS** across all branches.');
  lines.push('');
  lines.push('## Recent Operations');
  lines.push('```python');
  lines.push('for region in target_regions:');
  lines.push('    data = collect_emission_data(region)');
  lines.push('    features = extract_features(data)');
  lines.push('    model_output = anomaly_detector.predict(features)');
  lines.push('    log_result(region.id, model_output)');
  lines.push('```');
  lines.push('');
  lines.push('## Results Summary');
  lines.push('');
  lines.push('| Region ID | Anomalies Detected | Confidence Score | Status |');
  lines.push('|-----------|--------------------|------------------|--------|');
  lines.push('| R-137  | 12 | 0.91 | High Priority |');
  lines.push('| R-421  | 7  | 0.78 | Investigating |');
  lines.push('| R-889  | 15 | 0.95 | High Priority |');
  lines.push('| R-1024 | 3  | 0.62 | Monitoring    |');
  lines.push('');
  lines.push('## Next Steps');
  lines.push('1. Prioritize analysis of high-confidence regions');
  lines.push('2. Refine models with new observational data');
  lines.push('3. Seek cross-validation with external datasets');
  lines.push('4. Update knowledge graph with new findings');
  lines.push('');
  lines.push(`_Pipeline completed in ~${elapsed}s using ${agentCount} agents._`);
  return lines.join('\n');
}

window.buildPlan = buildPlan;
window.classifyTask = classifyTask;
window.makeFakeResult = makeFakeResult;
