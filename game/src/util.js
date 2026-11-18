// Pure little helpers every other system leans on: a seeded random
// stream, angle math that never spins the long way round, easing, and
// the text formatting the HUD prints. No scene, no DOM, no state here.

export function mulberry32(seed) {
  let acc = seed >>> 0;
  return function () {
    acc |= 0;
    acc = (acc + 0x6d2b79f5) | 0;
    let mixed = Math.imul(acc ^ (acc >>> 15), 1 | acc);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A friendly wrapper around one seeded stream. Only this object carries
// range/int/pick/chance — a bare next() function has none of them, and
// calling them on one used to throw every single frame.
export function makeRng(seed) {
  const step = mulberry32(seed);
  return {
    next: step,
    range(lo, hi) { return lo + step() * (hi - lo); },
    int(lo, hi) { return Math.floor(lo + step() * (hi - lo + 1)); },
    pick(list) { return list[Math.floor(step() * list.length)]; },
    chance(p) { return step() < p; },
  };
}

export function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothing that behaves the same at any frame rate: rate is the
// "half-life" speed, so higher values settle visibly faster.
export function damp(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function angleDamp(a, b, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return a + wrapAngle(b - a) * t;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function easeOutCubic(t) {
  const rest = 1 - t;
  return 1 - rest * rest * rest;
}

export function formatMoney(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatClock(hours) {
  const h = Math.floor(((hours % 24) + 24) % 24);
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function formatTimer(sec) {
  const left = Math.max(0, Math.ceil(sec));
  return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
}

// Signed turn, in radians, from heading `heading` toward point (bx, bz).
export function turnToward(ax, az, heading, bx, bz) {
  const want = Math.atan2(bx - ax, bz - az);
  return wrapAngle(want - heading);
}
