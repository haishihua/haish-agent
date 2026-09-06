import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';

// Catch native title hints, including third-party controls and fullscreen portals.
export function NativeTitleTooltips() {
  const [active, setActive] = React.useState(null);
  const target = active?.target;

  React.useEffect(() => {
    const labels = new WeakMap();
    const activate = (event) => {
      const button = event.target.closest?.('[title], [data-native-tooltip]');
      if (!button || button.closest('[data-haish-tooltip-trigger], [role="tooltip"]')) return;
      const title = button.getAttribute('title');
      const text = title || labels.get(button);
      if (!text) return;
      labels.set(button, text);
      button.setAttribute('data-native-tooltip', '');
      button.removeAttribute('title');
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', text);
      setActive((previous) => previous?.target === button && previous.text === text
        ? previous : { target: button, text });
    };
    document.addEventListener('mouseover', activate, true);
    document.addEventListener('focusin', activate, true);
    return () => {
      document.removeEventListener('mouseover', activate, true);
      document.removeEventListener('focusin', activate, true);
    };
  }, []);

  React.useEffect(() => {
    if (!target) return undefined;
    // Copy state can change the title while the pointer remains on the button.
    const observer = new MutationObserver(() => {
      const title = target.getAttribute('title');
      if (!title) return;
      target.removeAttribute('title');
      setActive((previous) => previous?.target === target
        ? { ...previous, text: title } : previous);
    });
    observer.observe(target, { attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
  }, [target]);

  return active ? <PortalTooltip target={active.target} text={active.text} position="above" /> : null;
}
