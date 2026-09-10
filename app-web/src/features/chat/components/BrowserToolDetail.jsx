import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ComputerUse } from '../../../shared/ui/agent-elements/ComputerUse.jsx';

export function BrowserToolDetail({ screenshot, url, code, stdout, stderr, error, taskId, running, failed: toolFailed, cancelled }) {
  const [image, setImage] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    setImage(null);
    setFailed(false);
    if (!screenshot) return undefined;
    const read = window.haish?.readToolScreenshot;
    if (!read || !taskId) { setFailed(true); return undefined; }
    read(screenshot, taskId).then((dataUrl) => {
      if (active) setImage({ screenshot, taskId, dataUrl });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [screenshot, taskId]);
  const failureMessage = toolFailed ? error || 'Browser action failed.' : '';
  const emptyMessage = cancelled ? 'Browser action cancelled.' : running ? 'Running browser action…'
    : !code && !screenshot ? 'No output returned.' : '';
  return <ComputerUse url={url}>
    {screenshot && (failed ? <p className="aui-browser-message" role="status">Screenshot unavailable. Tool output is available below.</p>
      : image?.screenshot === screenshot && image.taskId === taskId ? <img src={image.dataUrl} alt="Browser capture from this tool call" loading="lazy" onError={() => setFailed(true)} />
        : <p className="aui-browser-message" role="status">Loading screenshot…</p>)}
    <div className="aui-browser-details">
      {code && <details className="aui-browser-section" aria-label="Browser code">
        <summary className="aui-browser-section-label"><ChevronRight size={12} className="aui-tool-chevron" aria-hidden="true" />Code</summary>
        <pre className="aui-browser-code" tabIndex={0}>{code}</pre>
      </details>}
      {stdout && <details className="aui-browser-section" aria-label="Browser output">
        <summary className="aui-browser-section-label"><ChevronRight size={12} className="aui-tool-chevron" aria-hidden="true" />Output</summary>
        <pre className="aui-browser-output" tabIndex={0}>{stdout}</pre>
      </details>}
      {stderr && <section className="aui-browser-section is-stderr" aria-label="Browser standard error">
        <div className="aui-browser-section-label">Standard error</div>
        <pre className="aui-browser-output" tabIndex={0}>{stderr}</pre>
      </section>}
      {failureMessage && <p className="aui-browser-result is-error" role="status">{failureMessage}</p>}
      {!stdout && !stderr && !failureMessage && emptyMessage && <p className="aui-browser-result" role="status">{emptyMessage}</p>}
    </div>
  </ComputerUse>;
}
