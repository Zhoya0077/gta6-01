// The Solmarina police: interceptors that hunt in staggered formation and
// officers who close in on foot. Heat rises with crimes, cools when Mara
// breaks line of sight, and a long enough cornering ends in a bust.

import * as THREE from 'three';
import { G, emit } from './state.js';
import { makeOfficer, animateFigure } from './characters.js';
import { createCar, moveCar } from './vehicles.js';
import { clamp, angleDamp } from './util.js';

let sceneRef = null;
let bustedTimer = 0;

export function initPolice(scene) {
  sceneRef = scene;
}

export function setWanted(n) {
  const next = clamp(Math.round(n), 0, 5);
  if (next !== G.wanted) {
    G.wanted = next;
    G.evadeTimer = 0;
    emit('wantedChanged', { wanted: next });
  }
}

export function addWanted(n) {
  setWanted(G.wanted + n);
}

function spawnInterceptor(x, z, heading, speed) {
  const car = createCar('interceptor', x, z, heading, { driver: 'police', police: { aggression: 0.75 + Math.random() * 0.25, offset: (Math.random() - 0.5) * 2.2, lane: Math.random() < 0.5 ? -1 : 1 } });
  car.speed = speed || 0;
  sceneRef.add(car.mesh);
  G.cars.push(car);
  return car;
}

function spawnOfficer(x, z) {
  const fig = makeOfficer();
  fig.group.position.set(x, 0, z);
  sceneRef.add(fig.group);
  const officer = {
    fig,
    heading: 0,
    speed: 0,
    health: 100,
    down: false,
    downTimer: 0,
    punchCooldown: 0,
    searchX: x,
    searchZ: z,
  };
  G.officers.push(officer);
  return officer;
}

export function forceSpawnPolice(nCars, nOfficers, carSpawns, officerSpawns) {
  const p = G.player ? G.player.pos() : { x: 0, z: 0 };
  for (let i = 0; i < nCars; i++) {
    const s = carSpawns && carSpawns[i];
    if (s) spawnInterceptor(s.x, s.z, s.heading ?? 0, s.speed ?? 0);
    else spawnInterceptor(p.x + 30 + i * 12, p.z - 40, 0, 10);
  }
  for (let i = 0; i < nOfficers; i++) {
    const s = officerSpawns && officerSpawns[i];
    if (s) spawnOfficer(s.x, s.z);
    else spawnOfficer(p.x + 12 + i * 6, p.z + 10);
  }
}

function policeCars() {
  return G.cars.filter((c) => c.driver === 'police');
}

function removePoliceUnit(car) {
  sceneRef.remove(car.mesh);
  const idx = G.cars.indexOf(car);
  if (idx >= 0) G.cars.splice(idx, 1);
}

function removeOfficer(officer) {
  sceneRef.remove(officer.fig.group);
  const idx = G.officers.indexOf(officer);
  if (idx >= 0) G.officers.splice(idx, 1);
}

export function clearPolice() {
  for (const car of [...policeCars()]) removePoliceUnit(car);
  for (const officer of [...G.officers]) removeOfficer(officer);
  bustedTimer = 0;
}

function desiredUnits(wanted) {
  if (wanted <= 0) return { cars: 0, officers: 0 };
  if (wanted === 1) return { cars: 1, officers: 0 };
  if (wanted === 2) return { cars: 2, officers: 1 };
  if (wanted === 3) return { cars: 2, officers: 2 };
  if (wanted === 4) return { cars: 3, officers: 2 };
  return { cars: 4, officers: 3 };
}

