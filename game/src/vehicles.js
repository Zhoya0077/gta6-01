// Cars: six invented models, built from boxes with wheels that spin and
// steer, headlights that glow at night, and brake lights. Physics is a
// simple arcade bicycle model with drift on the handbrake, wall scrape
// handling, and car-to-car bumps.

import * as THREE from 'three';
import { clamp, damp } from './util.js';

export const CAR_DEFS = {
  vento: { name: 'Vento', topSpeed: 26, accel: 13, grip: 3.4, length: 4.4, width: 1.9, body: 0x3a6ea5, kind: 'sedan' },
  falcon: { name: 'Falcon GT', topSpeed: 36, accel: 19, grip: 4.4, length: 4.2, width: 1.85, body: 0xc0392b, kind: 'sports' },
  taxi: { name: 'Marina Cab', topSpeed: 24, accel: 11, grip: 3.2, length: 4.4, width: 1.9, body: 0xe0a526, kind: 'taxi' },
  pickup: { name: 'Bravo Pickup', topSpeed: 24, accel: 11, grip: 3.0, length: 4.8, width: 2.0, body: 0x4a6b4a, kind: 'truck' },
  van: { name: 'Coast Van', topSpeed: 21, accel: 9, grip: 2.8, length: 4.9, width: 2.05, body: 0xdddddd, kind: 'van' },
  aurora: { name: 'Aurora S', topSpeed: 39, accel: 21, grip: 4.8, length: 4.1, width: 1.8, body: 0x9b59b6, kind: 'sports' },
  interceptor: { name: 'Interceptor', topSpeed: 33, accel: 18, grip: 4.2, length: 4.4, width: 1.9, body: 0x1a2436, kind: 'police' },
};

const PAINTS = [0x3a6ea5, 0xc0392b, 0xdddddd, 0x222831, 0x2e8b74, 0xd8d8d8, 0x8a6b3a, 0x5b4a68, 0x4a6b4a];

export function makeCarMesh(defKey, paint) {
  const def = CAR_DEFS[defKey];
  const color = paint ?? def.body;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.1, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.8 });
  const L = def.length;
  const W = def.width;
  const low = def.kind === 'sports' ? 0.42 : 0.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, L), bodyMat);
  body.position.y = low + 0.31;
  body.castShadow = true;
  group.add(body);
  let cabin;
  if (def.kind === 'van') {
    cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.85, L * 0.62), bodyMat);
    cabin.position.set(0, low + 0.95, -0.2);
  } else if (def.kind === 'truck') {
    cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.6, L * 0.34), glassMat);
    cabin.position.set(0, low + 0.85, L * 0.18);
  } else {
    cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.35, 0.55, L * 0.46), glassMat);
    cabin.position.set(0, low + 0.82, -L * 0.06);
  }
  cabin.castShadow = true;
  group.add(cabin);
  // Bumpers, grille, mirrors.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.22, 0.24), darkMat);
  bumperF.position.set(0, low + 0.18, L / 2);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -L / 2;
  group.add(bumperR);
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), darkMat);
    mirror.position.set(sx * (W / 2 + 0.06), low + 0.78, L * 0.14);
    group.add(mirror);
  }
  // Headlights + tail lights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d6, emissive: 0xfff2b0, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0.5 });
  const heads = [];
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), headMat);
    head.position.set(sx * (W / 2 - 0.35), low + 0.42, L / 2 + 0.02);
    group.add(head);
    heads.push(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tail.position.set(sx * (W / 2 - 0.35), low + 0.42, -L / 2 - 0.02);
    group.add(tail);
  }
  if (def.kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.24, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd54a, emissiveIntensity: 0.8 }),
    );
    sign.position.set(0, low + 1.22, -L * 0.06);
    group.add(sign);
  }
  if (def.kind === 'police') {
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }));
    barR.position.set(-0.28, low + 1.2, -L * 0.06);
    barB.position.set(0.28, low + 1.2, -L * 0.06);
    group.add(barR, barB);
    group.userData.lightBar = { barR, barB };
    // White doors stripe.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.3, L * 0.5), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }));
    stripe.position.set(0, low + 0.35, 0);
    group.add(stripe);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.4, metalness: 0.6 });
  const wheels = [];
  const steers = [];
  for (const [wx, wz, front] of [[-W / 2, L / 2 - 0.75, true], [W / 2, L / 2 - 0.75, true], [-W / 2, -L / 2 + 0.75, false], [W / 2, -L / 2 + 0.75, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10), hubMat);
    hub.geometry.rotateZ(Math.PI / 2);
    wheel.add(hub);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (front) steers.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.steers = steers;
  group.userData.headMat = headMat;
  group.userData.tailMat = tailMat;
  group.userData.wheelSpin = 0;
  return group;
}

