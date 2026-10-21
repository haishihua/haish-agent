import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { chatImagePreviewUrl } from '../../../shared/api/chat-image.js';
import { prefersReducedMotion } from '../../../shared/lib/reduced-motion.js';
import '../../../../styles/image-generate-tool.css';

// Generated images are revealed with img-fx (https://libraries.dev/image): a
// churning pixel mosaic that dissolves into the finished picture. The effect is
// code-split because it pulls in WebGL (three.js) and only ever runs for this
// one tool card.
const ImageGenerationEffect = lazy(
  () => import('img-fx').then((module) => ({ default: module.ImageGeneration })),
);
const PRESET = 'pixels-organic';
// If the effect never manages to show the picture (no WebGL, slow chunk, shader
// failure) the card falls back to the plain image instead of hiding it forever.
const FX_WATCHDOG_MS = 4000;
// The dissolve is a completion transition, not decoration: one play per image
// per session. Reopening a conversation must show the picture, not replay the
// animation, and must not pull the WebGL chunk again.
const REVEALED_SOURCES = new Set();

export function ImageGenerateToolDetail({ view, conversationId }) {
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

  const failed = Boolean(view?.failed);
  const cancelled = Boolean(view?.cancelled);
  const running = Boolean(view?.isRunning) && !failed && !cancelled;
  const alt = String(view?.task || '').trim() || 'Generated image';
  const previewUrl = chatImagePreviewUrl({ path: view?.generatedImagePath }, conversationId);
  const showEffect = !failed && (running || (Boolean(revealTarget) && !fxFailed));

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
    const image = new Image();
    image.onload = () => { if (active) setImageReady(true); };
    image.onerror = () => { if (active) setImageBroken(true); };
    image.src = previewUrl;
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
              : <img className="aui-imagegen-image" src={previewUrl} alt={alt} />
          }
        >
          <ImageGenerationEffect
            // Remount per target so the reveal starts from a cycle that already
            // knows the real image instead of inheriting the empty loading pool.
            key={running ? 'loading' : previewUrl}
            ref={effectRef}
            preset={PRESET}
            images={running ? undefined : [revealTarget || previewUrl]}
            className="aui-imagegen-frame"
          >
            {running
              ? <div className="aui-imagegen-loader" aria-hidden="true" />
              : <img className="aui-imagegen-image" src={previewUrl} alt={alt} />}
          </ImageGenerationEffect>
        </Suspense>
      ) : running ? (
        <div className="aui-imagegen-frame aui-imagegen-loader" aria-hidden="true" />
      ) : previewUrl && !imageBroken ? (
        <img className="aui-imagegen-image" src={previewUrl} alt={alt} />
      ) : imageBroken ? (
        <div className="aui-imagegen-frame aui-imagegen-broken" aria-hidden="true" />
      ) : null}
    </div>
  );
}
