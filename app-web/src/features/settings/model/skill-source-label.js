// Source is provenance, not enablement or permission to edit the skill.
export function skillSourceLabel(source) {
  switch (source) {
    case 'preset':
    case 'builtin':
      return 'Built-in';
    case 'haish':
    case 'installed':
      return 'Haish';
    case 'codex-copy':
      return 'Codex';
    default:
      return 'Unknown';
  }
}
