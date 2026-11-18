// Ambient traffic: cars that cruise the road grid in their lanes, turn at
// intersections, brake for the car ahead, and stay near the player by
// respawning further down the road when they fall behind.

import { G, ROAD_LINES } from './state.js';
import { clamp, angleDiff, dist2, pick } from './util.js';
import { createCar, driveCar } from './vehicles.js';
import { randomRoadPoint as cityRoadPoint } from './city.js';

const TRAFFIC_COUNT = 9;
const CRUISE_MIN = 9;
const CRUISE_MAX = 13;

function laneOffsetFor(heading) {
  // Right-hand traffic: the lane sits to the right of the centre line.
  return { x: -Math.cos(heading) * 2.8, z: Math.sin(heading) * 2.8 };
}

function desiredHeading(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function spawnTraffic(scene, rng) {
  const defKeys = ['vento', 'vento', 'taxi', 'tortuga', 'vento'];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const axis = rng() < 0.5 ? 'z' : 'x';
    const dir = rng() < 0.5 ? 1 : -1;
    const line = pick(rng, ROAD_LINES);
    const along = -240 + rng() * 480;
    const heading = desiredHeading(axis, dir);
    const off = laneOffsetFor(heading);
    const x = axis === 'z' ? line + off.x : along + off.x;
    const z = axis === 'z' ? along + off.z : line + off.z;
    const defKey = pick(rng, defKeys);
    const car = createCar(scene, defKey, x, z, heading, {
      driver: 'traffic',
      color: defKey === 'taxi' ? 0xf2c230 : undefined,
    });
    car.mesh.userData.paint = car.bodyMat.color.getHex();
    car.traffic = {
      axis, dir, line,
      cruise: CRUISE_MIN + rng() * (CRUISE_MAX - CRUISE_MIN),
      lastJunction: null,
      brakeTimer: 0,
    };
  }
}

function carAhead(car, range) {
  const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
  let nearest = null;
  let nearestD = range;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.mesh.position.x - car.mesh.position.x;
    const dz = other.mesh.position.z - car.mesh.position.z;
    const ahead = dx * fwd.x + dz * fwd.z;
    if (ahead < 1 || ahead > range) continue;
    const side = Math.abs(dx * fwd.z - dz * fwd.x);
    if (side > 2.6) continue;
    const d = Math.hypot(dx, dz);
    if (d < nearestD) {
      nearestD = d;
      nearest = other;
    }
  }
  return nearest;
}

export function updateTraffic(dt) {
  const playerPos = G.player ? G.player.position() : { x: 0, z: 0 };
  for (const car of G.cars) {
    const ai = car.traffic;
    if (!ai || car.driver !== 'traffic') continue;

    // Wrecked traffic cars become abandoned wrecks.
    if (car.health <= 0) {
      car.driver = 'parked';
      car.traffic = null;
      continue;
    }

    // Too far from the action: reappear on a road near the player.
    if (dist2(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z) > 300) {
      const pt = cityRoadPoint(G.rng, { x: 0, z: 0 });
      // Bias the respawn toward the player's neighbourhood.
      car.mesh.position.x = playerPos.x + clamp(pt.x - playerPos.x, -140, 140) * 0.6 + (G.rng() - 0.5) * 40;
      car.mesh.position.z = playerPos.z + clamp(pt.z - playerPos.z, -140, 140) * 0.6 + (G.rng() - 0.5) * 40;
      // Snap onto the nearest road line.
      let bestLine = ROAD_LINES[0];
      let bestD = Infinity;
      for (const line of ROAD_LINES) {
        const d = Math.min(Math.abs(car.mesh.position.x - line), Math.abs(car.mesh.position.z - line));
        if (d < bestD) { bestD = d; bestLine = line; }
      }
      if (Math.abs(car.mesh.position.x - bestLine) < Math.abs(car.mesh.position.z - bestLine)) {
        ai.axis = 'z';
        ai.line = bestLine;
      } else {
        ai.axis = 'x';
        ai.line = bestLine;
      }
      ai.dir = G.rng() < 0.5 ? 1 : -1;
      car.heading = desiredHeading(ai.axis, ai.dir);
      car.speed = 0;
      continue;
    }

    // Junction decisions: at an intersection, sometimes turn.
    const along = ai.axis === 'z' ? car.mesh.position.z : car.mesh.position.x;
    for (const cross of ROAD_LINES) {
      const key = cross;
      if (Math.abs(along - cross) < 2.5 && ai.lastJunction !== key) {
        ai.lastJunction = key;
        if (G.rng() < 0.38) {
          const turnLeft = G.rng() < 0.5;
          const newAxis = ai.axis === 'z' ? 'x' : 'z';
          let newDir;
          if (ai.axis === 'z') newDir = (ai.dir > 0) === turnLeft ? -1 : 1;
          else newDir = (ai.dir > 0) === turnLeft ? 1 : -1;
          ai.axis = newAxis;
          ai.dir = newDir;
          ai.line = cross;
        }
        break;
      }
      if (Math.abs(along - cross) > 12 && ai.lastJunction === key) ai.lastJunction = null;
    }

    // Steer toward the desired heading, plus a pull back into the lane.
    const target = desiredHeading(ai.axis, ai.dir);
    const off = laneOffsetFor(target);
    const laneX = ai.axis === 'z' ? ai.line + off.x : car.mesh.position.x;
    const laneZ = ai.axis === 'x' ? ai.line + off.z : car.mesh.position.z;
    let steer = clamp(angleDiff(car.heading, target) * 2.2, -1, 1);
    if (ai.axis === 'z') steer += clamp((laneX - car.mesh.position.x) * 0.12, -0.5, 0.5) * ai.dir;
    else steer += clamp((laneZ - car.mesh.position.z) * 0.12, -0.5, 0.5) * ai.dir * -1;

    // Brake for the car ahead; otherwise cruise.
    const ahead = carAhead(car, 13);
    let throttle = 0.75;
    if (ahead) {
      const gap = dist2(car.mesh.position.x, car.mesh.position.z, ahead.mesh.position.x, ahead.mesh.position.z);
      throttle = gap < 7 ? -0.9 : 0.15;
    }
    if (car.speed > ai.cruise) throttle = Math.min(throttle, 0);
    driveCar(car, { throttle, steer: clamp(steer, -1, 1), handbrake: false }, dt);
  }
}
