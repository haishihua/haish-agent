// @haish-esm
import React from 'react';
import { NAV_ICONS } from './shared-constants.jsx';

export const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agents', label: 'Agents' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'system', label: 'System' },
];

export function BottomNav({ active, onChange }) {
  return (
    <div className="app-bottomnav">
      {NAV_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`nav-item ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="nav-icon">{NAV_ICONS[tab.id]}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TabPlaceholder({ name }) {
  return (
    <div className="tab-placeholder">
      <div className="ph-title">{name.toUpperCase()}</div>
      <div className="ph-sub">Coming soon</div>
    </div>
  );
}
