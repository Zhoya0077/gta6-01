// Small math helpers shared by every Solmarina system. No dependencies.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential smoothing toward a target.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// Shortest-arc interpolation between two headings (radians).
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Deterministic seeded random generator (mulberry32) so a ?seed= run
// always builds the same city, which keeps screenshots reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

// Push a circle (x, z, radius) out of an axis-aligned box. Returns true
// when a correction was applied. Boxes are {minX, maxX, minZ, maxZ}.
// The push-out leaves a small skin beyond the radius: without it a circle
// resting exactly at radius distance re-triggers on float noise every
// frame, which pinned a scraping car at near-zero speed forever.
export function circleVsBox(pos, radius, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  const skin = 0.06;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    const push = (radius + skin - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
  } else {
    // Centre is inside the box: push out along the smallest penetration.
    const pushLeft = pos.x - box.minX + radius + skin;
    const pushRight = box.maxX - pos.x + radius + skin;
    const pushBack = pos.z - box.minZ + radius + skin;
    const pushFront = box.maxZ - pos.z + radius + skin;
    const m = Math.min(pushLeft, pushRight, pushBack, pushFront);
    if (m === pushLeft) pos.x = box.minX - radius - skin;
    else if (m === pushRight) pos.x = box.maxX + radius + skin;
    else if (m === pushBack) pos.z = box.minZ - radius - skin;
    else pos.z = box.maxZ + radius + skin;
  }
  return true;
}

// Resolve a circle against every collider in the list. Returns the number
// of colliders hit, so callers can tell a scrape from a hard impact.
export function resolveColliders(pos, radius, colliders) {
  let hits = 0;
  for (let i = 0; i < colliders.length; i++) {
    if (circleVsBox(pos, radius, colliders[i])) hits++;
  }
  return hits;
}

export function formatClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function formatMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
