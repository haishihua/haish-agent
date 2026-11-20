import { REDUCED_MOTION_QUERY } from '../../../shared/lib/reduced-motion.js';

// Canvas 2D port of the react-native-dissolve Atlas engine (src/dissolve/Particles.tsx + core.ts).
// Variant math (timing / prepare / step) is ported from src/dissolve/variants/*.ts, almost verbatim.
// Differences with native: color modulation becomes a blend toward a pre-tinted copy of the
// snapshot (o.k = tint amount), and grains are drawn with drawImage on one fixed overlay canvas.

export const DPR = Math.min(2, window.devicePixelRatio || 1);
const MAX_GRAINS = 5000;
const DEFAULT_END = 1.2;
const BASE = 8; // lx, ly, r1, r2, r3, r4, delay, life

/* ---------- easing (core.ts) ---------- */
const ss = (t) => t * t * (3 - 2 * t);
const eo = (t) => { const u = 1 - t; return 1 - u * u * u; };
const backOut = (t) => { const u = t - 1; return 1 + 2.7 * u * u * u + 1.7 * u * u; };

/* ---------- variants ---------- */

function cloudScale(P) {
  const s = Math.sqrt(P.w * P.h) / 160;
  return s < 0.6 ? 0.6 : s > 1.8 ? 1.8 : s;
}

function burstOut(d, P, strength, extraIdx, randomDir) {
  // shared by snap and charge: outward push plus tangential swirl from (ox, oy)
  return (k) => {
    const dx = d[k] - P.ox, dy = d[k + 1] - P.oy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ux, uy;
    if (dist < 1) {
      const an = (randomDir ? Math.random() : d[k + 5]) * Math.PI * 2;
      ux = Math.cos(an); uy = Math.sin(an);
    } else { ux = dx / dist; uy = dy / dist; }
    const push = (30 + d[k + 3] * 110) * strength;
    const swirl = (d[k + 4] - 0.5) * 30;
    d[k + extraIdx] = ux * push - uy * swirl;
    d[k + extraIdx + 1] = uy * push + ux * swirl;
  };
}

function flingAxis(P) {
  let vx = P.vx, vy = P.vy, sp = Math.hypot(vx, vy);
  if (sp < 1) { vx = 1000; vy = 0; sp = 1000; }
  const ux = vx / sp, uy = vy / sp;
  return { ux, uy, nx: -uy, ny: ux, sp, k: Math.min(2, Math.max(0.4, sp / 1500)) };
}

function maxTargetDist(P) {
  let m = 0;
  for (let i = 0; i < 4; i++) {
    const dd = Math.hypot(P.x + (i & 1 ? P.w : 0) - P.tx, P.y + (i & 2 ? P.h : 0) - P.ty);
    if (dd > m) m = dd;
  }
  return m || 1;
}

