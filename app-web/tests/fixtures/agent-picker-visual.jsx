import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { saveAgentAvatar } from '../../src/shared/lib/agent-avatars.js';
import '../../styles.css';

const options = [
  { id: 'a', label: 'Task Assistant', description: 'All-purpose assistant' },
  { id: 'b', label: 'Simple Agent', description: 'Simple assistant' },
  { id: 'c', label: 'Code Agent' },
];
saveAgentAvatar('a', 'penguin-01');
saveAgentAvatar('b', 'penguin-10');
function Fixture() {
  const [value, setValue] = React.useState('b');
  return <AppTooltipProvider><div className="chat-composer" style={{ position: 'absolute', bottom: 30, left: 50, width: 600, padding: 20 }}>
    <div className="chat-composer-actions"><div className="chat-composer-tools">
      <div className="approval-mode-picker"><button className="approval-mode-trigger" aria-label="Full Access"><span className="approval-mode-icon" data-approval-mode="full" style={{ maskImage: 'url("/assets/ui/icons/approval-full-bold.png")', WebkitMaskImage: 'url("/assets/ui/icons/approval-full-bold.png")' }} /></button></div>
      <AgentPicker value={value} options={options} onChange={setValue} />
    </div></div>
  </div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
