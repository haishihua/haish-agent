/**
 * SegmentedControl for the web, framework free, from dissolve (dissolve-ui). This file is yours.
 * The React component (segmented-control.tsx) wraps it; it also runs on its own:
 *
 *   const c = createSegmentedControl(el, { segments: ['Day', 'Week', 'Month'], onChange: setPeriod });
 *
 * An iOS style segmented control whose selection pill is made of grains. At rest it is a clean
 * solid capsule with the soft iOS shadow. Pick another segment and the pill breaks into grains,
 * leading edge first: they flow to the new segment on a slight arc, shrinking mid flight, and
 * reassemble into the pill there (about 400 ms). The labels cross fade along the way. Drag across
 * the control and the selection follows, the grains re-aiming from wherever they are. The pill and
 * the labels are DOM, the grains a canvas over the track. Reduced motion: the pill simply slides.
 * Colors follow --dissolve-foreground, --dissolve-background and --dissolve-muted.
 */
import { bezier, CALM, clamp, el, hash, injectStyle, loop, onThemeChange, propsOf, reducedMotion, rgbOf, scope, token, vibrate } from './kit';

export type SegmentItem = {
  /** Value passed to onChange and matched against value / defaultValue. */
  value: string;
  /** Shown text. Default: the value. Empty shows the icon alone. */
  label?: string;
  ariaLabel?: string;
};

export const SEGMENTED_SIZES = {
  sm: { height: 30, inset: 2, font: 13, icon: 13, gap: 5 },
  md: { height: 36, inset: 3, font: 14, icon: 15, gap: 6 },
  lg: { height: 44, inset: 4, font: 15, icon: 17, gap: 7 },
} as const;

export type SegmentedControlSize = keyof typeof SEGMENTED_SIZES;

export type SegmentedControlProps = {
  /** The segments: plain strings, or items with a value and a label. Two or more. */
  segments?: (string | SegmentItem)[];
  /** Selected value (controlled). */
  value?: string;
  /** Initial value when uncontrolled. Default: the first segment. */
  defaultValue?: string;
  /** Called on every selection change, also while dragging across the segments. */
  onChange?: (value: string, index: number) => void;
  /** Height, inset and type size: 30, 36 or 44 px. Default 'md'. */
  size?: SegmentedControlSize;
  /** A short vibration on every change, where the browser has it. Default true. */
  haptics?: boolean;
  /** No selection, the control shows at half opacity. Default false. */
  disabled?: boolean;
  /** Track fill. Default: the foreground token at a low alpha, so it sits on any background. */
  trackColor?: string;
  /** Pill and grain color. Default: the background token in light mode, a lifted gray in dark mode. */
  indicatorColor?: string;
  /** Label classes (tracking, font...). The colors come from the theme tokens. */
  labelClassName?: string;
  /** Use native button activation rather than changing selection on drag. */
  clickOnly?: boolean;
};

export type SegmentedControlInstance = {
  /**
   * The icon box of segment i, in its selected (on) or unselected (off) label, hidden while empty.
   * Draw the icon in currentColor: each label sets its own color.
   */
  icon: (i: number, on: boolean) => HTMLElement;
  update: (props: Partial<SegmentedControlProps>) => void;
  destroy: () => void;
};

const DEFAULTS = { segments: [] as (string | SegmentItem)[], size: 'md' as SegmentedControlSize, haptics: true, disabled: false };

/** Grains leave over STAGGER (leading edge first), each flies for RUN. */
const STAGGER = 110;
const RUN = 290;
/** The old pill fades under the grains as they break off. */
const GHOST_OUT = 90;
/** The new pill fades in under the grains as they land, then the grains fade off it. */
const PILL_AT = 280;
const PILL_IN = 100;
const FADE_AT = 340;
const FADE = 80;
const LABELS = 360;
const END = FADE_AT + FADE;
/** Reduced motion: a plain slide. */
const SLIDE = 260;
/** Mid flight, grains shrink to this share of their size. */
const SHRINK = 0.55;
/** Sideways scatter of a grain mid flight, in px. */
const SCATTER = 8;
/** Grain pool, and the grid pitch as a share of the pill height. */
const MAX_GRAINS = 180;
const PITCH = 0.14;
/** Grains overlap their neighbours at rest, so the cloud reads as one solid pill. */
const OVERLAP = 1.22;
/** Room around the track for the grains that arc out of it. */
const PAD = 12;
const SHADOW = '0 3px 8px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.04), 0 0 0 0.5px rgba(0, 0, 0, 0.04)';

