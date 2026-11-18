// The Solmarina police: the 0–5 star wanted level, interceptor cars that
// chase and ram, officers on foot who chase and arrest, the evade timer
// that lets a careful driver lose the heat, and the bust itself.

import { G, on, emit } from './state.js';
import { clamp, angleDiff, dist2 } from './util.js';
import { resolveColliders } from './util.js';
import { clampToWorld, randomRoadPoint } from './city.js';
import { makeHumanoid, animateHumanoid } from './characters.js';
import { createCar, driveCar, removeCar } from './vehicles.js';

const CARS_BY_WANTED = [0, 1, 2, 2, 3, 4];
const OFFICERS_BY_WANTED = [0, 0, 1, 2, 3, 4];
const EVADE_DISTANCE = 55;
const EVADE_SECONDS = 6;

let spawnCooldown = 0;

export function addWanted(amount) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + amount, 0, 5);
  G.evadeTimer = 0;
  if (G.wanted !== before) emit('wantedChanged', { wanted: G.wanted });
}

export function setWanted(level) {
  G.wanted = clamp(level, 0, 5);
  G.evadeTimer = 0;
  emit('wantedChanged', { wanted: G.wanted });
}

export function initPolice() {
  on('crime', (data) => {
    if (G.crimeCooldown > 0) return;
    G.crimeCooldown = 4;
    G.stats.crimes++;
    addWanted(data.amount || 1);
  });
  on('playerDown', () => {
    emit('busted', { reason: 'down' });
  });
}

function spawnPointNearPlayer(minDist, maxDist) {
  const playerPos = G.player.position();
  const pt = { x: 0, z: 0 };
  for (let tries = 0; tries < 12; tries++) {
    randomRoadPoint(G.rng, pt);
    const d = dist2(pt.x, pt.z, playerPos.x, playerPos.z);
    if (d >= minDist && d <= maxDist) return { x: pt.x, z: pt.z };
  }
  // Fallback: directly away from the player along a road line.
  const angle = G.rng() * Math.PI * 2;
  return {
    x: clamp(playerPos.x + Math.sin(angle) * 80, -240, 240),
    z: clamp(playerPos.z + Math.cos(angle) * 80, -240, 240),
  };
}

function spawnPoliceCar(spot, heading) {
  const place = spot || spawnPointNearPlayer(60, 110);
  const playerPos = G.player.position();
  const face = heading !== undefined ? heading : Math.atan2(playerPos.x - place.x, playerPos.z - place.z);
  const car = createCar(G.scene, 'interceptor', place.x, place.z, face, { driver: 'police', color: 0x1d3557 });
  car.mesh.userData.paint = 0x1d3557;
  car.police = { role: 'chase' };
  // Staged spots may carry an entry speed so a pursuit is already rolling.
  if (spot && typeof spot.speed === 'number') car.speed = spot.speed;
  return car;
}

function spawnOfficer(spot) {
  const playerPos = G.player.position();
  let x;
  let z;
  if (spot) {
    x = spot.x;
    z = spot.z;
  } else {
    const angle = G.rng() * Math.PI * 2;
    const d = 24 + G.rng() * 16;
    x = clamp(playerPos.x + Math.sin(angle) * d, -260, 250);
    z = clamp(playerPos.z + Math.cos(angle) * d, -260, 260);
  }
  const fig = makeHumanoid({
    shirt: 0x1d3557, pants: 0x1a1a2e, hair: 0x2b1d16, hat: 'police', rng: G.rng,
  });
  fig.group.position.set(x, 0, z);
  G.scene.add(fig.group);
  const officer = {
    fig,
    health: 40,
    dead: false,
    deadTimer: 0,
    heading: Math.atan2(playerPos.x - x, playerPos.z - z),
    walkPhase: 0,
    punchCooldown: 0,
    punchTimer: 0,
    contactTimer: 0,
  };
  fig.group.userData.entity = { kind: 'officer', ref: officer };
  G.officers.push(officer);
  return officer;
}

// Spawn police immediately, at explicit spots when given. Used by the
// screenshot presets to stage a chase; the live game uses updatePolice.
export function forceSpawnPolice(carCount, officerCount, carSpots, officerSpots) {
  for (let i = 0; i < carCount; i++) {
    const spot = carSpots && carSpots[i];
    spawnPoliceCar(spot, spot ? spot.heading : undefined);
  }
  for (let i = 0; i < officerCount; i++) {
    spawnOfficer(officerSpots && officerSpots[i]);
  }
}

export function damageOfficer(officer, amount) {  if (officer.dead) return;
  officer.health -= amount;
  if (officer.health <= 0) {
    officer.dead = true;
    officer.deadTimer = 0;
    officer.fig.group.rotation.x = Math.PI / 2;
    officer.fig.group.position.y = 0.3;
    addWanted(1);
  }
}

function removeOfficer(officer) {
  G.scene.remove(officer.fig.group);
  const idx = G.officers.indexOf(officer);
  if (idx !== -1) G.officers.splice(idx, 1);
}

export function clearPolice() {
  for (const car of [...G.cars]) {
    if (car.driver === 'police') removeCar(G.scene, car);
  }
  for (const officer of [...G.officers]) removeOfficer(officer);
  if (G.audio) G.audio.setSiren(false);
}

