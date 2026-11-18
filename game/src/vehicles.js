// Vehicles for Solmarina: car definitions, the box-built car meshes, arcade
// driving physics with building and car-to-car collision, and the parked
// cars scattered around the city waiting to be stolen.

import * as THREE from 'three';
import { G, ROAD_LINES, ROAD_WIDTH } from './state.js';
import { clamp, damp, resolveColliders, dist2, pick } from './util.js';
import { clampToWorld } from './city.js';

export const CAR_DEFS = {
  vento: { name: 'Vento', kind: 'sedan', maxSpeed: 26, accel: 13, handling: 1.0, health: 100, length: 4.2, width: 1.9 },
  taxi: { name: 'Solmarina Taxi', kind: 'sedan', maxSpeed: 26, accel: 13, handling: 1.0, health: 100, length: 4.2, width: 1.9 },
  tortuga: { name: 'Tortuga Pickup', kind: 'pickup', maxSpeed: 23, accel: 11, handling: 0.9, health: 130, length: 4.6, width: 2.0 },
  falcon: { name: 'Falcon GT', kind: 'sports', maxSpeed: 36, accel: 18, handling: 1.25, health: 90, length: 4.1, width: 1.9 },
  aurora: { name: 'Aurora S', kind: 'super', maxSpeed: 42, accel: 22, handling: 1.35, health: 90, length: 4.3, width: 2.0 },
  interceptor: { name: 'Police Interceptor', kind: 'police', maxSpeed: 34, accel: 17, handling: 1.2, health: 140, length: 4.2, width: 1.9 },
};

const PAINT_COLORS = [0xc23b3b, 0x3b6ec2, 0x3ba86b, 0xd8d8d8, 0x2e2e34, 0xe0a83b, 0x7a4fc2, 0x4fb8c2, 0xe8e0d0];

let carIdCounter = 1;

function makeWheel() {
  const steerGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  tyre.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8),
    new THREE.MeshLambertMaterial({ color: 0xb8b8b8 }),
  );
  hub.rotation.z = Math.PI / 2;
  spinGroup.add(tyre, hub);
  steerGroup.add(spinGroup);
  return { steerGroup, spinGroup };
}

// Build a car mesh facing +Z. Returns the group plus the parts the driving
// code animates (wheels, light bar, body material for damage tinting).
export function makeCarMesh(defKey, colorHex) {
  const def = CAR_DEFS[defKey];
  const group = new THREE.Group();
  const paint = colorHex ?? pick(Math.random, PAINT_COLORS);
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2c3a });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x222226 });

  const low = def.kind === 'sports' || def.kind === 'super';
  const bodyH = low ? 0.45 : 0.55;
  const bodyY = low ? 0.5 : 0.58;
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, bodyH, def.length), bodyMat);
  body.position.y = bodyY;
  group.add(body);

  if (def.kind === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.2, 0.55, 1.7), bodyMat);
    cab.position.set(0, bodyY + 0.5, -0.7);
    group.add(cab);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.4, 0.45, 0.1), glassMat);
    windshield.position.set(0, bodyY + 0.5, 0.18);
    group.add(windshield);
    const bedWall = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.3, 0.15), trimMat);
    bedWall.position.set(0, bodyY + 0.35, def.length / 2 - 0.1);
    group.add(bedWall);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.25, 0.5, def.length * 0.45), glassMat);
    cabin.position.set(0, bodyY + bodyH / 2 + 0.2, -def.length * 0.06);
    group.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.3, 0.08, def.length * 0.32), bodyMat);
    roof.position.set(0, bodyY + bodyH / 2 + 0.47, -def.length * 0.06);
    group.add(roof);
  }

  if (def.kind === 'super') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.1, 0.5), trimMat);
    spoiler.position.set(0, bodyY + 0.55, -def.length / 2 + 0.3);
    group.add(spoiler);
  }
  if (defKey === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    sign.position.set(0, bodyY + bodyH / 2 + 0.58, -def.length * 0.06);
    group.add(sign);
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(side * (def.width / 2 - 0.35), bodyY, def.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tail.position.set(side * (def.width / 2 - 0.35), bodyY, -def.length / 2 - 0.01);
    group.add(tail);
  }

  // Wheels.
  const wheelZ = def.length / 2 - 0.85;
  const wheelX = def.width / 2 - 0.12;
  const wheels = {
    fl: makeWheel(), fr: makeWheel(), rl: makeWheel(), rr: makeWheel(),
  };
  wheels.fl.steerGroup.position.set(-wheelX, 0.36, wheelZ);
  wheels.fr.steerGroup.position.set(wheelX, 0.36, wheelZ);
  wheels.rl.steerGroup.position.set(-wheelX, 0.36, -wheelZ);
  wheels.rr.steerGroup.position.set(wheelX, 0.36, -wheelZ);
  group.add(wheels.fl.steerGroup, wheels.fr.steerGroup, wheels.rl.steerGroup, wheels.rr.steerGroup);

  // Police light bar.
  let lightBar = null;
  if (def.kind === 'police') {
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), redMat);
    red.position.set(-0.3, bodyY + bodyH / 2 + 0.55, -def.length * 0.06);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), blueMat);
    blue.position.set(0.3, bodyY + bodyH / 2 + 0.55, -def.length * 0.06);
    group.add(red, blue);
    lightBar = { red, blue, redMat, blueMat, phase: Math.random() * 10 };
  }

  return { group, bodyMat, wheels, lightBar, paint };
}