export const VARIANTS = {
  dust: {
    grain: 3, spread: 0.62, jitter: 0.1,
    timing: (g, P) => ({ delay: (g.lx / P.w) * 0.62 + (1 - g.ly / P.h) * 0.04 + g.r1 * 0.1, life: 0.42 }),
    step(t, d, k, P, a0, a1, o) {
      const e = t * t;
      o.cx += (50 + d[k + 3] * 150) * e;
      o.cy += -(15 + d[k + 4] * 110) * e + Math.sin(t * 7 + d[k + 5] * 6.28) * 5 * t;
      o.s = 1 - t * 0.55;
      o.rot = (d[k + 5] - 0.5) * 6 * e;
    },
  },
  sand: {
    grain: 2.5, spread: 0.5, jitter: 0.15,
    timing: (g, P) => ({ delay: (g.lx / P.w) * 0.5 + g.r1 * 0.15, life: 0.5 }),
    step(t, d, k, P, a0, a1, o) {
      const e = t * t;
      o.cx += (d[k + 3] - 0.3) * 30 * e;
      o.cy += (60 + d[k + 4] * 220) * e;
      o.s = 1 - t * 0.3;
    },
  },
  ember: {
    grain: 3, spread: 0.6, jitter: 0.12, tint: 'dominant',
    timing: (g, P) => ({ delay: (g.lx / P.w) * 0.52 + ((P.h - g.ly) / P.h) * 0.12 + g.r1 * 0.12, life: 0.4 }),
    step(t, d, k, P, a0, a1, o) {
      const e = t * t;
      o.cx += (d[k + 3] - 0.5) * 40 * e + Math.sin(t * 5 + d[k + 5] * 6.28) * 8 * t;
      o.cy += -(40 + d[k + 4] * 140) * e;
      o.rot = (d[k + 5] - 0.5) * 3 * e;
      const heat = t < 0.12 ? t / 0.12 : t < 0.35 ? 1 - ((t - 0.12) / 0.23) * 0.6 : 0.4;
      o.k = heat * 0.8;
      o.a = 1; // tint mode: opacity kept, fade by shrinking
      const f = t < 0.2 ? 0 : (t - 0.2) / 0.8;
      o.s = 1 - f * f * (3 - 2 * f);
    },
  },
  pixel: {
    grain: 7, spread: 0.65, jitter: 0.1,
    timing: (g) => ({ delay: g.r1 * 0.75, life: 0.32 }),
    step(t, d, k, P, a0, a1, o) {
      const q = Math.floor(t * 5) / 5;
      o.cx += (d[k + 3] - 0.5) * 24 * q;
      o.cy += (d[k + 4] - 0.5) * 24 * q;
      o.s = 1 - q;
      o.a = 1 - q * q;
    },
  },
  vortex: {
    grain: 3,
    timing: (g, P) => {
      const dx = g.lx - P.w / 2, dy = g.ly - P.h / 2;
      return { delay: (1 - Math.sqrt(dx * dx + dy * dy) / P.maxR) * 0.55 + g.r1 * 0.1, life: 0.55 };
    },
    step(t, d, k, P, a0, a1, o) {
      const dx = d[k] - P.w / 2, dy = d[k + 1] - P.h / 2;
      const e = t * t, r0 = Math.sqrt(dx * dx + dy * dy), an0 = Math.atan2(dy, dx);
      const an = an0 + e * (2.5 + d[k + 3] * 1.5), rr = r0 * (1 - e);
      o.cx = P.x + P.w / 2 + Math.cos(an) * rr;
      o.cy = P.y + P.h / 2 + Math.sin(an) * rr;
      o.s = 1 - t * 0.6;
      o.rot = an - an0;
    },
  },
  snap: {
    grain: 3, ownsOrigin: true, extra: 2,
    timing: (g, P) => ({ delay: (Math.hypot(g.lx - P.ox, g.ly - P.oy) / (P.maxD || 1)) * 0.55 + g.r1 * 0.08, life: 0.45 }),
    prepare(d, stride, count, P) {
      const f = burstOut(d, P, P.n0 > 0 ? P.n0 : 1, 8, true);
      for (let i = 0; i < count; i++) f(i * stride);
    },
    step(t, d, k, P, a0, a1, o) {
      const u = 1 - t, e = 1 - u * u * u;
      o.cx += d[k + 8] * e;
      o.cy += d[k + 9] * e - 20 * t * t;
      o.s = 1 - 0.6 * t;
      o.rot = (d[k + 5] - 0.5) * 4 * e;
    },
  },
  fling: {
    grain: 3, extra: 5, spread: 0.5, jitter: 0.08,
    duration: (P) => { const sp = Math.hypot(P.vx, P.vy) || 1000; return Math.min(1500, Math.max(700, 1800 - sp * 0.4)); },
    timing: (g, P) => {
      const { ux, uy, k } = flingAxis(P);
      const pn = ((g.lx - P.w / 2) * ux + (g.ly - P.h / 2) * uy) / (P.maxR || 1);
      return { delay: (1 - (pn + 1) / 2) * 0.45 + g.r1 * 0.1, life: Math.min(0.42 / Math.sqrt(k), 0.6) };
    },
    prepare(d, stride, count, P) {
      const { ux, uy, nx, ny, sp, k } = flingAxis(P);
      const msp = Math.min(sp, 5000);
      for (let i = 0; i < count; i++) {
        const o = i * stride;
        const travel = (80 + d[o + 3] * 160) * k, side = (d[o + 4] - 0.5) * 40 * k;
        d[o + 8] = ux * travel + nx * side;
        d[o + 9] = uy * travel + ny * side;
        const mom = (msp * ((d[o + 7] * P.sec) / DEFAULT_END)) / 3;
        d[o + 10] = ux * mom;
        d[o + 11] = uy * mom;
        d[o + 12] = (d[o + 5] - 0.5) * 5 * k;
      }
    },
    step(t, d, k, P, a0, a1, o) {
      const e = t * t, u = 1 - t, m = 1 - u * u * u;
      o.cx += d[k + 8] * e + d[k + 10] * m;
      o.cy += d[k + 9] * e + d[k + 11] * m;
      o.s = 1 - 0.5 * t;
      o.rot = d[k + 12] * e;
    },
  },
  stream: {
    grain: 3.5, natural: 'both', extra: 4,
    timing: (g, P) => ({ delay: (Math.hypot(P.x + g.lx - P.tx, P.y + g.ly - P.ty) / maxTargetDist(P)) * 0.45 + g.r1 * 0.15, life: 0.5 }),
    prepare(d, stride, count, P) {
      const jx = P.tw > 0 ? Math.min(P.tw * 0.5, 14) : 6, jy = P.th > 0 ? Math.min(P.th * 0.5, 14) : 6;
      for (let i = 0; i < count; i++) {
        const k = i * stride;
        const p0x = P.x + d[k], p0y = P.y + d[k + 1], r2 = d[k + 3], r3 = d[k + 4], r4 = d[k + 5];
        const ex = P.tx + (r2 - 0.5) * jx, ey = P.ty + (r3 - 0.5) * jy;
        const dx = p0x - ex, dy = p0y - ey, D = Math.sqrt(dx * dx + dy * dy) || 1;
        const near = Math.min(1, 0.35 + D / 450);
        let c1x, c1y;
        if (P.dir === 0) {
          c1x = (p0x + ex) / 2 + (r4 - 0.5) * 120 * near;
          c1y = Math.min(p0y, ey) - (80 + r2 * 120) * near;
        } else {
          const side = (r4 - 0.5) * Math.min(D, 320) * 0.7;
          c1x = (p0x + ex) / 2 + (-dy / D) * side;
          c1y = (p0y + ey) / 2 + (dx / D) * side - (20 + r2 * 60) * near;
        }
        d[k + 8] = c1x; d[k + 9] = c1y; d[k + 10] = ex; d[k + 11] = ey;
      }
    },
    step(t, d, k, P, a0, a1, o) {
      const rx = P.x + d[k], ry = P.y + d[k + 1], c1x = d[k + 8], c1y = d[k + 9], ex = d[k + 10], ey = d[k + 11], r4 = d[k + 5];
      if (P.dir === 0) {
        const u = ss(t), v = 1 - u;
        o.cx = v * v * rx + 2 * v * u * c1x + u * u * ex;
        o.cy = v * v * ry + 2 * v * u * c1y + u * u * ey;
        o.s = 1 - 0.7 * u;
        o.rot = (r4 - 0.5) * 8 * u;
        o.a = t < 0.9 ? 1 : (1 - t) * 10;
        return;
      }
      if (t >= 1) { o.a = 1; return; }
      const u = eo(t), v = 1 - u;
      o.cx = v * v * ex + 2 * v * u * c1x + u * u * rx;
      o.cy = v * v * ey + 2 * v * u * c1y + u * u * ry;
      o.s = 0.3 + 0.7 * u;
      o.rot = (r4 - 0.5) * 8 * v;
      o.a = ss(Math.min(1, t * 4));
    },
  },
  gather: {
    grain: 3, natural: 'in', extra: 2,
    timing: (g, P) => ({ delay: (g.ly / P.h) * 0.4 + (g.lx / P.w) * 0.1 + g.r1 * 0.15, life: 0.5 }),
    prepare(d, stride, count, P) {
      const sc = cloudScale(P);
      for (let i = 0; i < count; i++) {
        const k = i * stride, ang = d[k + 3] * Math.PI * 2, dist = (40 + d[k + 4] * 120) * sc;
        d[k + 8] = Math.cos(ang) * dist; d[k + 9] = Math.sin(ang) * dist;
      }
    },
    step(t, d, k, P, a0, a1, o) {
      if (t >= 1) { o.a = 1; return; }
      const v = 1 - backOut(t);
      o.cx += d[k + 8] * v;
      o.cy += d[k + 9] * v;
      o.s = 1 - 0.6 * (1 - Math.min(1, t * 1.5));
      o.rot = (d[k + 5] - 0.5) * 4 * v;
      o.a = ss(Math.min(1, t * 2.5));
    },
  },
  rain: {
    grain: 3, natural: 'in', extra: 2,
    timing: (g, P) => ({ delay: (1 - g.ly / P.h) * 0.45 + g.r1 * 0.2, life: 0.5 }),
    prepare(d, stride, count, P) {
      const sc = cloudScale(P);
      for (let i = 0; i < count; i++) {
        const k = i * stride;
        d[k + 8] = (d[k + 3] - 0.5) * 20;
        d[k + 9] = (120 + d[k + 4] * 200) * sc;
      }
    },
    step(t, d, k, P, a0, a1, o) {
      if (t >= 1) { o.a = 1; return; }
      const LAND = 0.82;
      if (t < LAND) {
        const q = t / LAND;
        o.cx += d[k + 8] * (1 - q);
        o.cy -= d[k + 9] * (1 - q * q);
      } else {
        const q = (t - LAND) / (1 - LAND);
        o.cy -= Math.sin(q * Math.PI) * (1.5 + d[k + 5] * 2.5) * (1 - q);
      }
      o.a = ss(Math.min(1, t * 4));
    },
  },
  print: {
    grain: 3, natural: 'in', tint: [0.08, 0.08, 0.09], // fresh ink is black
    timing: (g, P) => ({ delay: (g.row / Math.max(1, P.rows - 1)) * 0.8 + g.r1 * 0.03, life: 0.3 }),
    step(t, d, k, P, a0, a1, o) {
      if (t >= 1) { o.a = 1; return; }
      const v = 1 - eo(t);
      o.cy -= 8 * v;
      o.s = 1 + 0.45 * v;
      o.k = 1 - ss(t); // fresh black ink, fades to the real colors
      o.a = ss(Math.min(1, t * 2.5));
    },
  },
  charge: {
    grain: 3, end: 1, ownsOrigin: true, extra: 5, tint: 'dominant', // heats toward the element's own color
    timing: (g, P) => ({ delay: (Math.hypot(g.lx - P.ox, g.ly - P.oy) / (P.maxD || 1)) * 0.4 + g.r1 * 0.06, life: 0.5 }),
    prepare(d, stride, count, P) {
      const f = burstOut(d, P, (P.n0 > 0 ? P.n0 : 1) * 1.4, 8, false);
      for (let i = 0; i < count; i++) {
        const k = i * stride, lx = d[k], ly = d[k + 1];
        f(k);
        let edge = lx, nx = -1, ny = 0;
        if (P.w - lx < edge) { edge = P.w - lx; nx = 1; ny = 0; }
        if (ly < edge) { edge = ly; nx = 0; ny = -1; }
        if (P.h - ly < edge) { edge = P.h - ly; nx = 0; ny = 1; }
        d[k + 10] = nx; d[k + 11] = ny; d[k + 12] = Math.max(0, edge);
      }
    },
    step(t, d, k, P, a0, a1, o) {
      const c = a0 < 0 ? 0 : a0 > 1 ? 1 : a0;
      if (c > 0) {
        const c2 = c * c, keep = 1 - t, r2 = d[k + 3], r4 = d[k + 5];
        const A = c2 * 2.5 * keep;
        o.cx += Math.sin(a1 * 0.05 + r4 * 6.28) * A;
        o.cy += Math.cos(a1 * 0.047 + r2 * 6.28) * A;
        const band = c * 12, edge = d[k + 12];
        if (edge < band) {
          const f = 1 - edge / band;
          const push = f * c * 6 * d[k + 4] * keep * (0.6 + 0.4 * Math.sin(a1 * 0.013 + r2 * 6.28));
          o.cx += d[k + 10] * push;
          o.cy += d[k + 11] * push;
          o.a *= 1 - 0.3 * f * c;
        }
        o.k = c2 * 0.85; // heat toward the element's dominant color
      }
      if (t > 0) {
        const u = 1 - t, e = 1 - u * u * u;
        o.cx += d[k + 8] * e;
        o.cy += d[k + 9] * e - 20 * t * t;
        o.s = 1 - 0.6 * t;
        o.rot = (d[k + 5] - 0.5) * 4 * e;
      }
    },
  },
};

