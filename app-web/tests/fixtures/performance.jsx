import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { ScrollToBottomButton } from '../../src/shared/ui/ScrollToBottomButton.jsx';
import '../../styles.css';

const history = Array.from({ length: 100 }, (_, index) => ({
  id: `history-${index}`, role: 'user', status: 'done',
  text: `## History ${index + 1}\n\n${'Historical content remains mounted and can be read while the task runs. '.repeat(12)}\n\n- One\n- Two\n- Three`,
}));

function Fixture() {
  const scrollRef = React.useRef(null);
  const [lines, setLines] = React.useState(1);
  const [streaming, setStreaming] = React.useState(false);
  React.useEffect(() => {
    if (!streaming) return undefined;
    const timer = setInterval(() => setLines((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, [streaming]);
  return <main style={{ width: 760, height: '90vh', margin: '20px auto', display: 'flex', flexDirection: 'column' }}>
    <button type="button" onClick={() => setStreaming((value) => !value)}>{streaming ? 'Pause output' : 'Stream output'}</button>
    <section className="chat-message-region" style={{ flex: 1 }}>
      <div className="chat-message-list" ref={scrollRef} style={{ height: '100%', overflowY: 'auto' }}>
        {history.map((message) => <ChatMessageRow key={message.id} message={message} />)}
        <div className="chat-message-row is-streaming" data-live-tail>
          <div className="chat-bubble" style={{ whiteSpace: 'pre-wrap' }}>{'Live output\n'.repeat(lines)}</div>
        </div>
      </div>
      <ScrollToBottomButton scrollRef={scrollRef} autoFollow />
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