export function updatePolice(dt) {
  G.crimeCooldown = Math.max(0, G.crimeCooldown - dt);
  const player = G.player;
  if (!player) return;
  const p = player.pos();
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : player.walkSpeed;

  // Keep the force matched to the wanted level, spawning just out of view.
  const want = desiredUnits(G.wanted);
  const cars = policeCars();
  if (cars.length < want.cars && G.wanted > 0) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 40;
    const x = clamp(p.x + Math.sin(angle) * dist, -260, 260);
    const z = clamp(p.z + Math.cos(angle) * dist, -260, 260);
    const res = G.city.collideCircle(x, z, 2);
    spawnInterceptor(res.x, res.z, Math.atan2(p.x - res.x, p.z - res.z), 8);
  } else if (cars.length > want.cars) {
    // Retire the farthest unit first so the chase thins naturally.
    let farthest = null;
    let farD = -1;
    for (const car of cars) {
      const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
      if (d > farD) { farD = d; farthest = car; }
    }
    if (farthest && farD > 45) removePoliceUnit(farthest);
  }
  if (G.officers.length < want.officers && G.wanted > 0) {
    const angle = Math.random() * Math.PI * 2;
    spawnOfficer(p.x + Math.sin(angle) * 34, p.z + Math.cos(angle) * 34);
  } else if (G.officers.length > want.officers) {
    const far = [...G.officers].sort((a, b) => {
      const da = Math.hypot(a.fig.group.position.x - p.x, a.fig.group.position.z - p.z);
      const db = Math.hypot(b.fig.group.position.x - p.x, b.fig.group.position.z - p.z);
      return db - da;
    })[0];
    if (far) removeOfficer(far);
  }

  // Evade: out of sight and quiet, heat cools one star at a time.
  let nearestPolice = Infinity;
  for (const car of policeCars()) {
    nearestPolice = Math.min(nearestPolice, Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z));
  }
  for (const o of G.officers) {
    nearestPolice = Math.min(nearestPolice, Math.hypot(o.fig.group.position.x - p.x, o.fig.group.position.z - p.z));
  }
  if (G.wanted > 0) {
    if (nearestPolice > 55 && G.time - G.lastCrimeTime > 5) {
      G.evadeTimer += dt;
      const need = 7 + G.wanted * 2.5;
      if (G.evadeTimer > need) {
        setWanted(G.wanted - 1);
        emit('evaded', { wanted: G.wanted });
      }
    } else {
      G.evadeTimer = 0;
    }
  }

  // Interceptors: predict, offset, and cut off — never a conga line.
  for (const car of policeCars()) {
    const pol = car.police || { aggression: 0.85, offset: 0, lane: 1 };
    const cp = car.mesh.position;
    const lead = 0.55 * pol.aggression;
    const tx = p.x + (player.inCar ? Math.sin(player.inCar.heading) * player.inCar.speed * lead : 0) + Math.cos(car.heading) * pol.offset * 3;
    const tz = p.z + (player.inCar ? Math.cos(player.inCar.heading) * player.inCar.speed * lead : 0) - Math.sin(car.heading) * pol.offset * 3;
    const wantHeading = Math.atan2(tx - cp.x, tz - cp.z);
    car.heading = angleDamp(car.heading, wantHeading, 2.6, dt);
    const dist = Math.hypot(tx - cp.x, tz - cp.z);
    const targetSpeed = dist > 8 ? car.def.topSpeed * pol.aggression : 6;
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 14 * dt);
    car.steer = clamp((wantHeading - car.heading) * 2, -1, 1);
    const prevHealth = car.health;
    moveCar(car, dt, G.city, G.cars);
    if (car.health < prevHealth - 0.5 && G.audio) G.audio.crash(4);
    // A hard ram shakes Mara's camera when it lands on her car.
    if (player.inCar && Math.hypot(cp.x - p.x, cp.z - p.z) < 4 && Math.abs(car.speed) > 10) {
      G.cameraShake = Math.min(0.5, G.cameraShake + dt * 2);
    }
  }

  // Officers on foot: run the player down, swing, and corner for a bust.
  let cornered = false;
  for (const o of [...G.officers]) {
    if (o.down) {
      o.downTimer -= dt;
      if (o.downTimer <= 0) removeOfficer(o);
      continue;
    }
    o.punchCooldown = Math.max(0, o.punchCooldown - dt);
    const op = o.fig.group.position;
    const d = Math.hypot(op.x - p.x, op.z - p.z);
    if (d > 2.4) {
      const want = Math.atan2(p.x - op.x, p.z - op.z);
      o.heading = angleDamp(o.heading, want, 8, dt);
      o.speed = 5.6;
      let nx = op.x + Math.sin(o.heading) * o.speed * dt;
      let nz = op.z + Math.cos(o.heading) * o.speed * dt;
      const res = G.city.collideCircle(nx, nz, 0.5);
      op.x = res.x;
      op.z = res.z;
      animateFigure(o.fig, o.speed, dt, {});
    } else {
      o.speed = 0;
      animateFigure(o.fig, 0, dt, { punch: o.punchCooldown > 0.7 ? 0.2 : 0 });
      if (!player.inCar && o.punchCooldown <= 0) {
        o.punchCooldown = 1.1;
        player.hurt(7, op.x, op.z);
      }
      if (playerSpeed < 3) cornered = true;
    }
    o.fig.group.rotation.y = o.heading;
  }
  if (cornered && G.wanted > 0) {
    bustedTimer += dt;
    if (bustedTimer > 1.6) {
      bustedTimer = 0;
      emit('busted', { reason: 'cornered' });
    }
  } else {
    bustedTimer = Math.max(0, bustedTimer - dt * 2);
  }
  void THREE;
}

// Search state for the HUD: cooling down reads as "evading" on screen.
export function isEvading() {
  return G.wanted > 0 && G.evadeTimer > 1.5;
}