/* ---------- peel and melt (src/dissolve/variants/peel.ts, melt.ts) ---------- */

VARIANTS.peel = {
  grain: 3, end: 1.2, ownsOrigin: true, tint: 'paper', // back of the sticker
  duration: () => 1900,
  timing: () => ({ delay: 0, life: 1.2 }),
  step(t, d, k, P, a0, a1, o) {
    // Anchor A pulled to F; the fold is the bisector of AF (see src/dissolve/variants/peel.ts).
    const hand = P.n0 === 1;
    let ax = P.w, ay = P.h, fx = a0, fy = a1;
    const L = Math.sqrt(P.w * P.w + P.h * P.h);
    if (hand) { ax = P.n1; ay = P.n2; }
    else {
      const q = t < 0.72 ? t / 0.72 : 1, f = ss(q) * L * 1.04;
      fx = ax - (P.w / L) * 2 * f;
      fy = ay - (P.h / L) * 2 * f;
    }
    o.a = 1;
    let nx = fx - ax, ny = fy - ay;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 0.5) {
      nx /= len; ny /= len;
      const lx = d[k], ly = d[k + 1];
      const sd = (lx - (ax + fx) / 2) * nx + (ly - (ay + fy) / 2) * ny;
      if (sd < 0) {
        const dd = -sd;
        o.cx -= 2 * sd * nx;
        o.cy -= 2 * sd * ny;
        // The flap is drawn in one piece by post() below (smooth paper, exact shape).
        o.s = 0;
        void dd;
      } else {
        const mx = lx - 2 * sd * nx, my = ly - 2 * sd * ny;
        if (mx >= 0 && mx <= P.w && my >= 0 && my <= P.h) o.s = 0; // under the flap
        else if (sd < 26) { const q = 1 - sd / 26; o.dark = 0.32 * q * q; } // shadow cast by the flap
      }
    }
    if (hand) { if (t > 0.6) o.s *= 1 - ss((t - 0.6) / 0.4); return; }
    if (t > 0.62) {
      const v = (t - 0.62) / 0.38, e = v * v;
      o.cx -= (P.w / L) * 160 * e;
      o.cy -= (P.h / L) * 160 * e + 40 * e;
      o.rot = -0.6 * e;
      o.s *= 1 - ss(v);
    }
  },
};

/** Peel geometry at time t: anchor A, pulled point F (local coords), lift amount. */
function peelGeom(P, t, a0, a1) {
  const L = Math.sqrt(P.w * P.w + P.h * P.h);
  if (P.n0 === 1) return { ax: P.n1, ay: P.n2, fx: a0, fy: a1, L, hand: true };
  const q = t < 0.72 ? t / 0.72 : 1, f = ss(q) * L * 1.04;
  return { ax: P.w, ay: P.h, fx: P.w - (P.w / L) * 2 * f, fy: P.h - (P.h / L) * 2 * f, L, hand: false };
}

const flapCanvas = document.createElement('canvas');
const fctx = flapCanvas.getContext('2d');