export function updatePolice(dt) {
  G.crimeCooldown = Math.max(0, G.crimeCooldown - dt);
  spawnCooldown = Math.max(0, spawnCooldown - dt);
  const player = G.player;
  if (!player) return;
  const playerPos = player.position();

  // --- Force sizing ---------------------------------------------------------
  if (G.wanted > 0 && G.mode === 'playing') {
    const activeCars = G.cars.filter((c) => c.driver === 'police' && c.health > 0).length;
    const wantCars = CARS_BY_WANTED[G.wanted];
    if (activeCars < wantCars && spawnCooldown <= 0) {
      spawnPoliceCar();
      spawnCooldown = 2.5;
    }
    const wantOfficers = player.inCar ? 0 : OFFICERS_BY_WANTED[G.wanted];
    const activeOfficers = G.officers.filter((o) => !o.dead).length;
    if (activeOfficers < wantOfficers && spawnCooldown <= 0) {
      spawnOfficer();
      spawnCooldown = 2;
    }
    // Officers give up the foot chase once the player is driving away.
    if (player.inCar) {
      for (const officer of [...G.officers]) {
        if (dist2(officer.fig.group.position.x, officer.fig.group.position.z, playerPos.x, playerPos.z) > 70) {
          removeOfficer(officer);
        }
      }
    }
  }

  // --- Police car AI ----------------------------------------------------------
  for (const car of [...G.cars]) {
    if (car.driver !== 'police') continue;
    if (car.health <= 0) {
      car.driver = 'parked';
      car.police = null;
      continue;
    }
    // Lead the player slightly, steer hard, and ram.
    const lead = player.inCar && player.car ? 0.5 : 0;
    const targetX = playerPos.x + (player.inCar ? Math.sin(player.car.heading) * player.car.speed * lead : 0);
    const targetZ = playerPos.z + (player.inCar ? Math.cos(player.car.heading) * player.car.speed * lead : 0);
    const targetHeading = Math.atan2(targetX - car.mesh.position.x, targetZ - car.mesh.position.z);
    const steer = clamp(angleDiff(car.heading, targetHeading) * 2.4, -1, 1);
    const gap = dist2(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z);
    const throttle = gap < 4 ? 0.55 : 1;
    driveCar(car, { throttle, steer, handbrake: false }, dt);

    // Stuck against a building: reappear on a road near the player.
    if (car.stuckTimer > 1.6) {
      const spot = spawnPointNearPlayer(50, 90);
      car.mesh.position.set(spot.x, 0, spot.z);
      car.heading = Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z);
      car.speed = 0;
      car.stuckTimer = 0;
    }
    // A police car ploughing into Mara on foot hurts.
    if (!player.inCar && gap < 2.6 && Math.abs(car.speed) > 4) {
      player.damage(8, 'rammed');
    }
  }

  // --- Officer AI --------------------------------------------------------------
  for (const officer of [...G.officers]) {
    const pos = officer.fig.group.position;
    if (officer.dead) {
      officer.deadTimer += dt;
      if (officer.deadTimer > 14) removeOfficer(officer);
      continue;
    }
    officer.punchCooldown = Math.max(0, officer.punchCooldown - dt);
    officer.punchTimer = Math.max(0, officer.punchTimer - dt);
    const d = dist2(pos.x, pos.z, playerPos.x, playerPos.z);
    let moving = false;
    if (d > 2.1) {
      officer.heading = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
      const speed = 7.4;
      pos.x += Math.sin(officer.heading) * speed * dt;
      pos.z += Math.cos(officer.heading) * speed * dt;
      officer.walkPhase += speed * dt * 1.8;
      moving = true;
      officer.contactTimer = Math.max(0, officer.contactTimer - dt * 2);
    } else {
      // In grabbing range: swing, and the arrest clock runs.
      if (officer.punchCooldown <= 0 && !player.inCar) {
        officer.punchCooldown = 0.9;
        officer.punchTimer = 0.35;
        player.damage(5, 'officer');
        if (G.audio) G.audio.punch();
      }
      if (!player.inCar && G.wanted > 0) {
        officer.contactTimer += dt;
        if (officer.contactTimer > 3) {
          emit('busted', { reason: 'caught' });
          officer.contactTimer = 0;
        }
      }
    }
    // Officers too far behind respawn closer; they never truly give up.
    if (d > 200 && G.wanted > 0) {
      const spot = spawnPointNearPlayer(30, 60);
      pos.set(spot.x, 0, spot.z);
    }
    resolveColliders(pos, 0.5, G.city.colliders);
    clampToWorld(pos, 0.5);
    pos.y = 0;
    officer.fig.group.rotation.y = officer.heading;
    animateHumanoid(officer.fig, officer.walkPhase, moving ? 1 : 0, officer.punchTimer > 0 ? 1 - officer.punchTimer / 0.35 : 0);
  }

  // --- Evade: break line of sight and the heat cools off ------------------------
  if (G.wanted > 0 && G.mode === 'playing') {
    let nearest = Infinity;
    for (const car of G.cars) {
      if (car.driver !== 'police') continue;
      nearest = Math.min(nearest, dist2(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z));
    }
    for (const officer of G.officers) {
      if (officer.dead) continue;
      nearest = Math.min(nearest, dist2(officer.fig.group.position.x, officer.fig.group.position.z, playerPos.x, playerPos.z));
    }
    if (nearest > EVADE_DISTANCE) {
      G.evadeTimer += dt;
      if (G.evadeTimer >= EVADE_SECONDS) {
        G.evadeTimer = 0;
        G.wanted = Math.max(0, G.wanted - 1);
        emit('wantedChanged', { wanted: G.wanted });
        if (G.wanted === 0) {
          emit('toast', { text: 'YOU LOST THE COPS' });
          clearPolice();
        } else {
          emit('toast', { text: 'Heat cooling off…' });
        }
      }
    } else {
      G.evadeTimer = 0;
    }
  }

  if (G.audio) G.audio.setSiren(G.wanted > 0 && G.mode === 'playing');
}
