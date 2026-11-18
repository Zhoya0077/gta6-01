// Traffic: cars that cruise the grid, brake for the car ahead, pause at
// intersections, and wrap around the world so the streets never empty.
// They keep right, drive at modest speeds, and honk when cut off.

import { G, ROAD_LINES, WORLD_HALF } from './state.js';
import { createCar, moveCar } from './vehicles.js';
import { clamp } from './util.js';

const TRAFFIC_KEYS = ['vento', 'taxi', 'pickup', 'van', 'vento', 'taxi'];

export function spawnTraffic(scene, count, rng) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const key = TRAFFIC_KEYS[i % TRAFFIC_KEYS.length];
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const along = (rng() * 2 - 1) * (WORLD_HALF - 40);
    const offset = 3.1 * dir; // keep right
    const x = axis === 'x' ? along : line + offset;
    const z = axis === 'x' ? line + offset : along;
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(key, x, z, heading, {
      driver: 'traffic',
      randomPaint: key !== 'taxi',
      traffic: { axis, dir, line },
    });
    car.speed = 8 + rng() * 4;
    scene.add(car.mesh);
    G.cars.push(car);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(scene, count, rng, city) {
  const cars = [];
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    const along = (rng() * 2 - 1) * (WORLD_HALF - 30);
    const side = rng() < 0.5 ? 1 : -1;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : line + side * 5.2;
    const z = horizontal ? line + side * 5.2 : along;
    // Never park on the pier approach or inside a building.
    if (x > 240) continue;
    const res = city.collideCircle(x, z, 2.2);
    if (res.hit) continue;
    // Keep clear of other parked cars.
    let clear = true;
    for (const other of G.cars) {
      if (Math.hypot(other.mesh.position.x - x, other.mesh.position.z - z) < 7) { clear = false; break; }
    }
    if (!clear) continue;
    const key = ['vento', 'pickup', 'van', 'vento'][Math.floor(rng() * 4)];
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const car = createCar(key, x, z, heading, { driver: 'parked', randomPaint: true });
    scene.add(car.mesh);
    G.cars.push(car);
    cars.push(car);
    placed++;
  }
  return cars;
}

function carAhead(car, maxDist) {
  let best = null;
  let bestD = maxDist;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.mesh.position.x - car.mesh.position.x;
    const dz = other.mesh.position.z - car.mesh.position.z;
    const forward = dx * fx + dz * fz;
    if (forward < 0 || forward > bestD) continue;
    const side = Math.abs(dx * fz - dz * fx);
    if (side > 2.6) continue;
    bestD = forward;
    best = other;
  }
  return best;
}

export function updateTraffic(dt, city) {
  const playerPos = G.player ? G.player.pos() : { x: 0, z: 0 };
  for (const car of G.cars) {
    if (car.driver !== 'traffic' || !car.traffic) continue;
    const t = car.traffic;
    // Cruise speed with gentle variation per car.
    const cruise = 9 + (car.mesh.position.x % 3);
    const ahead = carAhead(car, 14);
    let target = cruise;
    if (ahead) {
      const gap = Math.hypot(ahead.mesh.position.x - car.mesh.position.x, ahead.mesh.position.z - car.mesh.position.z);
      target = gap < 7 ? 0 : cruise * clamp((gap - 7) / 7, 0, 1);
    }
    // Random pause at intersections: a beat, then go.
    car.stuckTimer -= dt;
    const nearCrossing = ROAD_LINES.some((l) => Math.abs((t.axis === 'x' ? car.mesh.position.x : car.mesh.position.z) - l) < 4);
    if (nearCrossing && Math.random() < dt * 0.25 && car.stuckTimer <= 0) {
      car.stuckTimer = 1.2 + Math.random();
    }
    if (car.stuckTimer > 0) target = 0;
    car.speed += clamp(target - car.speed, -14 * dt, 6 * dt);
    car.speed = Math.max(0, car.speed);
    // Steer back onto the lane line.
    const lanePos = t.axis === 'x' ? car.mesh.position.z : car.mesh.position.x;
    const wantLane = t.line + 3.1 * t.dir;
    const laneErr = wantLane - lanePos;
    const wantHeading = t.axis === 'x'
      ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - laneErr * 0.06
      : (t.dir > 0 ? 0 : Math.PI) + laneErr * 0.06;
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
    moveCar(car, dt, city, null);
    // Wrap around the far edge so traffic never runs out.
    const p = car.mesh.position;
    if (t.axis === 'x' && Math.abs(p.x) > WORLD_HALF - 8) {
      p.x = -Math.sign(p.x) * (WORLD_HALF - 12);
    }
    if (t.axis === 'z' && Math.abs(p.z) > WORLD_HALF - 8) {
      p.z = -Math.sign(p.z) * (WORLD_HALF - 12);
    }
    // Far from the player? Teleport a stalled car closer to keep streets alive.
    if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > 320 && car.speed < 1) {
      const spot = city.randomRoadPos(Math.random);
      p.x = spot.x;
      p.z = spot.z;
    }
  }
}

// How many traffic cars are currently rolling (used by the HUD hint).
export function rollingTrafficCount() {
  let n = 0;
  for (const car of G.cars) if (car.driver === 'traffic' && car.speed > 1) n++;
  return n;
}