/**
 * Draws the peeled flap in one piece: the view mirrored across the fold, clipped to the
 * peeled half plane, then covered with a paper gradient (crease, curl highlight, matte).
 * The view's own alpha shapes it, so rounded corners stay rounded.
 */
VARIANTS.peel.post = function (b, p, offX, offY) {
  const { P } = b;
  const t = Math.min(1, Math.max(0, p / 1.2));
  const G = peelGeom(P, t, b.aux.a0, b.aux.a1);
  let nx = G.fx - G.ax, ny = G.fy - G.ay;
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len < 0.5) return;
  nx /= len; ny /= len;
  const mx = (G.ax + G.fx) / 2, my = (G.ay + G.fy) / 2;
  const c0 = mx * nx + my * ny; // fold line: x . n = c0
  // Lift (auto mode) or final shrink (hand mode), around the flap centre.
  let tx = 0, ty = 0, rot = 0, sc = 1;
  if (G.hand) { if (t > 0.6) sc = 1 - ss((t - 0.6) / 0.4); }
  else if (t > 0.62) {
    const v = (t - 0.62) / 0.38, e = v * v;
    tx = -(P.w / G.L) * 160 * e; ty = -(P.h / G.L) * 160 * e - 40 * e; rot = -0.6 * e; sc = 1 - ss(v);
  }
  if (sc <= 0.01) return;
  if (flapCanvas.width !== overlay.width || flapCanvas.height !== overlay.height) { flapCanvas.width = overlay.width; flapCanvas.height = overlay.height; }
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.clearRect(0, 0, flapCanvas.width, flapCanvas.height);
  // world = DPR * T(P.x + off) * [lift about the reflected fold midpoint] * Reflect
  const cx = mx, cy = my; // pivot: the fold midpoint stays put on the flap
  fctx.translate((P.x + offX) * DPR, (P.y + offY) * DPR);
  fctx.scale(DPR, DPR);
  fctx.translate(cx + tx, cy + ty);
  fctx.rotate(rot);
  fctx.scale(sc, sc);
  fctx.translate(-cx, -cy);
  fctx.transform(1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * c0 * nx, 2 * c0 * ny);
  // Peeled half plane of the view, in local (pre reflection) coords.
  const big = 4 * G.L + P.w + P.h;
  const ux = -ny, uy = nx; // along the fold
  fctx.beginPath();
  fctx.moveTo(mx + ux * big, my + uy * big);
  fctx.lineTo(mx - ux * big, my - uy * big);
  fctx.lineTo(mx - ux * big - nx * big, my - uy * big - ny * big);
  fctx.lineTo(mx + ux * big - nx * big, my + uy * big - ny * big);
  fctx.closePath();
  // Mirror the view, then keep only the flap side with an exact mask (a clip leaked hairlines).
  fctx.drawImage(b.source, 0, 0, P.w, P.h);
  fctx.globalCompositeOperation = 'destination-in';
  fctx.fillStyle = '#000';
  fctx.fill();
  // Paper over the view's shape: gradient from the fold into the flap.
  fctx.globalCompositeOperation = 'source-atop';
  const gr = fctx.createLinearGradient(mx, my, mx - nx * G.L, my - ny * G.L);
  const stop = (px, shade) => {
    const v = Math.round(shade * 246);
    gr.addColorStop(Math.min(1, px / G.L), `rgb(${v - 5}, ${v - 3}, ${v})`);
  };
  stop(0, 0.8); stop(6, 0.97); stop(40, 0.88); stop(G.L, 0.86);
  fctx.fillStyle = gr;
  fctx.fillRect(-big, -big, big * 2 + P.w, big * 2 + P.h);
  fctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(flapCanvas, 0, 0);
  ctx.restore();
};

VARIANTS.melt = {
  // Warm wax: sag + drips on one global clock (see src/dissolve/variants/melt.tsx).
  grain: 3, extra: 3, end: 1.2, ownsOrigin: true, goo: 2.6, // liquid look: blur + alpha threshold
  duration: () => 1800,
  timing: () => ({ delay: 0, life: 1.2 }),
  prepare(d, stride, count, P) {
    const ph = Math.random() * Math.PI * 2;
    const drips = 3 + Math.floor(Math.random() * 4), dx = [], da = [], dw = [];
    for (let j = 0; j < drips; j++) { dx.push(((j + 0.25 + Math.random() * 0.5) / drips) * P.w); da.push(0.55 + Math.random() * 0.45); dw.push(5 + Math.random() * 7); }
    for (let i = 0; i < count; i++) {
      const k = i * stride, x = d[k];
      d[k + 8] = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((x / P.w) * 5.2 + ph));
      let best = 0, off = 0;
      for (let j = 0; j < drips; j++) {
        const g = da[j] * Math.exp(-((x - dx[j]) ** 2) / (2 * dw[j] * dw[j]));
        if (g > best) { best = g; off = dx[j] - x; }
      }
      d[k + 9] = best; d[k + 10] = off;
    }
  },
  step(t, d, k, P, a0, a1, o) {
    const v = d[k + 1] / P.h, e = t * t * (1.6 - 0.6 * t), sag = d[k + 8], drip = d[k + 9];
    const v15 = v * Math.sqrt(v), v4 = v * v * v * v;
    const A = P.h * 0.55 * sag, B = (P.h * 1.6 + 160) * drip;
    o.cy += e * (A * v15 + B * v4) + 14 * e * sag;
    o.cx += d[k + 10] * 0.45 * e * drip * v4;
    o.a = 1;
    // Grow each grain with the local stretch (d dy / d ly) so the flow stays continuous.
    const stretch = 1 + (e * (A * 1.5 * Math.sqrt(v) + B * 4 * v * v * v)) / P.h;
    o.s = Math.min(3.2, stretch) * (t < 0.72 ? 1 : 1 - ss((t - 0.72) / 0.28));
  },
};

/* ---------- morph (src/dissolve/variants/morph.tsx) ---------- */

const MORPH_END = 1.1, MORPH_LIFE = 0.6, MS = 10;

function cellLuminance(src, cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, cols, rows);
  const px = x.getImageData(0, 0, cols, rows).data;
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const j = i * 4;
    out[i] = ((0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2]) / 255) * (px[j + 3] / 255);
  }
  return out;
}
const sortedCells = (lum) => Array.from(lum.keys()).sort((a, b) => lum[a] - lum[b]);

/**
 * Morphs view A into view B: grains are paired by brightness rank and fly along a curve,
 * A fading out while B fades in. a and b: { source, x, y, w, h } in viewport px.
 * reverse plays B back into A. Returns { done }.
 */
