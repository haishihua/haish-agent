// Provider 品牌标记：settings 列表、chat 的模型选择器、workflow 的画布节点与运行配置
// 都显示同一个 provider 图标，实现只留这一份。
import React from 'react';
import { OpenAILogo, ClaudeLogo, GeminiLogo } from './settings-elements/assistant-ui/logos.tsx';
import deepseekBrand from '@lobehub/icons-static-svg/icons/deepseek-color.svg?inline';
import zhipuBrand from '@lobehub/icons-static-svg/icons/zhipu-color.svg?inline';
import siliconflowBrand from '@lobehub/icons-static-svg/icons/siliconcloud-color.svg?inline';
import anthropicLogo from '@lobehub/icons-static-svg/icons/anthropic.svg?inline';
import deepseekLogo from '@lobehub/icons-static-svg/icons/deepseek.svg?inline';
import geminiLogo from '@lobehub/icons-static-svg/icons/gemini.svg?inline';
import minimaxLogo from '@lobehub/icons-static-svg/icons/minimax.svg?inline';
import moonshotLogo from '@lobehub/icons-static-svg/icons/moonshot.svg?inline';
import ollamaLogo from '@lobehub/icons-static-svg/icons/ollama.svg?inline';
import openaiLogo from '@lobehub/icons-static-svg/icons/openai.svg?inline';
import qwenLogo from '@lobehub/icons-static-svg/icons/qwen.svg?inline';
import xaiLogo from '@lobehub/icons-static-svg/icons/xai.svg?inline';
import zhipuLogo from '@lobehub/icons-static-svg/icons/zhipu.svg?inline';
import { AppIcon } from './AppIcon.jsx';
import { providerLogoSize } from '../lib/provider-logo-metrics.js';

const PROVIDER_LOGOS = {
  openai: openaiLogo,
  xai: xaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  deepseek: deepseekLogo,
  dashscope: qwenLogo,
  moonshot: moonshotLogo,
  minimax: minimaxLogo,
  zhipu: zhipuLogo,
  ollama: ollamaLogo,
};

// Logos render through a CSS mask, so each file only needs an opaque silhouette.
export function BrandLogoIcon({ logo, scaleKey, opticalSize }) {
  if (!logo) return null;
  const size = providerLogoSize(scaleKey, opticalSize);
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <span className="settings-provider-logo" style={{ '--settings-provider-logo': `url("${logo}")`, ...(size ? { width: size, height: size } : {}) }} />
    </span>
  );
}

export function ProviderIcon({ provider, opticalSize }) {
  if (provider === 'custom') {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <AppIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  return <BrandLogoIcon logo={PROVIDER_LOGOS[provider]} scaleKey={provider} opticalSize={opticalSize} />;
}

// 彩色品牌标记：设置列表和模型选择器要能一眼认出厂商，所以用带色的 logo；
// 画布、运行配置那种跟文字同色的小标记用上面的 ProviderIcon（mask 剪影）。
export function ProviderBrandMark({ provider, name = '', opticalSize }) {
  // JSX 里小写的组件标签名会被当成 DOM 自定义元素而不是 React 组件，
  // 渲染成空壳——OpenAI/Anthropic/Gemini 的 logo 就是这么丢的。组件变量必须大写。
  const Logo = { openai: OpenAILogo, anthropic: ClaudeLogo, gemini: GeminiLogo }[provider];
  const brand = { deepseek: deepseekBrand, zhipu: zhipuBrand, siliconflow: siliconflowBrand }[
    String(name).toLowerCase() === 'siliconflow' ? 'siliconflow' : provider
  ];
  const size = providerLogoSize(provider, opticalSize);
  const sized = size ? { width: size, height: size } : undefined;
  return (
    <span className="settings-brand" aria-hidden="true">
      {Logo ? <Logo style={sized} /> : brand ? <img src={brand} alt="" style={sized} /> : provider === 'custom'
        ? <span className="settings-initials">{String(name).trim().split(/[\s_.-]+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'API'}</span>
        : <ProviderIcon provider={provider} opticalSize={opticalSize} />}
    </span>
  );
}
