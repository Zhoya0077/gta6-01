// Small pure helpers shared by every system: deterministic RNG, angles,
// easing and formatting. Nothing here touches the scene or the DOM.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent smoothing: damp(current, target, rate, dt).
export function damp(a, b, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return a + (b - a) * t;
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
  const u = 1 - t;
  return 1 - u * u * u;
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
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Shortest signed turn from heading a toward target point, in radians.
export function turnToward(ax, az, heading, bx, bz) {
  const want = Math.atan2(bx - ax, bz - az);
  return wrapAngle(want - heading);
}