export function morph(a, b, { grain = 4, duration = 1100, reverse = false } = {}) {
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  if (reduced.matches || !(a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0)) { resolveDone(); return { done }; }
  const g = grain;
  const colsA = Math.ceil(a.w / g), rowsA = Math.ceil(a.h / g), colsB = Math.ceil(b.w / g), rowsB = Math.ceil(b.h / g);
  const nA = colsA * rowsA, nB = colsB * rowsB, N = Math.max(nA, nB);
  const ordA = sortedCells(cellLuminance(a.source, colsA, rowsA));
  const ordB = sortedCells(cellLuminance(b.source, colsB, rowsB));
  const d = new Float32Array(N * MS);
  const ia_ = new Int32Array(N), ib_ = new Int32Array(N);
  let lastA = -1, lastB = -1;
  for (let k = 0; k < N; k++) {
    const ra = Math.floor((k * nA) / N), rb = Math.floor((k * nB) / N);
    const ia = ordA[ra], ib = ordB[rb];
    ia_[k] = ia; ib_[k] = ib;
    const ax = a.x + ((ia % colsA) + 0.5) * g, ay = a.y + (Math.floor(ia / colsA) + 0.5) * g;
    const bx = b.x + ((ib % colsB) + 0.5) * g, by = b.y + (Math.floor(ib / colsB) + 0.5) * g;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let px, py;
    if (len > 1e-3) { px = -dy / len; py = dx / len; } else { const an = Math.random() * Math.PI * 2; px = Math.cos(an); py = Math.sin(an); }
    const off = (Math.random() - 0.5) * Math.min(48, 10 + len * 0.3); // gentle arcs
    const j = k * MS;
    d[j] = ax; d[j + 1] = ay; d[j + 2] = bx; d[j + 3] = by;
    d[j + 4] = (ax + bx) / 2 + px * off; d[j + 5] = (ay + by) / 2 + py * off;
    d[j + 6] = ((ia % colsA) / Math.max(1, colsA - 1)) * 0.3 + Math.random() * 0.08; d[j + 7] = MORPH_LIFE; // left to right sweep
    d[j + 8] = ra !== lastA ? 1 : 0; d[j + 9] = rb !== lastB ? 1 : 0;
    lastA = ra; lastB = rb;
  }
  const sg = g * DPR;
  const burst = {
    v: {}, end: MORPH_END, rev: reverse, duration, start: performance.now(), sx0: scrollX, sy0: scrollY,
    aux: { a0: 0, a1: 0 }, manual: null, finish: resolveDone,
    draw(p, offX, offY) {
      for (let k = 0; k < N; k++) {
        const j = k * MS;
        let t = (p - d[j + 6]) / d[j + 7];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const u = ss(t), v = 1 - u;
        const cx = v * v * d[j] + 2 * v * u * d[j + 4] + u * u * d[j + 2] + offX;
        const cy = v * v * d[j + 1] + 2 * v * u * d[j + 5] + u * u * d[j + 3] + offY;
        const s = t === 0 || t === 1 ? 1 : 1 + 0.18 * Math.sin(Math.PI * t);
        const cross = ss(Math.min(1, Math.max(0, (t - 0.3) / 0.4)));
        const hw = (g * s) / 2;
        const alA = d[j + 8] * (1 - cross), alB = d[j + 9] * cross;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (alA > 0.01) {
          ctx.globalAlpha = alA;
          const ia = ia_[k];
          ctx.drawImage(a.source, (ia % colsA) * sg, Math.floor(ia / colsA) * sg, sg, sg, cx - hw, cy - hw, g * s, g * s);
        }
        if (alB > 0.01) {
          ctx.globalAlpha = alB;
          const ib = ib_[k];
          ctx.drawImage(b.source, (ib % colsB) * sg, Math.floor(ib / colsB) * sg, sg, sg, cx - hw, cy - hw, g * s, g * s);
        }
      }
    },
  };
  const handle = { done, aux: burst.aux };
  launch(burst, handle);
  return handle;
}
VARIANTS.morph = { grain: 4, custom: true };

/* ---------- shatter (src/dissolve/variants/shatter.tsx) ---------- */

// Native draws the shards with Skia <Vertices>. Here every shard is one polygon filled with a
// pattern of the snapshot, moved by the same per shard math (crack gap, launch, gravity,
// spin, pseudo 3D flip with light and glint), plus the white impact flash for exits.
const SHARDS = 220, GRAVITY_HALF = 450, PI3 = Math.PI * 3;

/** Sutherland-Hodgman clip of a convex polygon against [0, w] x [0, h]. */
function clipRect(poly, w, h) {
  const planes = [(p) => p.x, (p) => w - p.x, (p) => p.y, (p) => h - p.y];
  let out = poly;
  for (const f of planes) {
    if (!out.length) break;
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if (fa >= 0 !== fb >= 0) { const u = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }); }
    }
  }
  return out;
}

function centroid(poly) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = a.x * b.y - b.x * a.y;
    A += c; cx += (a.x + b.x) * c; cy += (a.y + b.y) * c;
  }
  A /= 2;
  if (Math.abs(A) < 1e-9) return { A: 0, x: poly[0].x, y: poly[0].y };
  return { A, x: cx / (6 * A), y: cy / (6 * A) };
}

/** Polar grid of jittered rays and geometric rings around (ox, oy), clipped to the rect. */
function polarShards(w, h, ox, oy, maxD, q, S) {
  const base = Math.random() * Math.PI * 2, sector = (Math.PI * 2) / S;
  const rMin = Math.min(14, Math.max(8, maxD * 0.04)), rEnd = (maxD / Math.cos(sector / 2)) * 1.05;
  const radii = [0];
  for (let r = rMin; ; r *= q) { radii.push(r); if (r >= rEnd) break; }
  const rings = radii.length, grid = [];
  for (let k = 0; k < rings; k++) {
    const row = [], last = k === rings - 1;
    for (let j = 0; j < S; j++) {
      if (k === 0) { row.push({ x: ox, y: oy }); continue; }
      const th = base + j * sector + (last ? 0 : (Math.random() - 0.5) * 0.3 * sector);
      const r = last ? radii[k] : radii[k] * (1 + (Math.random() - 0.5) * 0.12);
      row.push({ x: ox + Math.cos(th) * r, y: oy + Math.sin(th) * r });
    }
    grid.push(row);
  }
  const out = [];
  const keep = (tri) => { const c = clipRect(tri, w, h); if (c.length >= 3 && Math.abs(centroid(c).A) > 1e-4) out.push(c); };
  const cross = (p, q2, r) => (q2.x - p.x) * (r.y - p.y) - (q2.y - p.y) * (r.x - p.x);
  for (let k = 0; k < rings - 1; k++)
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S, A = grid[k][j], B = grid[k][j2], C = grid[k + 1][j2], D = grid[k + 1][j];
      const acOk = cross(A, B, C) * cross(A, C, D) > 0, bdOk = cross(A, B, D) * cross(B, C, D) > 0;
      if (k === 0) keep([A, C, D]);
      else if (acOk && (!bdOk || Math.random() < 0.5)) { keep([A, B, C]); keep([A, C, D]); }
      else { keep([A, B, D]); keep([B, C, D]); }
    }
  return out;
}

