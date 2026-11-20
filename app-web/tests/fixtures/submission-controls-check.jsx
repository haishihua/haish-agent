import React from 'react';
import { SendControls } from '../../src/features/chat/components/composer/SendControls.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
export function Check({ state }) {
  return <AppTooltipProvider><SendControls sendState={{ sendGate: { canSend: true, blockedReason: '' }, canSubmitPayload: true, sendBeamActive: true, ...state }} /></AppTooltipProvider>;
}
