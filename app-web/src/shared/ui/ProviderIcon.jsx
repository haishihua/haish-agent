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
import { providerBrandForModel } from '../lib/provider-brand.js';

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

const JSX_LOGOS = { openai: OpenAILogo, anthropic: ClaudeLogo, gemini: GeminiLogo };
const COLOR_LOGOS = { deepseek: deepseekBrand, zhipu: zhipuBrand, siliconflow: siliconflowBrand };

// 这三张表就是「认得出哪些厂商」的唯一判据。表里没有的 provider——`custom` 中转站、
// 手填的路由 id——不算认出来：那类路由的显示名只写了中转站（`ai router-ds`），
// 真正跑的是谁家的模型只有 model id 知道（`deepseek-v4-flash`），所以按模型名再认一次。
function resolveBrandKey(provider, modelId) {
  const key = String(provider || '').trim().toLowerCase();
  if (PROVIDER_LOGOS[key] || JSX_LOGOS[key] || COLOR_LOGOS[key]) return key;
  return providerBrandForModel(modelId);
}

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

// 认不出来的厂商画中性方块：整个应用里只有这一处兜底，尺寸跟着容器走（见 app-shell.css
// 的 --settings-provider-glyph-size），画布节点那种 14px 的槽位不会再被 22px 的图标撑破。
function NeutralProviderIcon() {
  return (
    <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
      <AppIcon name="box" size={22} className="settings-provider-glyph" />
    </span>
  );
}

// `ai router-ds` 这类中转站看名字认人：取各段首字母（AR），和 chat 选择器一致。
function providerInitials(name) {
  return String(name || '').trim().split(/[\s_.-]+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'API';
}

// 三个入参分工不同：provider 是路由身份，modelId 只在路由认不出来时推断厂商，
// name 只给路由行用（画首字母），模型行不传——所以「ai router-ds」始终是中转站自己，
// 它下面的 deepseek-v4-flash 才是鲸鱼。
export function ProviderIcon({ provider, modelId, name, opticalSize }) {
  const brand = resolveBrandKey(provider, modelId);
  if (PROVIDER_LOGOS[brand]) return <BrandLogoIcon logo={PROVIDER_LOGOS[brand]} scaleKey={brand} opticalSize={opticalSize} />;
  return name
    ? <span className="settings-provider-icon settings-provider-initials" aria-hidden="true">{providerInitials(name)}</span>
    : <NeutralProviderIcon />;
}

// 彩色品牌标记：设置列表和模型选择器要能一眼认出厂商，所以用带色的 logo；
// 画布、运行配置那种跟文字同色的小标记用上面的 ProviderIcon（mask 剪影）。
export function ProviderBrandMark({ provider, name = '', modelId, opticalSize }) {
  // JSX 里小写的组件标签名会被当成 DOM 自定义元素而不是 React 组件，
  // 渲染成空壳——OpenAI/Anthropic/Gemini 的 logo 就是这么丢的。组件变量必须大写。
  const brand = resolveBrandKey(provider, modelId);
  const Logo = JSX_LOGOS[brand];
  // 有人把中转站的名字直接写成 siliconflow：带色标记按名字走。
  const colorLogo = COLOR_LOGOS[String(name).toLowerCase() === 'siliconflow' ? 'siliconflow' : brand];
  const size = providerLogoSize(brand || provider, opticalSize);
  const sized = size ? { width: size, height: size } : undefined;
  return (
    <span className="settings-brand" aria-hidden="true">
      {Logo ? <Logo style={sized} /> : colorLogo ? <img src={colorLogo} alt="" style={sized} /> : provider === 'custom' || !brand
        ? <span className="settings-initials">{providerInitials(name)}</span>
        : <ProviderIcon provider={brand} opticalSize={opticalSize} />}
    </span>
  );
}
