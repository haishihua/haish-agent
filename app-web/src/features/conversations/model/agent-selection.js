// A deleted selection remains displayable, but only enabled definitions are switch targets.
export function conversationAgentOptions(options, conversation) {
  const selected = conversation?.agentId;
  if (!selected || options.some((item) => item.id === selected)) return options;
  const disabled = conversation.agentStatus === 'disabled';
  return [...options, {
    id: selected,
    label: `${conversation.profileDisplayName || selected} (${disabled ? 'Disabled' : 'Deleted · saved snapshot'})`,
    unavailable: true,
    disabled,
    skills: [],
  }];
}

export function workspaceWithAgentSelection(state, conversationId, agentId, options) {
  const profile = options.find((item) => item.id === agentId);
  return { ...state, projects: state.projects.map((project) => ({
    ...project, conversations: project.conversations.map((conversation) => conversation.id === conversationId
      ? { ...conversation, agentId, profileDisplayName: profile?.label || agentId, agentStatus: 'available' }
      : conversation),
  })) };
}