/** Leaves fast, lands soft: grains break off with a little intent instead of jumping. */
const FLOW = bezier(0.42, 0, 0.12, 1);

const norm = (s: string | SegmentItem): SegmentItem => (typeof s === 'string' ? { value: s } : s);
/** Arc height in px for a pill segment of width w: grains bow out a little more on longer trips. */
const arcOf = (w: number) => Math.min(7, 3 + w * 0.03);

/** Grid points inside the pill capsule: x y (from the pill's left top), arc, delay seed. */
function grainGrid(w: number, h: number) {
  let pitch = Math.max(4, h * PITCH);
  for (;;) {
    const cols = Math.max(2, Math.round(w / pitch)), rows = Math.max(2, Math.round(h / pitch));
    const px = w / cols, py = h / rows, r = h / 2, out: [number, number, number, number][] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * px, y = (j + 0.5) * py;
      // Inside the capsule, a little in from its rounded ends.
      const dx = Math.max(0, Math.abs(x - w / 2) - (w / 2 - r)), dy = y - r;
      if (dx * dx + dy * dy > (r - Math.min(px, py) * 0.3) ** 2) continue;
      const k = out.length;
      // Top rows arc up, bottom rows down: the cloud breathes open in flight, then closes.
      out.push([x, y, ((y - r) / r) * 0.8 + (hash(k, 3) - 0.5) * 0.7, hash(k, 4)]);
    }
    if (out.length <= MAX_GRAINS) return { grid: out, dot: Math.max(px, py) * OVERLAP };
    pitch *= 1.15;
  }
}

/** Segment buttons are form controls: page resets beat :where(), so their look is inline. */
const BUTTON: Partial<CSSStyleDeclaration> = {
  position: 'relative', flex: '1', minWidth: '0', border: '0', padding: '0', margin: '0', background: 'none',
  cursor: 'inherit', font: 'inherit', color: 'inherit', outline: 'none', borderRadius: '999px',
};

const CSS = `
:where([data-dissolve="segmented-control"]) { -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
:where(.dissolve-segmented-pill) { position: absolute; left: 0; will-change: transform, opacity; pointer-events: none; }
:where(.dissolve-segmented-grains) { position: absolute; pointer-events: none; }
:where(.dissolve-segmented-row) { position: absolute; inset: 0; display: flex; }
:where(.dissolve-segmented-tab:focus-visible) { box-shadow: inset 0 0 0 2px var(--dissolve-accent, rgb(10 132 255)); }
:where(.dissolve-segmented-label) {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 8px;
  letter-spacing: -0.011em; white-space: nowrap; line-height: 1;
}
:where(.dissolve-segmented-label) > span { overflow: hidden; text-overflow: ellipsis; }
:where(.dissolve-segmented-icon) { display: block; flex: none; }
:where(.dissolve-segmented-icon:empty) { display: none; }
:where(.dissolve-segmented-icon) svg { display: block; width: 100%; height: 100%; }
:where(.dissolve-segmented-off) { color: var(--dissolve-muted, rgb(142 142 147)); font-weight: 500; }
:where(.dissolve-segmented-on) { color: var(--dissolve-foreground, rgb(28 28 30)); font-weight: 600; }
`;

type Tab = { b: HTMLButtonElement; off: HTMLElement; on: HTMLElement; icons: [HTMLElement, HTMLElement]; texts: [HTMLElement, HTMLElement] };

