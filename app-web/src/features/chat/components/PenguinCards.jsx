import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import relax from '../../../../assets/ui/empty-state/penguin-relax-smooth.png';
import sleepy from '../../../../assets/ui/empty-state/penguin-sleepy-smooth.png';
import hug from '../../../../assets/ui/empty-state/penguin-hug-smooth.png';
import relaxPlate from '../../../../assets/ui/empty-state/penguin-relax-plate.png';
import sleepyPlate from '../../../../assets/ui/empty-state/penguin-sleepy-plate.png';
import hugPlate from '../../../../assets/ui/empty-state/penguin-hug-plate.png';

// ponytail: these black/cream assets use green solely as a removable backdrop.
const CARDS = [
  { id: 'primary', name: 'sleepy', sprite: sleepy, plate: sleepyPlate },
  { id: 'secondary', name: 'relax', sprite: relax, plate: relaxPlate },
  { id: 'tertiary', name: 'hug', sprite: hug, plate: hugPlate },
];

export function PenguinCards() {
  const [active, setActive] = React.useState(null);
  const [delay, setDelay] = React.useState(0);
  const id = React.useId();
  const timer = React.useRef(null);
  const stage = React.useRef(null);
  const cancel = () => window.clearTimeout(timer.current);
  const reset = () => { cancel(); setActive(null); };
  React.useEffect(() => {
    const dismissOutside = (event) => {
      if (!stage.current?.contains(event.target)) {
        window.clearTimeout(timer.current);
        setActive(null);
      }
    };
    // Observers only: returning to work must not swallow clicks, focus, or typing.
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('input', dismissOutside);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('input', dismissOutside);
    };
  }, []);
  React.useEffect(() => {
    const sprites = stage.current.querySelectorAll('svg');
    return () => sprites.forEach((sprite) => sprite.getAnimations().forEach((animation) => animation.cancel()));
  }, [active]);

  function activate(card) {
    cancel();
    if (card === active) return;
    setDelay(active ? 220 : 0);
    setActive(card);
  }

  function hover(event, card) {
    if (event.pointerType === 'touch') return;
    cancel();
    if (card === active) return;
    timer.current = window.setTimeout(() => activate(card), 180);
  }

  function react(event, card) {
    activate(card.id);
    if (active !== card.id || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // ponytail: whole-sprite gestures use native animation; no rig or animation dependency.
    const sprite = event.currentTarget.querySelector('svg');
    sprite.getAnimations().forEach((animation) => animation.cancel());
    const poses = {
      relax: ['none', 'scale(1.04, .94)', 'translate(-5px, -11px) rotate(-6deg)', 'scale(1.03, .96)', 'translate(5px, -9px) rotate(6deg)', 'scale(1.02, .97)', 'none'],
      hug: ['none', 'scale(1.06, .92)', 'translateY(-16px) scale(.98, 1.03)', 'scale(1.05, .94)', 'rotate(-5deg)', 'none'],
      sleepy: ['none', 'rotate(-8deg)', 'rotate(7deg)', 'rotate(-5deg)', 'rotate(3deg)', 'rotate(-1deg)', 'none'],
    };
    sprite.animate(poses[card.name].map((transform) => ({ transform })), {
      duration: card.name === 'sleepy' ? 1400 : 850, easing: 'ease-in-out',
    });
  }

  return (
    <div ref={stage} className="chat-empty-illustration" style={{ '--penguin-delay': `${delay}ms` }}
      onKeyDown={(event) => { if (event.key === 'Escape') reset(); }}>
      {CARDS.map((card) => (
        <button key={card.id} type="button"
          className={`chat-empty-card chat-empty-card-${card.id}${active === card.id ? ' is-greeting' : ''}`}
          aria-label={`Say hello to the ${card.name} penguin`} aria-pressed={active === card.id}
          onPointerEnter={(event) => hover(event, card.id)}
          onPointerLeave={cancel}
          onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) activate(card.id); }}
          onClick={(event) => react(event, card)}>
          <img className="chat-empty-card-original" src={`/assets/ui/empty-state/penguin-${card.name}-card.png`} alt="" draggable="false" />
          {/* Only the character region is replaced; original lettering never disappears. */}
          <img className="chat-empty-card-paper" src={card.plate} alt="" draggable="false" />
          <PortalTooltip text="Click to play" position="above">
          <span className="chat-empty-penguin" aria-hidden="true">
            <svg viewBox="0 0 1086 1448" focusable="false">
              <defs>
                <filter id={`${id}-${card.id}-alpha`} colorInterpolationFilters="sRGB">
                  {/* Key green to alpha and remove green spill without touching the silhouette. */}
                  <feColorMatrix type="matrix" values="1 0 0 0 0  .5 0 .5 0 0  0 0 1 0 0  3 -3 0 0 1" />
                </filter>
              </defs>
              <image href={card.sprite} width="1086" height="1448" filter={`url(#${id}-${card.id}-alpha)`} />
            </svg>
          </span>
          </PortalTooltip>
        </button>
      ))}
    </div>
  );
}
