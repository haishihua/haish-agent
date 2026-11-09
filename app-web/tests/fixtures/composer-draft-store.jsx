import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

// 不传 draft/onDraftChange，确保经过真实应用的未受控接线，而不是夹具自行接管草稿。
function Fixture() {
  const [conversationId, setConversationId] = React.useState('fixture-draft-a');
  return <AppTooltipProvider>
    <button id="switch-a" type="button" onClick={() => setConversationId('fixture-draft-a')}>A</button>
    <button id="switch-b" type="button" onClick={() => setConversationId('fixture-draft-b')}>B</button>
    <ChatPanel conversationId={conversationId} messages={[]} providerOptions={[]} />
  </AppTooltipProvider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