export function createSegmentedControl(host: HTMLElement, initial: SegmentedControlProps = {}): SegmentedControlInstance {
  injectStyle('dissolve-segmented-control', CSS);
  const props = propsOf(DEFAULTS, initial);
  const p = () => props.current;
  const sc = scope();

  host.dataset.dissolve = 'segmented-control';
  host.setAttribute('role', 'tablist');
  Object.assign(host.style, { position: 'relative', borderRadius: '999px', touchAction: 'pan-y', cursor: 'pointer' });

  const mkPill = () => el('div', 'dissolve-segmented-pill');
  const ghost = mkPill(), pill = mkPill();
  const cv = el('canvas', 'dissolve-segmented-grains');
  const ctx = cv.getContext('2d')!;
  const row = el('div', 'dissolve-segmented-row');
  // The pill is placed by layout() only, never transitioned: a page wide `transition` rule would
  // otherwise slide it in from the left on its first placement. Hidden until it has a size.
  for (const box of [ghost, pill]) {
    box.style.setProperty('transition', 'none', 'important');
    box.style.visibility = 'hidden';
  }
  host.append(ghost, pill, cv, row);

  /** Segment nodes by index, made on demand so the icon boxes exist before the segments do. */
  const pool: Tab[] = [];
  const tabAt = (i: number) => {
    if (pool[i]) return pool[i];
    const b = el('button', 'dissolve-segmented-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    Object.assign(b.style, BUTTON);
    const layer = (cls: string) => {
      const box = el('span', `dissolve-segmented-label ${cls}`), icon = el('i', 'dissolve-segmented-icon'), text = el('span');
      icon.setAttribute('aria-hidden', 'true');
      box.append(icon, text);
      b.append(box);
      return [box, icon, text];
    };
    const [off, offIcon, offText] = layer('dissolve-segmented-off');
    const [on, onIcon, onText] = layer('dissolve-segmented-on');
    b.addEventListener('click', (e) => { if (p().clickOnly || e.detail === 0) select(pool.indexOf(tab)); });
    const tab: Tab = { b, off, on, icons: [offIcon, onIcon], texts: [offText, onText] };
    return (pool[i] = tab);
  };

  let items: SegmentItem[] = [];
  let n = 1;
  const indexOf = (v: string | undefined) => Math.max(0, items.findIndex((it) => it.value === v));

  // Geometry, from the track width.
  let W = 0, H = 0, seg = 0, ph = 0, inset = 0, dpr = 1;
  let grid: [number, number, number, number][] = [], dot = 0, N = 0;
  let D = new Float32Array(0), F = new Float32Array(0);

  // Same state as the frame callback of the native source.
  let L: number[] = [], LF: number[] = [];
  let target = 0, req = false, flying = false, startAt = 0;
  let pillX = 0, pillA = 1, ghostX = 0, ghostA = 0, ghostA0 = 0, slideFrom = 0;
  let pillColor = '#fff';

  const apply = () => {
    pill.style.transform = `translateX(${pillX}px)`;
    pill.style.opacity = String(pillA);
    ghost.style.transform = `translateX(${ghostX}px)`;
    ghost.style.opacity = String(ghostA);
    for (let i = 0; i < n; i++) { pool[i].on.style.opacity = String(L[i]); pool[i].off.style.opacity = String(1 - L[i]); }
  };

  function paint() {
    const o = p();
    const bg = rgbOf(token(host, 'background', 'rgb(255 255 255)')), fg = rgbOf(token(host, 'foreground', 'rgb(28 28 30)'));
    const dark = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 < 0.5;
    const lift = (k: number) => `rgb(${[0, 1, 2].map((c) => Math.round(bg[c] + (fg[c] - bg[c]) * k)).join(',')})`;
    host.style.background = o.trackColor ?? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${dark ? 0.14 : 0.075})`;
    pillColor = o.indicatorColor ?? lift(dark ? 0.3 : 0);
    ghost.style.background = pill.style.background = pillColor;
    ghost.style.boxShadow = pill.style.boxShadow = dark ? '' : SHADOW;
  }

  /** Builds the segments for the current items and size. */
  function build() {
    const o = p(), s = SEGMENTED_SIZES[o.size] ?? SEGMENTED_SIZES.md;
    items = o.segments.map(norm);
    n = Math.max(1, items.length);
    inset = s.inset;
    host.style.height = s.height + 'px';
    row.style.padding = `0 ${s.inset}px`;
    row.replaceChildren();
    items.forEach((it, i) => {
      const t = tabAt(i), label = it.label ?? it.value;
      t.b.setAttribute('aria-label', it.ariaLabel ?? label);
      t.b.title = it.ariaLabel ?? label;
      for (const box of [t.off, t.on]) { box.style.gap = s.gap + 'px'; box.style.fontSize = s.font + 'px'; }
      for (const icon of t.icons) { icon.style.width = icon.style.height = s.icon + 'px'; }
      for (const text of t.texts) {
        text.textContent = label;
        text.hidden = !label;
        text.className = o.labelClassName ?? '';
      }
      row.append(t.b);
    });
  }

  /** Lays the pill and the grains out for the track width, and snaps to the selection. */
  function layout() {
    W = host.clientWidth;
    H = (SEGMENTED_SIZES[p().size] ?? SEGMENTED_SIZES.md).height;
    seg = (W - inset * 2) / n;
    ph = H - inset * 2;
    if (seg <= 0 || ph <= 0) return;
    ({ grid, dot } = grainGrid(seg, ph));
    N = grid.length;
    D = new Float32Array(N * 4);
    F = new Float32Array(N * 4);
    for (const box of [ghost, pill]) Object.assign(box.style, { width: seg + 'px', height: ph + 'px', top: inset + 'px', borderRadius: ph / 2 + 'px', visibility: '' });
    dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = Math.round((W + PAD * 2) * dpr);
    cv.height = Math.round((H + PAD * 2) * dpr);
    cv.style.cssText = `left:${-PAD}px;top:${-PAD}px;width:${W + PAD * 2}px;height:${H + PAD * 2}px`;
    // Snap: no flight on first layout or a resize.
    flying = req = false;
    L = items.map((_, i) => (i === target ? 1 : 0));
    LF = L.slice();
    pillX = inset + target * seg;
    pillA = 1;
    ghostA = 0;
    apply();
  }

  function frame(now: number) {
    if (!req && !flying) return;
    if (seg <= 0) { req = flying = false; return; }
    const reduced = reducedMotion(), b = target, toX = inset + b * seg, CW = W + PAD * 2, CH = H + PAD * 2;
    if (req) {
      req = false;
      // Start (or re-aim) the flight from wherever everything is right now.
      for (let i = 0; i < n; i++) LF[i] = L[i];
      if (flying && !reduced) F.set(D);
      else for (let i = 0; i < N; i++) { F[i * 4] = pillX + grid[i][0]; F[i * 4 + 1] = inset + grid[i][1]; F[i * 4 + 2] = 1; F[i * 4 + 3] = 1; }
      ghostX = pillX;
      ghostA0 = pillA;
      slideFrom = pillX;
      startAt = now;
      flying = true;
      if (!reduced) { pillX = toX; pillA = 0; }
    }
    const since = now - startAt;
    const lk = FLOW(clamp(since / (reduced ? SLIDE : LABELS)));
    for (let i = 0; i < n; i++) L[i] = LF[i] + ((i === b ? 1 : 0) - LF[i]) * lk;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    if (reduced) {
      pillX = slideFrom + (toX - slideFrom) * CALM(clamp(since / SLIDE));
      pillA = 1;
      ghostA = 0;
      if (since >= SLIDE) flying = false;
      return apply();
    }
    // Leading edge first: the grains at the front of the pill (in the travel direction) leave first.
    const dir = toX >= ghostX ? 1 : -1;
    const reach = Math.min(1, Math.abs(toX - ghostX) / seg);
    const arcAmp = arcOf(seg) * (0.55 + 0.45 * reach);
    const out = clamp((since - FADE_AT) / FADE);
    ctx.fillStyle = pillColor;
    for (let i = 0; i < N; i++) {
      const g = grid[i], d = i * 4;
      const u = g[0] / seg, lead = dir > 0 ? u : 1 - u;
      const delay = (1 - lead) * STAGGER * 0.6 + g[3] * STAGGER * 0.4;
      const run = RUN * (0.85 + 0.3 * hash(i, 9));
      const e = FLOW(clamp((since - delay) / run)), bump = Math.sin(Math.PI * e);
      const tx = toX + g[0], ty = inset + g[1];
      // A little sideways scatter mid flight, so the grains never read as a moving lattice.
      D[d] = F[d] + (tx - F[d]) * e + (hash(i, 5) - 0.5) * SCATTER * bump;
      D[d + 1] = F[d + 1] + (ty - F[d + 1]) * e + g[2] * arcAmp * bump;
      D[d + 2] = (F[d + 2] + (1 - F[d + 2]) * clamp(since / 60)) * (1 - out);
      D[d + 3] = (F[d + 3] + (1 - F[d + 3]) * e) * (1 - SHRINK * bump);
      if (D[d + 2] <= 0.003) continue;
      ctx.globalAlpha = D[d + 2];
      ctx.beginPath();
      ctx.arc(D[d] + PAD, D[d + 1] + PAD, (dot * D[d + 3]) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ghostA = ghostA0 * (1 - clamp(since / GHOST_OUT));
    pillA = clamp((since - PILL_AT) / PILL_IN);
    if (since >= END) {
      flying = false;
      for (let i = 0; i < N; i++) D[i * 4 + 2] = 0;
      ctx.clearRect(0, 0, CW, CH);
      pillA = 1;
      ghostA = 0;
    }
    apply();
  }
  const { kick } = loop(sc, host, frame, () => req || flying);

  const syncAria = () => items.forEach((_, k) => {
    pool[k].b.setAttribute('aria-selected', String(k === target));
    pool[k].b.tabIndex = k === target ? 0 : -1;
  });

  /** Flies to segment i. From the user: tick and onChange. */
  function select(i: number, user = true) {
    if (user && p().disabled) return;
    i = clamp(i, 0, n - 1);
    if (i === target || !items[i]) return;
    target = i;
    req = true;
    syncAria();
    kick();
    if (!user) return;
    if (p().haptics) vibrate(4);
    p().onChange?.(items[i].value, i);
  }

  // Pointer: a click selects on release, a horizontal drag selects under the finger as it goes.
  const at = (e: PointerEvent) => {
    const r = host.getBoundingClientRect(), sx = r.width / W || 1;
    return Math.floor(((e.clientX - r.left) / sx - inset) / seg);
  };
  let ptr: { id: number; x: number; y: number; drag: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.button > 0 || p().disabled) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (!ptr.drag) {
      const dx = Math.abs(e.clientX - ptr.x), dy = Math.abs(e.clientY - ptr.y);
      if (dy > 12 && dy > dx) { ptr = null; return; }
      if (dx < 6) return;
      ptr.drag = true;
      try { host.setPointerCapture(e.pointerId); } catch {}
      host.style.cursor = 'grabbing';
    }
    select(at(e));
  };
  const onEnd = (e: PointerEvent) => {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (!ptr.drag && e.type === 'pointerup') select(at(e));
    ptr = null;
    host.style.cursor = 'pointer';
  };
  // Keyboard: Enter or Space on a tab (a click with no pointer), arrows move the selection.
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    select(target + d);
    pool[target].b.focus();
  };
  if (!p().clickOnly) {
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onEnd);
    host.addEventListener('pointercancel', onEnd);
  }
  host.addEventListener('keydown', onKey);

  // A host that is not laid out yet (detached, display: none, a width that settles later) gets its
  // first placement from the observer, which runs after layout and before the frame is painted.
  const ro = new ResizeObserver(() => { if (host.clientWidth !== W || seg <= 0) layout(); });
  ro.observe(host);
  onThemeChange(sc, () => { paint(); kick(); });

  const disable = () => {
    host.style.opacity = p().disabled ? '0.5' : '';
    for (const tab of pool) tab.b.disabled = p().disabled;
    host.setAttribute('aria-disabled', String(p().disabled));
  };

  build();
  target = indexOf(p().value ?? p().defaultValue);
  syncAria();
  paint();
  disable();
  // Synchronous first placement: the pill is right on the very first painted frame.
  layout();

  return {
    icon: (i, on) => tabAt(i).icons[on ? 1 : 0],
    update(next) {
      const changed = props.update(next);
      if (changed.has('segments') || changed.has('size') || changed.has('labelClassName')) {
        // Segments given inline are a new array on every render: rebuild only when they differ.
        const same = !changed.has('size') && !changed.has('labelClassName') && JSON.stringify(p().segments.map(norm)) === JSON.stringify(items);
        if (!same) {
          const was = items[target]?.value;
          build();
          target = p().value !== undefined ? indexOf(p().value) : Math.max(0, items.findIndex((it) => it.value === was));
          syncAria();
          layout();
        }
      }
      if (changed.has('value') && p().value !== undefined) select(indexOf(p().value), false);
      if (changed.has('trackColor') || changed.has('indicatorColor')) { paint(); kick(); }
      if (changed.has('disabled')) disable();
    },
    destroy() {
      sc.dispose();
      ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onEnd);
      host.removeEventListener('pointercancel', onEnd);
      host.removeEventListener('keydown', onKey);
      ghost.remove();
      pill.remove();
      cv.remove();
      row.remove();
      for (const k of ['position', 'border-radius', 'touch-action', 'cursor', 'background', 'height', 'opacity']) host.style.removeProperty(k);
      for (const a of ['role', 'aria-disabled', 'data-dissolve']) host.removeAttribute(a);
    },
  };
}