export function createCar(defKey, x, z, heading, opts = {}) {
  const def = CAR_DEFS[defKey];
  const paint = opts.paint ?? (opts.randomPaint ? PAINTS[Math.floor(Math.random() * PAINTS.length)] : undefined);
  const mesh = makeCarMesh(defKey, paint);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    defKey,
    def,
    mesh,
    heading,
    speed: 0,
    steer: 0,
    driver: opts.driver || 'parked',
    health: 100,
    maxHealth: 100,
    storyCar: opts.storyCar || null,
    traffic: opts.traffic || null,
    police: opts.police || null,
    damageSmoke: 0,
    brakeOn: false,
    slipping: false,
    stuckTimer: 0,
  };
}

// Shared movement: advance along heading, resolve walls, spin wheels.
export function moveCar(car, dt, city, others) {
  const def = car.def;
  const step = car.speed * dt;
  let nx = car.mesh.position.x + Math.sin(car.heading) * step;
  let nz = car.mesh.position.z + Math.cos(car.heading) * step;
  // At crawl speed, skip the wall push so parked cars never get pinned
  // by collision float noise (a real bug in an earlier build).
  if (Math.abs(car.speed) > 0.6) {
    const res = city.collideCircle(nx, nz, def.width * 0.62, { skin: 0.06 });
    if (res.hit && Math.abs(car.speed) > 4) {
      car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.35 * dt * 10);
      car.speed *= 0.55;
    } else if (res.hit) {
      car.speed *= 0.85;
    }
    nx = res.x;
    nz = res.z;
  } else {
    const res = city.collideCircle(nx, nz, def.width * 0.55, { skin: 0.02 });
    nx = res.x;
    nz = res.z;
  }
  // Soft car-to-car bumps.
  if (others) {
    for (const other of others) {
      if (other === car) continue;
      const dx = nx - other.mesh.position.x;
      const dz = nz - other.mesh.position.z;
      const d = Math.hypot(dx, dz);
      const min = (def.length + other.def.length) / 2 * 0.62;
      if (d > 0.01 && d < min) {
        const push = (min - d) * 0.5;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
        const rel = Math.abs(car.speed - other.speed);
        if (rel > 6) {
          car.health = Math.max(0, car.health - rel * 0.4);
          other.health = Math.max(0, other.health - rel * 0.3);
          car.speed *= 0.6;
        }
      }
    }
  }
  car.mesh.position.x = nx;
  car.mesh.position.z = nz;
  car.mesh.rotation.y = car.heading;
  // Wheels: spin with speed, steer with input.
  const spin = car.speed * dt / 0.36;
  car.mesh.userData.wheelSpin += spin;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.mesh.userData.wheelSpin;
  for (const s of car.mesh.userData.steers) s.rotation.y = car.steer * 0.45;
  car.mesh.userData.tailMat.emissiveIntensity = car.brakeOn ? 2.2 : 0.5;
  // Body lean and police lightbar strobe.
  car.mesh.rotation.z = clamp(-car.steer * car.speed * 0.0035, -0.06, 0.06);
  if (car.mesh.userData.lightBar) {
    const phase = Math.floor(performance.now() / 140) % 2;
    car.mesh.userData.lightBar.barR.material.emissiveIntensity = phase === 0 ? 2.6 : 0.25;
    car.mesh.userData.lightBar.barB.material.emissiveIntensity = phase === 0 ? 0.25 : 2.6;
  }
  if (car.health < 30) car.damageSmoke += dt;
}

// Player driving input: throttle/brake/steer/handbrake with drift.
export function drivePlayerCar(car, axes, dt, handbrake) {
  const def = car.def;
  const targetSteer = axes.x * (car.speed >= 0 ? 1 : -1);
  car.steer = damp(car.steer, targetSteer, handbrake ? 6 : 9, dt);
  const grip = handbrake ? def.grip * 0.45 : def.grip;
  if (axes.y > 0) {
    car.speed += def.accel * dt * (1 - Math.max(0, car.speed) / def.topSpeed);
    car.brakeOn = false;
  } else if (axes.y < 0) {
    if (car.speed > 1) {
      car.speed -= 26 * dt;
      car.brakeOn = true;
    } else {
      car.speed = Math.max(-9, car.speed - 9 * dt);
      car.brakeOn = false;
    }
  } else {
    car.speed = damp(car.speed, 0, handbrake ? 0.6 : 1.1, dt);
    car.brakeOn = false;
  }
  if (handbrake) {
    car.speed = damp(car.speed, car.speed * 0.92, 2.5, dt);
    car.brakeOn = true;
  }
  car.speed = clamp(car.speed, -9, def.topSpeed);
  const turnRate = car.steer * clamp(Math.abs(car.speed) / 8, 0, 1.6) * (handbrake ? 1.5 : 1);
  car.heading += turnRate * dt * (car.speed >= 0 ? 1 : -1) * grip * 0.42;
  car.slipping = handbrake && Math.abs(car.speed) > 8;
  return car.slipping;
}

export function setNightLights(car, night) {
  car.mesh.userData.headMat.emissiveIntensity = night ? 2.4 : 0.9;
}

// Distance from a point to the car's centre, used for enter-car prompts.
export function carDistance(car, x, z) {
  return Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z);
}
