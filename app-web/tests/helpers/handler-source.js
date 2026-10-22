import fs from 'node:fs';

// 「同一实现」的多份源码按序拼接：主文件在前，其余模块按调用顺序，用换行连接。
const SOURCE_ROOT = new URL('../../src/', import.meta.url);

function readCluster(relativePaths) {
  return relativePaths
    .map((relativePath) => fs.readFileSync(new URL(relativePath, SOURCE_ROOT), 'utf8'))
    .join('\n');
}

export function taskStreamHandlerSource() {
  return readCluster([
    'features/tasks/hooks/createTaskStreamHandlers.js',
    'features/tasks/hooks/task-stream/event-dispatch.js',
    'features/tasks/hooks/task-stream/run-events.js',
    'features/tasks/hooks/task-stream/text-block.js',
    'features/tasks/hooks/task-stream/tool-events.js',
    'features/tasks/hooks/task-stream/workflow-events.js',
    'features/tasks/hooks/task-stream/task-events.js',
    'features/tasks/hooks/task-stream/recovery.js',
    'features/tasks/hooks/task-stream/quest-execution.js',
  ]);
}

export function conversationHandlerSource() {
  return readCluster([
    'features/conversations/hooks/createConversationHandlers.js',
    'features/conversations/hooks/conversation-handlers/restore.js',
    'features/conversations/hooks/conversation-handlers/crud.js',
    'features/conversations/hooks/conversation-handlers/messages.js',
  ]);
}
