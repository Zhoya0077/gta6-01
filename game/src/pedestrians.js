// Pedestrians: Solmarina locals strolling the sidewalks, turning at
// corners, and fleeing when crime erupts or a car bears down on them.

import { G, ROAD_LINES, on } from './state.js';
import { clamp, angleLerp, resolveColliders, dist2, pick } from './util.js';
import { clampToWorld } from './city.js';
import { makeHumanoid, animateHumanoid } from './characters.js';

const PED_COUNT = 16;
const SIDEWALK_OFF = 8.5;

function sidewalkPoint(rng) {
  const vertical = rng() < 0.5;
  const line = pick(rng, ROAD_LINES);
  const along = -240 + rng() * 480;
  const side = rng() < 0.5 ? -1 : 1;
  return {
    x: vertical ? line + side * SIDEWALK_OFF : along,
    z: vertical ? along : line + side * SIDEWALK_OFF,
    axis: vertical ? 'z' : 'x',
    dir: rng() < 0.5 ? 1 : -1,
    line,
    side,
  };
}

export function spawnPedestrians(scene, rng) {
  for (let i = 0; i < PED_COUNT; i++) {
    const spot = sidewalkPoint(rng);
    const fig = makeHumanoid({ rng });
    fig.group.position.set(spot.x, 0, spot.z);
    scene.add(fig.group);
    const ped = {
      fig,
      heading: spot.axis === 'z' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      axis: spot.axis,
      dir: spot.dir,
      line: spot.line,
      side: spot.side,
      speed: 2 + rng() * 1.4,
      walkPhase: rng() * 10,
      health: 30,
      dead: false,
      deadTimer: 0,
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      lastJunction: null,
      speedNorm: 0.5,
    };
    fig.group.userData.entity = { kind: 'ped', ref: ped };
    G.peds.push(ped);
  }

  // A crime nearby sends every ped in earshot running.
  on('crime', (data) => {
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const d = dist2(ped.fig.group.position.x, ped.fig.group.position.z, data.x, data.z);
      if (d < 34) {
        ped.fleeTimer = 3 + Math.random() * 2;
        ped.fleeX = ped.fig.group.position.x - data.x;
        ped.fleeZ = ped.fig.group.position.z - data.z;
      }
    }
  });
}

export function damagePed(ped, amount, sourceX, sourceZ) {
  if (ped.dead) return;
  ped.health -= amount;
  ped.fleeTimer = 4;
  ped.fleeX = ped.fig.group.position.x - sourceX;
  ped.fleeZ = ped.fig.group.position.z - sourceZ;
  if (ped.health <= 0) {
    ped.dead = true;
    ped.deadTimer = 0;
    ped.fig.group.rotation.x = Math.PI / 2;
    ped.fig.group.position.y = 0.3;
  }
}

export function updatePedestrians(dt) {
  const playerPos = G.player ? G.player.position() : null;
  for (const ped of G.peds) {
    const pos = ped.fig.group.position;
    if (ped.dead) {
      ped.deadTimer += dt;
      if (ped.deadTimer > 12) {
        // The city cleans up: respawn the ped far from the player.
        const spot = sidewalkPoint(G.rng);
        pos.set(spot.x, 0, spot.z);
        ped.fig.group.rotation.x = 0;
        ped.health = 30;
        ped.dead = false;
        ped.axis = spot.axis;
        ped.dir = spot.dir;
        ped.line = spot.line;
        ped.side = spot.side;
        ped.heading = spot.axis === 'z' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      continue;
    }

    // A fast car closing in also triggers a flee.
    if (ped.fleeTimer <= 0 && playerPos) {
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 8) continue;
        const d = dist2(pos.x, pos.z, car.mesh.position.x, car.mesh.position.z);
        if (d < 8) {
          ped.fleeTimer = 2.5;
          ped.fleeX = pos.x - car.mesh.position.x;
          ped.fleeZ = pos.z - car.mesh.position.z;
          break;
        }
      }
    }

    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      const len = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
      const targetHeading = Math.atan2(ped.fleeX / len, ped.fleeZ / len);
      ped.heading = angleLerp(ped.heading, targetHeading, 1 - Math.exp(-8 * dt));
      pos.x += Math.sin(ped.heading) * 7 * dt;
      pos.z += Math.cos(ped.heading) * 7 * dt;
      ped.walkPhase += 7 * dt * 1.9;
      ped.speedNorm = 1;
    } else {
      // Stroll the sidewalk; turn at intersections sometimes.
      const along = ped.axis === 'z' ? pos.z : pos.x;
      for (const cross of ROAD_LINES) {
        if (Math.abs(along - cross) < 2 && ped.lastJunction !== cross) {
          ped.lastJunction = cross;
          if (G.rng() < 0.3) {
            const newAxis = ped.axis === 'z' ? 'x' : 'z';
            ped.axis = newAxis;
            ped.dir = G.rng() < 0.5 ? 1 : -1;
            ped.line = cross;
            ped.side = G.rng() < 0.5 ? -1 : 1;
          }
          break;
        }
        if (Math.abs(along - cross) > 12 && ped.lastJunction === cross) ped.lastJunction = null;
      }
      const targetHeading = ped.axis === 'z'
        ? (ped.dir > 0 ? 0 : Math.PI)
        : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.heading = angleLerp(ped.heading, targetHeading, 1 - Math.exp(-4 * dt));
      pos.x += Math.sin(ped.heading) * ped.speed * dt;
      pos.z += Math.cos(ped.heading) * ped.speed * dt;
      // Drift back onto the sidewalk line.
      const target = ped.axis === 'z' ? ped.line + ped.side * SIDEWALK_OFF : ped.line + ped.side * SIDEWALK_OFF;
      if (ped.axis === 'z') pos.x += clamp(target - pos.x, -1, 1) * dt * 1.5;
      else pos.z += clamp(target - pos.z, -1, 1) * dt * 1.5;
      ped.walkPhase += ped.speed * dt * 1.7;
      ped.speedNorm = 0.5;
      // Turn around at the map edge.
      if (Math.abs(pos.x) > 250 || Math.abs(pos.z) > 250) ped.dir *= -1;
    }

    resolveColliders(pos, 0.45, G.city.colliders);
    clampToWorld(pos, 0.45);
    ped.fig.group.rotation.y = ped.heading;
    animateHumanoid(ped.fig, ped.walkPhase, ped.speedNorm, 0);
  }
}