export function createCar(scene, defKey, x, z, heading, options) {
  const opts = options || {};
  const def = CAR_DEFS[defKey];
  const built = makeCarMesh(defKey, opts.color);
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading;
  scene.add(built.group);
  const car = {
    id: carIdCounter++,
    defKey,
    def,
    name: def.name,
    mesh: built.group,
    bodyMat: built.bodyMat,
    wheels: built.wheels,
    lightBar: built.lightBar,
    heading,
    speed: 0,
    steer: 0,
    health: def.health,
    maxHealth: def.health,
    driver: opts.driver || 'parked', // parked | traffic | player | police | none
    isPolice: def.kind === 'police',
    radius: Math.max(def.length, def.width) / 2 + 0.2,
    stuckTimer: 0,
    lastX: x,
    lastZ: z,
    smoke: 0,
    honkCooldown: 0,
  };
  built.group.userData.entity = { kind: 'car', ref: car };
  G.cars.push(car);
  return car;
}

export function removeCar(scene, car) {
  scene.remove(car.mesh);
  const idx = G.cars.indexOf(car);
  if (idx !== -1) G.cars.splice(idx, 1);
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

// Arcade driving step. control: { throttle: -1..1, steer: -1..1, handbrake: bool }
export function driveCar(car, control, dt) {
  const def = car.def;
  const disabled = car.health <= 0;
  const maxSpeed = disabled ? 6 : def.maxSpeed;

  // Steering smooths toward the target and bites less at high speed.
  car.steer = damp(car.steer, clamp(control.steer || 0, -1, 1), 8, dt);
  const speedNorm = clamp(Math.abs(car.speed) / def.maxSpeed, 0, 1);
  const grip = 1 - speedNorm * 0.45;
  const yawRate = car.steer * 2.1 * def.handling * grip * clamp(car.speed / 7, -1, 1);
  car.heading += yawRate * dt * (control.handbrake ? 1.5 : 1);

  // Longitudinal: accelerate, brake, reverse, drag.
  const throttle = clamp(control.throttle || 0, -1, 1);
  if (throttle > 0) {
    const headroom = Math.max(0, 1 - car.speed / maxSpeed);
    car.speed += def.accel * headroom * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 0.5) {
      car.speed -= 30 * dt; // braking
    } else {
      car.speed = Math.max(-8, car.speed + def.accel * 0.6 * throttle * dt);
    }
  }
  if (control.handbrake) {
    car.speed = damp(car.speed, 0, 3.2, dt);
  }
  // Rolling drag and a gentle stop when no input.
  car.speed -= car.speed * 0.35 * dt;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -8, maxSpeed);

  const fwd = carForward(car);
  const prevX = car.mesh.position.x;
  const prevZ = car.mesh.position.z;
  car.mesh.position.x += fwd.x * car.speed * dt;
  car.mesh.position.z += fwd.z * car.speed * dt;
  clampToWorld(car.mesh.position, 2);

  // Building collision: push out, kill speed on a real hit, take damage on
  // hard hits. A slow scrape (impact <= 3) only pushes out — killing speed
  // on every contact frame would stall a car sliding along a wall.
  const pos = car.mesh.position;
  const hits = resolveColliders(pos, 1.9, G.city.colliders);
  if (hits > 0) {
    const impact = Math.abs(car.speed);
    if (impact > 3) car.speed *= 0.3;
    if (impact > 9) {
      damageCar(car, (impact - 9) * 1.6);
      if (G.audio) G.audio.crash(impact);
      if (car.driver === 'player') {
        const excess = impact - 12;
        if (excess > 0 && G.player) G.player.damage(excess * 0.9, 'crash');
      }
    }
  }

  // Stuck detection, used by AI drivers to give up and respawn.
  const moved = dist2(pos.x, pos.z, car.lastX, car.lastZ);
  if (Math.abs(car.speed) > 3 && moved < 0.02) car.stuckTimer += dt;
  else car.stuckTimer = 0;
  car.lastX = pos.x;
  car.lastZ = pos.z;

  // Sync the mesh and animate the wheels.
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed / 0.36) * dt;
  for (const key of ['fl', 'fr', 'rl', 'rr']) {
    car.wheels[key].spinGroup.rotation.x += spin;
  }
  const steerAngle = car.steer * 0.42;
  car.wheels.fl.steerGroup.rotation.y = steerAngle;
  car.wheels.fr.steerGroup.rotation.y = steerAngle;

  // Police light bar strobes while the car is active.
  if (car.lightBar) {
    car.lightBar.phase += dt * 9;
    const on = Math.sin(car.lightBar.phase) > 0;
    car.lightBar.redMat.color.setHex(on ? 0xff2222 : 0x550000);
    car.lightBar.blueMat.color.setHex(on ? 0x001155 : 0x2266ff);
  }

  return { movedX: pos.x - prevX, movedZ: pos.z - prevZ };
}

