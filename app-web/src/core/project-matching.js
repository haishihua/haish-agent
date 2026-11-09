// 按工作区路径（或默认项目）找到可执行工作流的 bot 项目。
// goal 命令与工作流部署都按这一份判据，不各自推导。

export function matchingWorkflowProject(projects, source) {
  const path = (value) => String(value || '').trim().replace(/\/+$/, '') || '/';
  return projects.find((project) => project.execution_mode === 'bot' && (
    source.workspacePath
      ? path(project.workspace_path) === path(source.workspacePath)
      : project.is_default === true
  )) || null;
}
