// assistant-ui CheckpointHistory（MIT，归属见 LICENSE-assistant-ui.txt）的主题化副本。
// 官方版本用 tailwind + `paper` / `mono` 工具类；这里按仓库既有做法（FileTree / ErrorState）
// 改用 scoped CSS + `data-slot`，不引入 tailwind。
//
// 与官方的差异（都是刻意的）：
//   1. 没有 Restore：桌面端没有 checkpoint IPC，回滚只能由 agent 调 rollback_workspace（走审批），
//      给一个点了没用的按钮更糟，所以整块只读；
//   2. 保留官方的 current / ahead 样式能力，但接入方仅在有可靠状态时传入 currentId；
//   3. 标题可关：放进工具卡时行标题已经写了 “Listed checkpoints”，这里就不再重复一层 caption。
import React from 'react';
import './checkpoint-history.css';

export function CheckpointHistory({
  checkpoints = [],
  currentId = '',
  caption = 'Checkpoints',
  className = '',
  ...rest
}) {
  const currentIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === currentId);
  return (
    <div
      data-slot="checkpoint-history"
      className={['aui-checkpoint-history', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {caption ? <span className="aui-checkpoint-caption">{caption}</span> : null}
      {checkpoints.map((checkpoint, index) => {
        const current = currentIndex >= 0 && checkpoint.id === currentId;
        const ahead = currentIndex >= 0 && index > currentIndex;
        return (
          <div
            key={`${checkpoint.id}:${index}`}
            className={[
              'aui-checkpoint-row',
              current ? 'is-current' : '',
              ahead ? 'is-ahead' : '',
            ].filter(Boolean).join(' ')}
            data-checkpoint-id={checkpoint.id}
            data-current={current ? 'true' : 'false'}
          >
            <span aria-hidden="true" className="aui-checkpoint-dot" />
            <span className="aui-checkpoint-main">
              <span className="aui-checkpoint-label">{checkpoint.label}</span>
              <span className="aui-checkpoint-meta">
                {checkpoint.at ? `${checkpoint.at} · ` : ''}{checkpoint.files || 0} {checkpoint.files === 1 ? 'file' : 'files'}
              </span>
            </span>
            {current ? <span className="aui-checkpoint-current">current</span> : null}
          </div>
        );
      })}
    </div>
  );
}