export function damageCar(car, amount) {
  if (car.health <= 0) return;
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0) {
    car.speed *= 0.3;
    // Wrecked cars go dark.
    car.bodyMat.color.multiplyScalar(0.45);
  }
}

export function repairCar(car) {
  car.health = car.maxHealth;
  car.bodyMat.color.setHex(car.mesh.userData.paint ?? 0xffffff);
}

// Pairwise car-to-car collision: push apart, bleed speed, small damage.
export function resolveCarCollisions(dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const minDist = 3.4;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.mesh.position.x -= nx * push;
      a.mesh.position.z -= nz * push;
      b.mesh.position.x += nx * push;
      b.mesh.position.z += nz * push;
      const closing = Math.abs(a.speed - b.speed);
      if (closing > 6) {
        damageCar(a, (closing - 6) * 0.8);
        damageCar(b, (closing - 6) * 0.8);
        if ((a.driver === 'player' || b.driver === 'player') && G.audio) G.audio.crash(closing);
        if (a.driver === 'player' && G.player) G.player.damage((closing - 8) * 0.5, 'crash');
        if (b.driver === 'player' && G.player) G.player.damage((closing - 8) * 0.5, 'crash');
      }
      a.speed *= 0.72;
      b.speed *= 0.72;
    }
  }
}

export function nearestCar(x, z, maxDist, exclude) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car === exclude) continue;
    const d = dist2(x, z, car.mesh.position.x, car.mesh.position.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// Parked cars along road edges, plus the two story cars in their fixed spots.
export function spawnParkedCars(scene, rng) {
  const spots = [];
  let guard = 0;
  while (spots.length < 12 && guard++ < 200) {
    const vertical = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const along = -230 + rng() * 460;
    // Keep clear of intersections.
    let nearCrossing = false;
    for (const other of ROAD_LINES) {
      if (Math.abs(along - other) < 14) nearCrossing = true;
    }
    if (nearCrossing) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const off = side * (ROAD_WIDTH / 2 + 1.7);
    const x = vertical ? line + off : along;
    const z = vertical ? along : line + off;
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    // Keep clear of other parked cars and of the story spots.
    let crowded = false;
    for (const s of spots) {
      if (dist2(x, z, s.x, s.z) < 12) crowded = true;
    }
    if (dist2(x, z, G.city.locations.falconSpot.x, G.city.locations.falconSpot.z) < 14) crowded = true;
    if (dist2(x, z, G.city.locations.auroraSpot.x, G.city.locations.auroraSpot.z) < 14) crowded = true;
    if (crowded) continue;
    spots.push({ x, z, heading });
  }
  const defKeys = ['vento', 'vento', 'taxi', 'tortuga', 'vento', 'tortuga'];
  for (const s of spots) {
    const defKey = pick(rng, defKeys);
    const color = defKey === 'taxi' ? 0xf2c230 : undefined;
    const car = createCar(scene, defKey, s.x, s.z, s.heading, { driver: 'parked', color });
    car.mesh.userData.paint = car.bodyMat.color.getHex();
  }
  // The Falcon GT, hero car of mission 2.
  const falcon = createCar(scene, 'falcon', G.city.locations.falconSpot.x, G.city.locations.falconSpot.z, Math.PI / 2, { driver: 'parked', color: 0xc23b3b });
  falcon.mesh.userData.paint = 0xc23b3b;
  falcon.storyCar = 'falcon';
  // The Aurora S, the prize of mission 5, parked at the marina.
  const aurora = createCar(scene, 'aurora', G.city.locations.auroraSpot.x, G.city.locations.auroraSpot.z, Math.PI, { driver: 'parked', color: 0x2ee6c8 });
  aurora.mesh.userData.paint = 0x2ee6c8;
  aurora.storyCar = 'aurora';
  return { falcon, aurora };
}
