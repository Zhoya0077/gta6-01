// Pedestrians: sidewalk wanderers who stop to chat, cross at corners,
// and run when a crime happens nearby. A fleeing crowd is the city's
// fastest way of telling the player the heat just went up.

import { G, WORLD_HALF } from './state.js';
import { makeFigure, animateFigure } from './characters.js';
import { makeRng } from './util.js';

export function spawnPeds(scene, count, seed, city) {
  const rng = makeRng(seed + 77);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const fig = makeFigure({ rng: rng.next });
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = rng.range(-WORLD_HALF + 20, 240);
      z = rng.range(-WORLD_HALF + 20, WORLD_HALF - 20);
      const res = city.collideCircle(x, z, 0.6);
      if (!res.hit && !city.isOnRoad(x, z)) break;
    }
    fig.group.position.set(x, 0, z);
    scene.add(fig.group);
    const ped = {
      fig,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      state: 'walk',
      target: null,
      idleTimer: rng.range(0, 4),
      fleeTimer: 0,
      health: 30,
      down: false,
      downTimer: 0,
    };
    G.peds.push(ped);
    peds.push(ped);
  }
  return peds;
}

function pickTarget(ped, city, nextFn) {
  // nextFn is a plain () => [0,1) function (Math.random or an RNG's
  // next), NOT the makeRng helper object — calling .range on it threw
  // every frame once the first pedestrian finished idling.
  const next = typeof nextFn === 'function' ? nextFn : Math.random;
  for (let tries = 0; tries < 12; tries++) {
    const x = ped.fig.group.position.x + (next() * 110 - 55);
    const z = ped.fig.group.position.z + (next() * 110 - 55);
    if (Math.abs(x) > WORLD_HALF - 15 || Math.abs(z) > WORLD_HALF - 15) continue;
    if (x > 250) continue;
    const res = city.collideCircle(x, z, 0.6);
    if (res.hit) continue;
    return { x: res.x, z: res.z };
  }
  return null;
}

export function updatePeds(dt, city, rngFn) {
  const playerPos = G.player ? G.player.pos() : { x: 0, z: 0 };
  const crime = G.lastCrimePos;
  const crimeFresh = crime && G.time - G.lastCrimeTime < 6;
  for (const ped of G.peds) {
    const p = ped.fig.group.position;
    if (ped.down) {
      ped.downTimer -= dt;
      ped.fig.group.rotation.x = Math.min(Math.PI / 2, ped.fig.group.rotation.x + dt * 4);
      if (ped.downTimer <= 0) {
        ped.down = false;
        ped.health = 30;
        ped.fig.group.rotation.x = 0;
        ped.state = 'flee';
        ped.fleeTimer = 4;
      }
      continue;
    }
    // Flee triggers: fresh crime nearby, high wanted + player close,
    // or a car bearing down on the sidewalk.
    let flee = ped.fleeTimer > 0;
    if (crimeFresh && Math.hypot(p.x - crime.x, p.z - crime.z) < 42) flee = true;
    if (G.wanted >= 2 && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 20) flee = true;
    if (flee) {
      ped.state = 'flee';
      ped.fleeTimer = Math.max(ped.fleeTimer, 2.5);
    }
    ped.fleeTimer = Math.max(0, ped.fleeTimer - dt);

    if (ped.state === 'flee') {
      // Run away from the threat, preferring open ground.
      const awayFrom = crimeFresh ? crime : playerPos;
      const away = Math.atan2(p.x - awayFrom.x, p.z - awayFrom.z);
      ped.heading += (away - ped.heading) * Math.min(1, dt * 4);
      // Normalise heading drift.
      while (ped.heading > Math.PI) ped.heading -= Math.PI * 2;
      while (ped.heading < -Math.PI) ped.heading += Math.PI * 2;
      ped.speed = 6.4;
      let nx = p.x + Math.sin(ped.heading) * ped.speed * dt;
      let nz = p.z + Math.cos(ped.heading) * ped.speed * dt;
      const res = city.collideCircle(nx, nz, 0.5);
      if (res.hit) {
        ped.heading += Math.PI / 2;
        nx = p.x;
        nz = p.z;
      }
      p.x = nx;
      p.z = nz;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = null;
      }
      animateFigure(ped.fig, ped.speed, dt, {});
    } else {
      ped.idleTimer -= dt;
      if (!ped.target) {
        if (ped.idleTimer <= 0) {
          ped.target = pickTarget(ped, city, rngFn || Math.random);
          if (!ped.target) ped.idleTimer = 2;
        }
        ped.speed = 0;
        animateFigure(ped.fig, 0, dt, {});
      } else {
        const dx = ped.target.x - p.x;
        const dz = ped.target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          ped.target = null;
          ped.idleTimer = 1 + Math.random() * 5;
          ped.speed = 0;
        } else {
          const want = Math.atan2(dx, dz);
          let dh = want - ped.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          ped.heading += Math.max(-3 * dt, Math.min(3 * dt, dh));
          ped.speed = 1.7;
          let nx = p.x + Math.sin(ped.heading) * ped.speed * dt;
          let nz = p.z + Math.cos(ped.heading) * ped.speed * dt;
          const res = city.collideCircle(nx, nz, 0.5);
          p.x = res.x;
          p.z = res.z;
        }
        animateFigure(ped.fig, ped.speed, dt, {});
      }
    }
    ped.fig.group.rotation.y = ped.heading;
  }
}

export function knockDownPed(ped) {
  ped.down = true;
  ped.downTimer = 6;
  ped.health = 0;
}

// Nearest pedestrian to a point, for punch and shot resolution.
export function nearestPed(x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const ped of G.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.fig.group.position.x - x, ped.fig.group.position.z - z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
