import fs from 'node:fs';

// 「shell 实现」= 状态与装配在前、View 紧随其后，用换行拼接（同 handler-source.js）。
const SOURCE_ROOT = new URL('../../src/', import.meta.url);

export function appShellSource() {
  return [
    'features/app/AppShell.jsx',
    'features/app/AppShellView.jsx',
  ]
    .map((relativePath) => fs.readFileSync(new URL(relativePath, SOURCE_ROOT), 'utf8'))
    .join('\n');
}
