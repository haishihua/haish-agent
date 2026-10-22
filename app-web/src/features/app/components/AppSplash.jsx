import React from 'react';

/**
 * 一次性加载（项目/会话同步）完成前：整屏只显示居中的 Haish logo
 * （呼吸光晕 + 光环脉冲动效），不渲染顶栏/侧边栏等任何其他 UI（参考设计稿）。
 * logo 资源路径由调用方给（保持打包器能直接看到这份 asset 引用）。
 */
export function AppSplash({ logoSrc }) {
  return (
    <div className="app-shell app-shell-loading">
      <div className="app-splash">
        <img
          className="app-splash-logo"
          src={logoSrc}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}
