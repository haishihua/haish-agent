import React from 'react';
import { Badge } from './settings-elements/ui/badge.tsx';

// Settings utilities are scoped, so the shared class also styles this badge
// when it appears in chat and workflow pickers outside the Settings surface.
export function ProviderAuthBadge({ label }) {
  return label ? <Badge variant="secondary" className="provider-auth-badge">{label}</Badge> : null;
}
