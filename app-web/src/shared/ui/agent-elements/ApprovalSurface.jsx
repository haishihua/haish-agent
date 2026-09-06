import React from 'react';
import './approval-surface.css';

// AICSS ApprovalCard presentation, composed around Haish's existing request controllers.
// Intentionally excludes the demo's auto-approval timer. See LICENSE-aicss.txt.
export function ApprovalSurface({ className = '', children, ...props }) {
  return <div {...props} className={`aicss-approval ${className}`}>{children}</div>;
}
