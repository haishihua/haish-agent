import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatTodoPanel } from '../../src/features/chat/components/ChatTimelineNodes.jsx';
import '../../styles.css';

const labels = ['Scaffold the project structure', 'Build the component registry', 'Implement entitlement gating', 'Wire up Stripe checkout', 'Polish the landing page'];
function Fixture() {
  const [step, setStep] = React.useState(3);
  const todos = labels.map((content, index) => ({ id: String(index), content, status: index < step ? 'completed' : index === step ? 'in_progress' : 'pending' }));
  return <main style={{ padding: 24, maxWidth: 440, fontFamily: 'Arial, sans-serif' }}>
    <h2>Running / completed</h2>
    <button onClick={() => setStep((value) => (value + 1) % 6)}>Next state</button>
    <ChatTodoPanel todos={todos} streaming={step < 5} />
    <hr />
    <ChatTodoPanel todos={labels.map((content) => ({ content, status: 'completed' }))} />
    <hr />
    <ChatTodoPanel todos={[{ content: '核对 original_file_key / file_key / text_file_key 含义', status: 'in_progress' }, { content: '按原始文件重排借款/委托各 5 条 originalFileKey', status: 'pending' }]} streaming />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