function shatterMesh(w, h, ox, oy, target, fvx, fvy) {
  const cx = Math.min(w, Math.max(0, ox)), cy = Math.min(h, Math.max(0, oy));
  const maxD = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy), 1);
  let S = 10 + Math.floor(Math.random() * 5), q = 1.8;
  let polys = polarShards(w, h, cx, cy, maxD, q, S);
  for (let guard = 0; polys.length < target && guard < 80; guard++) {
    if (q > 1.42) q -= 0.06; else if (S < 64) S += 2; else break;
    polys = polarShards(w, h, cx, cy, maxD, q, S);
  }
  const shards = polys.map((poly) => {
    const g = centroid(poly);
    let ux = g.x - cx, uy = g.y - cy;
    const len = Math.hypot(ux, uy);
    if (len < 1e-3) { const a = Math.random() * Math.PI * 2; ux = Math.cos(a); uy = Math.sin(a); } else { ux /= len; uy /= len; }
    const dn = Math.min(1, len / maxD), speed = (120 + Math.random() * 200) * (1 - 0.6 * dn);
    // Vertices relative to the centroid, pushed out by half a pixel so neighbours overlap
    // and no hairline crack shows while the glass is still whole.
    const pts = new Float32Array(poly.length * 2);
    poly.forEach((p, i) => {
      const dx = p.x - g.x, dy = p.y - g.y, l = Math.hypot(dx, dy) || 1;
      pts[i * 2] = dx + (dx / l) * 0.5; pts[i * 2 + 1] = dy + (dy / l) * 0.5;
    });
    return {
      gx: g.x, gy: g.y, vx: ux * speed + fvx * 0.3, vy: uy * speed + fvy * 0.3, ux, uy,
      spin: Math.random() - 0.5, flip: Math.random(), delay: dn * 0.15 + Math.random() * 0.05, life: 0.8, pts,
    };
  });
  return { shards, ox: cx, oy: cy, flashR: Math.min(170, Math.max(60, maxD * 0.55)) };
}

