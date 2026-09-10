// Adapted from assistant-ui Elements computer-use (MIT); browser content slot.
import React from 'react';
import { Globe } from 'lucide-react';
import '../../../../styles/tool-elements.css';

export function ComputerUse({ url, children }) {
  return <section className="aui-computer-use" data-slot="computer-use" aria-label="Browser details">
    <div className="aui-browser-toolbar">
      <span className="aui-browser-lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="aui-browser-address"><Globe size={12} aria-hidden="true" /><span>{url || 'Browser'}</span></span>
    </div>
    <div className="aui-browser-screen">{children}</div>
  </section>;
}
