import React, { Suspense, useEffect, useRef, useState } from 'react';
import { chatImagePreviewUrl } from '../../../shared/api/chat-image.js';
import {
  IMAGE_EFFECT_CARD_BG,
  IMAGE_EFFECT_PRESET,
  IMAGE_EFFECT_THEME,
  ImageGenerationEffect,
} from '../../../shared/lib/image-generation-effect.js';
import { prefersReducedMotion } from '../../../shared/lib/reduced-motion.js';
import { loadedChatImage, rememberLoadedChatImage } from '../../../shared/lib/chat-image-cache.js';
import '../../../../styles/image-generate-tool.css';

// 生成结果用 img-fx 的马赛克揭幕（preset / 主题常量在 shared/lib/image-generation-effect.js，
// 最终回答里的图片在用同一套）：WebGL chunk 懒加载，只在真的需要时拉下来。
const PRESET = IMAGE_EFFECT_PRESET;
const EFFECT_THEME = IMAGE_EFFECT_THEME;
const EFFECT_CARD_BG = IMAGE_EFFECT_CARD_BG;
// If the effect never manages to show the picture (no WebGL, slow chunk, shader
// failure) the card falls back to the plain image instead of hiding it forever.
const FX_WATCHDOG_MS = 4000;
// The dissolve is a completion transition, not decoration: one play per image
// per session. Reopening a conversation must show the picture, not replay the
// animation, and must not pull the WebGL chunk again.
const REVEALED_SOURCES = new Set();

export function ImageGenerateToolDetail({ view, conversationId, onPreviewImage }) {
  const effectRef = useRef(null);
  const [imageReady, setImageReady] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [fxFailed, setFxFailed] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  // Captured once: only a card that watched the request run may animate the
  // result. A card mounted on an already-finished call is history, not news.
  const [watchedRun] = useState(() => Boolean(view?.isRunning));
  // Sticky: once this card owns the dissolve, later re-renders of the same
  // message must not tear the animation down.
  const [revealTarget, setRevealTarget] = useState('');
  const markImageBroken = () => {
    setImageReady(false);
    setImageBroken(true);
  };

  const failed = Boolean(view?.failed);
  const cancelled = Boolean(view?.cancelled);
  const running = Boolean(view?.isRunning) && !failed && !cancelled;
  const alt = String(view?.task || '').trim() || 'Generated image';
  const imagePath = String(view?.generatedImagePath || '');
  const previewUrl = chatImagePreviewUrl({ path: imagePath }, conversationId);
  const showEffect = !failed && !imageBroken && (running || (Boolean(revealTarget) && !fxFailed));
  const canPreview = Boolean(previewUrl) && !running && !failed && !imageBroken && typeof onPreviewImage === 'function';
  const openPreview = () => {
    if (!canPreview) return;
    onPreviewImage({ src: previewUrl, title: alt });
  };

  // Claim the one allowed play for this image, then keep it for the lifetime of
  // the card. A reopen (or a re-render) never claims again.
  useEffect(() => {
    if (!previewUrl || !watchedRun || reducedMotion || fxFailed) return;
    if (REVEALED_SOURCES.has(previewUrl)) return;
    REVEALED_SOURCES.add(previewUrl);
    setRevealTarget(previewUrl);
  }, [previewUrl, watchedRun, reducedMotion, fxFailed]);

  useEffect(() => {
    if (!previewUrl) {
      setImageReady(false);
      setImageBroken(false);
      return undefined;
    }
    let active = true;
    setImageBroken(false);
    const cached = loadedChatImage(previewUrl);
    setImageReady(Boolean(cached));
    if (cached) return undefined;
    const image = new Image();
    const ready = () => {
      void rememberLoadedChatImage(previewUrl, image);
      if (active) setImageReady(true);
    };
    image.onload = ready;
    image.onerror = () => { if (active) setImageBroken(true); };
    image.src = previewUrl;
    if (image.complete && image.naturalWidth > 0) ready();
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [previewUrl]);

  // Reveal once and hold: the finished picture must stay on screen, so the
  // auto-reveal loop (which fades back to the shader) is not used. The retries
  // cover the code-split chunk arriving after the image did.
  useEffect(() => {
    if (!revealTarget || !imageReady) return undefined;
    const reveal = () => effectRef.current?.triggerReveal?.({ hold: 'manual' });
    reveal();
    const retries = [setTimeout(reveal, 250), setTimeout(reveal, 900)];
    const watchdog = setTimeout(() => {
      if (!effectRef.current?.isImageActive?.()) setFxFailed(true);
    }, FX_WATCHDOG_MS);
    return () => {
      retries.forEach(clearTimeout);
      clearTimeout(watchdog);
    };
  }, [revealTarget, imageReady]);

  return (
    <div className="aui-imagegen">
      {failed ? (
        <p className="aui-imagegen-error">{view?.error || 'The image could not be generated.'}</p>
      ) : showEffect ? (
        <Suspense
          fallback={
            running
              ? <div className="aui-imagegen-frame" aria-hidden="true" />
              : <img className="aui-imagegen-image" src={previewUrl} alt={alt} onError={markImageBroken} onClick={canPreview ? openPreview : undefined} data-previewable={canPreview ? 'true' : undefined} />
          }
        >
          <ImageGenerationEffect
            // Remount per target so the reveal starts from a cycle that already
            // knows the real image instead of inheriting the empty loading pool.
            key={running ? 'loading' : previewUrl}
            ref={effectRef}
            preset={PRESET}
            theme={EFFECT_THEME}
            cardBg={EFFECT_CARD_BG}
            images={running ? undefined : [revealTarget || previewUrl]}
            className="aui-imagegen-frame"
            onClick={canPreview ? openPreview : undefined}
            onKeyDown={canPreview ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              openPreview();
            } : undefined}
            role={canPreview ? 'button' : undefined}
            tabIndex={canPreview ? 0 : undefined}
            aria-label={canPreview ? (alt || 'Preview generated image') : undefined}
            data-previewable={canPreview ? 'true' : undefined}
          >
            {running
              ? <div className="aui-imagegen-loader" aria-hidden="true" />
              : <img className="aui-imagegen-image" src={previewUrl} alt={alt} onError={markImageBroken} />}
          </ImageGenerationEffect>
        </Suspense>
      ) : running ? (
        <div className="aui-imagegen-frame aui-imagegen-loader" aria-hidden="true" />
      ) : previewUrl && !imageBroken ? (
        <img className="aui-imagegen-image" src={previewUrl} alt={alt} onError={markImageBroken} onClick={canPreview ? openPreview : undefined} data-previewable={canPreview ? 'true' : undefined} />
      ) : imagePath ? (
        <p className="aui-imagegen-path">{imagePath}</p>
      ) : null}
    </div>
  );
}
