import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppToastStack } from '../../src/features/app/components/AppToast.jsx';
import '../../styles/base.css';
import '../../styles/modals.css';
function Demo() {
  const [toasts, setToasts] = useState([]);
  window.toastDemo = {
    show: (id, kind = 'success', message = 'Changes saved · 设置已保存') => setToasts(items => [...items.filter(item => item.id !== id), {id, kind, message}].slice(-3)),
    remove: id => setToasts(items => items.filter(item => item.id !== id)),
  };
  return <AppToastStack toasts={toasts} onDismiss={window.toastDemo.remove} />;
}
createRoot(document.getElementById('root')).render(<Demo />);
