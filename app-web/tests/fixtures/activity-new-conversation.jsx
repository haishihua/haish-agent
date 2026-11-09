import React from 'react';
import { createRoot } from 'react-dom/client';
import { ActivityView } from '../../src/features/conversations/components/ActivityView.jsx';
import { DraftProjectPicker } from '../../src/features/chat/components/DraftProjectPicker.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/panels.css';
import '../../styles/chat.css';

window.haish = {};
const initial = [
  { id: 'alpha', name: 'Alpha project', executionMode: 'chat', workspacePath: '/work/alpha', conversations: [] },
  { id: 'beta', name: 'Beta project', executionMode: 'chat', workspacePath: '/work/beta', conversations: [] },
];
function Fixture() {
  const [projects, setProjects] = React.useState(initial);
  const [selected, setSelected] = React.useState('alpha');
  const [draft, setDraft] = React.useState(false);
  const [text, setText] = React.useState('');
  const [mode, setMode] = React.useState('chat');
  return <AppTooltipProvider>
    <button type="button" id="existing" onClick={() => setDraft(false)}>Existing conversation</button>
    <button type="button" id="mode" onClick={() => setMode((value) => value === 'chat' ? 'bot' : 'chat')}>Switch mode</button>
    <div style={{ display: 'flex', height: 550, width: 900, gap: 12 }}>
      <aside className="conversations-panel" style={{ width: 280, paddingTop: 12 }}>
        <ActivityView mode={mode} projects={projects} workspaceProjects={projects} notices={{}}
          isDraftSelected={draft} onNewEntry={() => setDraft(true)} onSelect={() => {}} onPin={() => {}} onDeleteConversation={() => {}}
          onDeleteTask={() => {}} onOpenReport={() => {}} />
      </aside>
      <section className="chat-workspace" style={{ flex: 1 }}>
        <div className="chat-message-region">{draft ? 'Draft' : 'Existing'}</div>
        {draft && mode === 'chat' ? <DraftProjectPicker projects={projects} selectedId={selected} onSelect={setSelected}
          onAddProject={() => { setProjects((current) => [...current, { id: 'gamma', name: 'Gamma project', executionMode: 'chat', conversations: [] }]); setSelected('gamma'); }} /> : null}
        <div className="chat-composer"><textarea aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} /></div>
      </section>
    </div>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
