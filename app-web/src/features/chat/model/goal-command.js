export const GOAL_WORKFLOW_ID = 'workflow.goal-loop';
export const GOAL_COMMAND = { name: 'goal', description: 'Run a task with Goal Loop in this project', command: true };

export function goalInvocation(text) {
  const match = String(text || '').match(/^\s*\/goal(?:\s+([\s\S]*))?$/i);
  return match ? { prompt: (match[1] || '').trim() } : null;
}

export function goalMenuItems(text, skills, enabled) {
  const query = String(text || '').match(/^\s*\/([a-z0-9-]*)(?:\s+[\s\S]*)?$/i)?.[1];
  return enabled && query !== undefined && 'goal'.startsWith(query.toLowerCase())
    ? [GOAL_COMMAND, ...skills.filter((skill) => skill.name !== 'goal')]
    : skills;
}

export function matchingWorkflowProject(projects, source) {
  const path = (value) => String(value || '').trim().replace(/\/+$/, '') || '/';
  return projects.find((project) => project.execution_mode === 'bot' && (
    source.workspacePath
      ? path(project.workspace_path) === path(source.workspacePath)
      : project.is_default === true
  )) || null;
}
