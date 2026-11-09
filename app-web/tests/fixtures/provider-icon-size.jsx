import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProviderIcon, SettingsRow } from '../../src/features/settings/components/SettingsPrimitives.jsx';
import '../../styles.css';

// 同时验证设置列表和输入框模型选择器的真实组件及 CSS。
function Fixture() {
  return <>
    <div className="settings-theme" id="settings-icons">
      {['openai', 'deepseek', 'xai'].map((provider) => <div key={provider} data-provider={provider}>
        <SettingsRow title={provider} description="model" icon={<ProviderIcon provider={provider} />} />
      </div>)}
    </div>
    <div className="chat-composer" id="picker-icons">
      {['openai', 'deepseek', 'xai'].map((provider) => <span className="model-picker-option-glyph" key={provider} data-provider={provider}>
        <ProviderIcon provider={provider} opticalSize={16} />
      </span>)}
    </div>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
await new Promise((resolve) => setTimeout(resolve, 200));
const measure = (container, provider, selector) => {
  const element = document.querySelector(`#${container} [data-provider="${provider}"] ${selector}`);
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
};
const values = {
  settingsOpenai: measure('settings-icons', 'openai', 'svg'),
  settingsDeepseek: measure('settings-icons', 'deepseek', 'img'),
  settingsXai: measure('settings-icons', 'xai', '.settings-provider-logo'),
  pickerOpenai: measure('picker-icons', 'openai', 'svg'),
  pickerDeepseek: measure('picker-icons', 'deepseek', 'img'),
  pickerXai: measure('picker-icons', 'xai', '.settings-provider-logo'),
};
const centered = (container) => {
  const logo = document.querySelector(`#${container} [data-provider="xai"] .settings-provider-logo`);
  const slot = document.querySelector(`#${container} [data-provider="xai"] .settings-provider-icon`);
  const markRect = logo.getBoundingClientRect();
  const slotRect = slot.getBoundingClientRect();
  return Math.abs((markRect.left + markRect.right) - (slotRect.left + slotRect.right)) < 2
    && Math.abs((markRect.top + markRect.bottom) - (slotRect.top + slotRect.bottom)) < 2;
};
const pass = values.settingsOpenai === 22 && values.settingsDeepseek === 22 && values.settingsXai === 18
  && values.pickerOpenai === 16 && values.pickerDeepseek === 16 && values.pickerXai === 13
  && centered('settings-icons') && centered('picker-icons');
const output = document.getElementById('result');
output.dataset.result = pass ? 'pass' : 'fail';
output.textContent = `${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(values)}`;