VARIANTS.shatter = {
  grain: 3, end: 1, custom: true,
  start(opts, finish, aux) {
    const { w, h, source } = opts;
    const o = originPoint(opts.origin, w, h);
    const n0 = opts.n?.[0] ?? 0;
    const target = Math.round(Math.min(400, Math.max(60, n0 > 0 ? n0 : SHARDS)));
    const M = shatterMesh(w, h, o.x, o.y, target, opts.velocity?.x ?? 0, opts.velocity?.y ?? 0);
    const duration = opts.duration ?? 1500, sec = duration / 1000, rev = opts.direction === 'in';
    const pattern = ctx.createPattern(source, 'no-repeat');
    const path = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    };
    return {
      v: VARIANTS.shatter, end: 1, rev, duration, start: opts.hold ? null : performance.now(),
      sx0: scrollX, sy0: scrollY, aux, manual: null, finish,
      draw(tn, offX, offY) {
        const X = opts.x + offX, Y = opts.y + offY;
        for (const s of M.shards) {
          let t = (tn - s.delay) / s.life;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          let px = X + s.gx, py = Y + s.gy, ang = 0, fy = 1, a = 1, light = 1, gl = 0;
          if (t > 0) {
            const gap = t < 0.08 ? (1.5 * t) / 0.08 : 1.5, T = t * sec * s.life;
            px += s.ux * gap + s.vx * T;
            py += s.uy * gap + s.vy * T + GRAVITY_HALF * T * T;
            ang = s.spin * 6 * t;
            const phi = s.flip * PI3 * t;
            fy = Math.cos(phi);
            const f = t <= 0.6 ? 0 : (t - 0.6) / 0.4;
            a = t >= 1 ? 0 : 1 - f * f * (3 - 2 * f);
            light = 0.6 + 0.4 * Math.abs(fy);
            const sp = Math.sin(phi), s2 = sp * sp;
            gl = sp > 0 ? 0.55 * s2 * s2 * s2 * a : 0;
          }
          if (a <= 0.01 || Math.abs(fy) < 0.02) continue;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          // shard space: translate to the centroid, rotate, squash y by the flip
          ctx.setTransform(ca * DPR, sa * DPR, -sa * fy * DPR, ca * fy * DPR, px * DPR, py * DPR);
          pattern.setTransform(new DOMMatrix([1 / DPR, 0, 0, 1 / DPR, -s.gx, -s.gy]));
          path(s.pts);
          ctx.globalAlpha = a;
          ctx.fillStyle = pattern;
          ctx.fill();
          if (light < 0.99) { ctx.globalAlpha = (1 - light) * a; ctx.fillStyle = '#000'; ctx.fill(); }
          if (gl > 0.01) { ctx.globalAlpha = gl; ctx.fillStyle = 'rgb(240, 247, 255)'; ctx.fill(); }
        }
        if (!rev && tn > 0) {
          const g = Math.min(1, tn / 0.22), u = 1 - g, r = Math.max(0.5, M.flashR * (1 - u * u * u));
          const fc = Math.min(1, tn / 0.3), op = 0.85 * (1 - fc * fc * (3 - 2 * fc)) * Math.min(1, tn / 0.015);
          if (op > 0.01) {
            const cx = X + M.ox, cy = Y + M.oy;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = op;
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/* ---------- params (core.ts buildParams) ---------- */

function originPoint(o, w, h) {
  if (o === 'left') return { x: 0, y: h / 2 };
  if (o === 'right') return { x: w, y: h / 2 };
  if (o === 'top') return { x: w / 2, y: 0 };
  if (o === 'bottom') return { x: w / 2, y: h };
  if (o === 'center' || !o) return { x: w / 2, y: h / 2 };
  return o;
}

function originField(o, lx, ly, P) {
  if (o === 'left') return lx / P.w;
  if (o === 'right') return 1 - lx / P.w;
  if (o === 'top') return ly / P.h;
  if (o === 'bottom') return 1 - ly / P.h;
  return Math.hypot(lx - P.ox, ly - P.oy) / (P.maxD || 1);
}

function buildParams(b, grain, duration) {
  const { w, h } = b;
  const o = originPoint(b.origin, w, h);
  const maxD = Math.max(Math.hypot(o.x, o.y), Math.hypot(w - o.x, o.y), Math.hypot(o.x, h - o.y), Math.hypot(w - o.x, h - o.y));
  const t = b.target, n = b.n ?? [];
  return {
    x: b.x, y: b.y, w, h, grain,
    cols: Math.ceil(w / grain), rows: Math.ceil(h / grain),
    maxR: Math.hypot(w / 2, h / 2),
    dir: b.direction === 'in' ? 1 : 0,
    sec: duration / 1000,
    hasOrigin: b.origin ? 1 : 0, ox: o.x, oy: o.y, maxD,
    vx: b.velocity?.x ?? 0, vy: b.velocity?.y ?? 0,
    tx: t ? t.x + t.width / 2 : innerWidth / 2, ty: t ? t.y + t.height / 2 : innerHeight - 64,
    tw: t?.width ?? 24, th: t?.height ?? 24,
    n0: n[0] ?? 0, n1: n[1] ?? 0, n2: n[2] ?? 0, n3: n[3] ?? 0,
  };
}

/* ---------- tint layers ---------- */

function dominant(canvas) {
  const w = 48, h = Math.max(1, Math.round((48 * canvas.height) / canvas.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data;
  const count = new Float32Array(512), sum = new Float32Array(1536);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const wt = 0.15 + (mx ? (mx - mn) / mx : 0);
    const q = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    count[q] += wt; sum[q * 3] += r * wt; sum[q * 3 + 1] += g * wt; sum[q * 3 + 2] += b * wt;
  }
  let best = 0;
  for (let q = 1; q < 512; q++) if (count[q] > count[best]) best = q;
  const n = count[best] || 1;
  return [sum[best * 3] / n, sum[best * 3 + 1] / n, sum[best * 3 + 2] / n];
}

function tintLayer(source, tint) {
  const c = document.createElement('canvas');
  c.width = source.width; c.height = source.height;
  const t = c.getContext('2d');
  t.drawImage(source, 0, 0);
  if (tint === 'paper') {
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = 'rgb(236, 238, 243)';
    t.fillRect(0, 0, c.width, c.height);
    return c;
  }
  if (tint === 'dominant') {
    const lift = (v) => Math.round(v + (255 - v) * 0.3);
    const [r, g, b] = dominant(source);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
  } else {
    // modulate: source x color, alpha restored afterwards
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = `rgb(${tint.map((v) => Math.round(v * 255)).join(',')})`;
    t.fillRect(0, 0, c.width, c.height);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(source, 0, 0);
    return c;
  }
  t.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------- overlay + loop ---------- */

const overlay = document.createElement('canvas');
overlay.className = 'dust-overlay';
document.body.appendChild(overlay);
const ctx = overlay.getContext('2d');
const bursts = new Set();
// Liquid layer for goo variants (melt): grains are drawn offscreen, then composited through
// blur + an alpha threshold (alpha * 18 - 7), the same recipe as the Skia gooey layer. The layer is
// a full screen bitmap: allocated when a goo burst starts, at the overlay size, freed once idle.
const gooCanvas = document.createElement('canvas');
gooCanvas.width = gooCanvas.height = 0;
const gctx = gooCanvas.getContext('2d');
function gooReady() {
  if (gooCanvas.width !== overlay.width) gooCanvas.width = overlay.width;
  if (gooCanvas.height !== overlay.height) gooCanvas.height = overlay.height;
}
const gooSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
gooSvg.setAttribute('width', '0'); gooSvg.setAttribute('height', '0');
gooSvg.style.position = 'absolute';
gooSvg.innerHTML = '<filter id="dissolve-goo" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/></filter>';
document.body.appendChild(gooSvg);
let running = false;

// The canvas CSS box must match its bitmap exactly. On iOS, 100vh is the viewport with the
// toolbar hidden while innerHeight is the visible one, so a 100vh canvas stretched the grains
// downward. Size both from innerWidth / innerHeight, and follow the toolbar as it moves.
function resize() {
  overlay.width = innerWidth * DPR;
  overlay.height = innerHeight * DPR;
  overlay.style.width = innerWidth + 'px';
  overlay.style.height = innerHeight + 'px';
}
resize();
addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
const reduced = matchMedia(REDUCED_MOTION_QUERY);

/**
 * Starts a burst. opts: { source (DPR canvas of w x h css px), x, y, w, h (viewport css px),
 * preset, grain, duration, direction, origin, velocity, target {x,y,width,height}, n, hold, fixed }.
 * Returns { done: Promise, aux: { a0, a1 }, set(p), release(), cancel() }.
 * hold: true keeps progress at 0 (aux driven pre phase, used by charge) until release().
 * set(p) drives the raw progress by hand (scrub); release() then plays on from there.
 */
export function play(opts) {
  const v = VARIANTS[opts.preset ?? 'dust'];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const handle = { done, aux: { a0: 0, a1: 0 }, set() {}, release() {}, cancel() {} };
  // Detached or collapsed elements measure 0 x 0: nothing to draw.
  if (!v || reduced.matches || !(opts.w > 0 && opts.h > 0)) { resolveDone(); return handle; }
  if (v.custom) {
    if (!v.start) { resolveDone(); return handle; }
    launch(v.start(opts, resolveDone, handle.aux), handle);
    return handle;
  }

  let grain = opts.grain ?? v.grain;
  const min = Math.sqrt((opts.w * opts.h) / MAX_GRAINS);
  if (grain < min) grain = Math.ceil(min * 2) / 2;
  const P0 = buildParams(opts, grain, 1000);
  const duration = opts.duration ?? (v.duration ? v.duration(P0) : 1500);
  const P = buildParams(opts, grain, duration);
  const end = v.end ?? DEFAULT_END;
  const natural = v.natural ?? 'out';
  const dirName = opts.direction ?? (natural === 'in' ? 'in' : 'out');
  const rev = natural !== 'both' && natural !== dirName;
  const stride = BASE + (v.extra ?? 0);
  const count = P.cols * P.rows;
  const d = new Float32Array(count * stride);
  const useOrigin = P.hasOrigin && !v.ownsOrigin;
  const cascade = opts.field === 'cascade' ? cascadeField(P, opts.rows, end) : null;
  const spread = v.spread ?? 0.55, jitter = v.jitter ?? 0.08;
  for (let r = 0; r < P.rows; r++)
    for (let c = 0; c < P.cols; c++) {
      const i = r * P.cols + c, k = i * stride;
      const g = { i, col: c, row: r, lx: (c + 0.5) * grain, ly: (r + 0.5) * grain, r1: Math.random(), r2: Math.random(), r3: Math.random(), r4: Math.random() };
      const tm = v.timing(g, P);
      d[k] = g.lx; d[k + 1] = g.ly; d[k + 2] = g.r1; d[k + 3] = g.r2; d[k + 4] = g.r3; d[k + 5] = g.r4;
      d[k + 6] = cascade ? cascade(g, tm.life) : useOrigin ? originField(opts.origin, g.lx, g.ly, P) * spread + g.r1 * jitter : tm.delay;
      d[k + 7] = tm.life;
    }
  v.prepare?.(d, stride, count, P, opts);

  const b = {
    v, P, d, stride, count, end, rev, duration,
    source: opts.source, tinted: v.tint ? tintLayer(opts.source, v.tint) : null,
    // fixed: the element is position: fixed (a viewport toast), grains ignore page scroll.
    sx0: opts.fixed ? null : scrollX, sy0: opts.fixed ? null : scrollY,
    start: opts.hold ? null : performance.now(),
    aux: handle.aux, finish: resolveDone, manual: null, opts,
  };
  launch(b, handle);
  return handle;
}

/** Adds a burst to the loop and wires the handle (scrub, hold, cancel). */
function launch(b, handle) {
  handle.set = (p) => { b.manual = Math.max(0, Math.min(b.end, p)); };
  handle.release = () => {
    if (b.start) return;
    b.start = performance.now() - ((b.manual ?? 0) / b.end) * b.duration;
    b.manual = null;
  };
  handle.end = b.end;
  handle.cancel = () => { bursts.delete(b); b.finish(); };
  bursts.add(b);
  if (!running) { running = true; requestAnimationFrame(frame); }
}

/** Drops every running burst at once (page change, re-render). Their promises resolve. */
export function cancelAll() {
  for (const b of bursts) b.finish();
  bursts.clear();
}

/* ---------- cascade delay field (src/dissolve/variants/cascade.ts) ---------- */

function cascadeField(P, rows, end) {
  const bounds = (rows ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  const indexOf = (y) => { let lo = 0, hi = bounds.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bounds[m] <= y) lo = m + 1; else hi = m; } return lo; };
  const first = indexOf(0), span = Math.max(0, indexOf(Math.max(0, P.h - 0.5)) - first);
  return (g, life) => {
    const B = Math.max(0, end - life - 0.005);
    const fx = Math.min(1, Math.max(0, g.lx / P.w));
    if (bounds.length) {
      const total = span * 0.06 + 0.3 + 0.08, k = total > B ? B / total : 1;
      const idx = Math.min(span, Math.max(0, indexOf(g.ly) - first));
      return (idx * 0.06 + fx * 0.3 + g.r1 * 0.08) * k;
    }
    const total = 0.78, k = total > B ? B / total : 1;
    return ((g.ly / P.h) * 0.45 + fx * 0.25 + g.r1 * 0.08) * k;
  };
}

const o = { cx: 0, cy: 0, s: 1, rot: 0, a: 1, k: 0, shade: 1, dark: 0, paper: 0 };

function frame(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  for (const b of bursts) {
    const raw = b.manual != null ? b.manual : b.start ? ((now - b.start) / b.duration) * b.end : 0;
    if (raw >= b.end) { bursts.delete(b); b.finish(); continue; }
    const p = b.rev ? b.end - raw : raw;
    const { P, d, stride, v } = b;
    const offX = b.sx0 == null ? 0 : b.sx0 - scrollX, offY = b.sy0 == null ? 0 : b.sy0 - scrollY;
    if (b.draw) { b.draw(p, offX, offY); continue; }
    const g = P.grain, sg = g * DPR, a0 = b.aux.a0, a1 = b.aux.a1;
    const x = v.goo ? gctx : ctx;
    if (v.goo) { gooReady(); gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, gooCanvas.width, gooCanvas.height); }
    for (let i = 0; i < b.count; i++) {
      const k = i * stride;
      let t = (p - d[k + 6]) / d[k + 7];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      o.cx = P.x + d[k]; o.cy = P.y + d[k + 1]; o.s = 1; o.rot = 0; o.k = 0; o.shade = 1; o.dark = 0; o.paper = 0;
      o.a = 1 - t * t * (3 - 2 * t);
      v.step(t, d, k, P, a0, a1, o);
      if (o.a <= 0.01 || o.s <= 0) continue;
      const cs = Math.cos(o.rot) * o.s * DPR, sn = Math.sin(o.rot) * o.s * DPR;
      x.setTransform(cs, sn, -sn, cs, (o.cx + offX) * DPR, (o.cy + offY) * DPR);
      x.globalAlpha = o.a > 1 ? 1 : o.a;
      const sx = d[k] * DPR - sg / 2, sy = d[k + 1] * DPR - sg / 2;
      if (o.paper > 0) {
        const v = Math.round(o.paper * 246);
        x.fillStyle = `rgb(${v - 5}, ${v - 3}, ${v})`;
        x.fillRect(-g / 2, -g / 2, g, g);
        continue;
      }
      x.drawImage(b.source, sx, sy, sg, sg, -g / 2, -g / 2, g, g);
      if (o.dark > 0.005) {
        x.globalAlpha = o.dark;
        x.fillStyle = '#000';
        x.fillRect(-g / 2, -g / 2, g, g);
      }
      if (o.k > 0.01 && b.tinted) {
        x.globalAlpha = (o.a > 1 ? 1 : o.a) * (o.k > 1 ? 1 : o.k);
        x.drawImage(b.tinted, sx, sy, sg, sg, -g / 2, -g / 2, g, g);
        if (o.shade < 1) {
          x.globalAlpha = (1 - o.shade) * 0.9;
          x.fillStyle = '#1a1d24';
          x.fillRect(-g / 2, -g / 2, g, g);
        }
      }
    }
    v.post?.(b, p, offX, offY);
    if (v.goo) {
      // Blur grows from 0 so the first frame is the exact view.
      const r = Math.min(1, Math.max(0, (raw - 0.2) / 0.5)) * v.goo * DPR; // starts once it flows
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = r > 0.2 ? `blur(${r.toFixed(2)}px) url(#dissolve-goo)` : 'none';
      ctx.drawImage(gooCanvas, 0, 0);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (bursts.size) requestAnimationFrame(frame);
  else {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, overlay.width, overlay.height); running = false;
    if (gooCanvas.width) gooCanvas.width = gooCanvas.height = 0;
  }
}

/** Draws with fn(ctx) into a DPR canvas of w x h css px. */
export function snapshot(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * DPR);
  c.height = Math.ceil(h * DPR);
  const x = c.getContext('2d');
  x.scale(DPR, DPR);
  fn(x);
  return c;
}
