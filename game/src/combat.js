// Combat for Solmarina: Mara's fists and pistol, the guards who defend
// Dario's shakedown targets, and the health/ammo pickups scattered around
// the city. Shooting is a camera-centre raycast with a muzzle flash and a
// tracer line; punches are a short arc in front of the player.

import * as THREE from 'three';
import { G, emit } from './state.js';
import { clamp, dist2, angleDiff, resolveColliders } from './util.js';
import { makeHumanoid, animateHumanoid } from './characters.js';
import { damagePed } from './pedestrians.js';
import { damageOfficer } from './police.js';
import { damageCar } from './vehicles.js';

const PUNCH_RANGE = 2.5;
const PUNCH_DAMAGE = 12;
const SHOT_DAMAGE = 25;
const SHOT_RANGE = 70;

let raycaster = null;
let muzzleFlash = null;
let muzzleTimer = 0;
const tracers = [];

function ensureFx(scene) {
  if (!raycaster) raycaster = new THREE.Raycaster();
  if (!muzzleFlash) {
    muzzleFlash = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdf6a, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    );
    muzzleFlash.visible = false;
    scene.add(muzzleFlash);
  }
}

function findEntity(object) {
  let node = object;
  while (node) {
    if (node.userData && node.userData.entity) return node.userData.entity;
    node = node.parent;
  }
  return null;
}

function muzzlePosition() {
  const player = G.player;
  const pos = player.position();
  const heading = player.heading;
  return new THREE.Vector3(
    pos.x + Math.sin(heading) * 0.6,
    pos.y + 1.4,
    pos.z + Math.cos(heading) * 0.6,
  );
}

export function doPunch() {
  const player = G.player;
  if (!player || player.inCar || player.punchTimer > 0.1) return;
  player.punchTimer = 0.35;
  if (G.audio) G.audio.punch();
  const pos = player.position();
  let hitSomething = false;

  function tryHit(entityPos, radius, apply) {
    const d = dist2(pos.x, pos.z, entityPos.x, entityPos.z);
    if (d > PUNCH_RANGE + radius) return false;
    const ang = Math.atan2(entityPos.x - pos.x, entityPos.z - pos.z);
    if (Math.abs(angleDiff(player.heading, ang)) > 1.2) return false;
    apply();
    return true;
  }

  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (tryHit(ped.fig.group.position, 0.5, () => {
      damagePed(ped, PUNCH_DAMAGE, pos.x, pos.z);
      emit('crime', { kind: 'assault', amount: 1, x: pos.x, z: pos.z });
    })) hitSomething = true;
  }
  for (const officer of G.officers) {
    if (officer.dead) continue;
    if (tryHit(officer.fig.group.position, 0.5, () => {
      damageOfficer(officer, PUNCH_DAMAGE);
      emit('crime', { kind: 'assault', amount: 1, x: pos.x, z: pos.z });
    })) hitSomething = true;
  }
  for (const guard of G.guards) {
    if (guard.dead) continue;
    if (tryHit(guard.fig.group.position, 0.5, () => damageGuard(guard, PUNCH_DAMAGE))) hitSomething = true;
  }
  if (hitSomething) emit('punchHit', {});
}

export function shoot() {
  const player = G.player;
  if (!player || player.inCar) return;
  if (G.ammo <= 0) {
    emit('toast', { text: 'OUT OF AMMO — find an ammo box' });
    return;
  }
  G.ammo--;
  ensureFx(G.scene);
  if (G.audio) G.audio.gunshot();

  // Raycast from the camera through the centre of the screen.
  raycaster.setFromCamera(new THREE.Vector2(0, 0), G.camera);
  raycaster.far = SHOT_RANGE;
  const targets = [];
  for (const ped of G.peds) if (!ped.dead) targets.push(ped.fig.group);
  for (const officer of G.officers) if (!officer.dead) targets.push(officer.fig.group);
  for (const guard of G.guards) if (!guard.dead) targets.push(guard.fig.group);
  for (const car of G.cars) targets.push(car.mesh);
  if (G.city.targetMeshes) targets.push(...G.city.targetMeshes);
  const hits = raycaster.intersectObjects(targets, true);

  const muzzle = muzzlePosition();
  let end = null;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    const entity = findEntity(hit.object);
    if (entity) {
      if (entity.kind === 'ped') {
        damagePed(entity.ref, SHOT_DAMAGE, player.position().x, player.position().z);
        emit('crime', { kind: 'shooting', amount: 1, x: player.position().x, z: player.position().z });
      } else if (entity.kind === 'officer') {
        damageOfficer(entity.ref, SHOT_DAMAGE);
        emit('crime', { kind: 'shooting', amount: 1, x: player.position().x, z: player.position().z });
      } else if (entity.kind === 'guard') {
        damageGuard(entity.ref, SHOT_DAMAGE);
      } else if (entity.kind === 'car') {
        damageCar(entity.ref, 12);
        emit('crime', { kind: 'shooting', amount: 1, x: player.position().x, z: player.position().z });
      }
      emit('hitMarker', {});
    }
  } else {
    end = raycaster.ray.at(SHOT_RANGE, new THREE.Vector3());
  }

  // Muzzle flash + tracer line.
  muzzleFlash.position.copy(muzzle);
  muzzleFlash.lookAt(G.camera.position);
  muzzleFlash.visible = true;
  muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
  muzzleTimer = 0.05;
  const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  tracers.push({ line, life: 0.08 });
}

// --- Guards -----------------------------------------------------------------

export function spawnGuard(scene, x, z, opts) {
  const fig = makeHumanoid({
    shirt: 0x8a2f2f, pants: 0x222222, hair: 0x111111, rng: G.rng,
  });
  fig.group.position.set(x, 0, z);
  fig.group.userData.entity = { kind: 'guard', ref: null };
  scene.add(fig.group);
  const guard = {
    fig,
    health: 40,
    dead: false,
    deadTimer: 0,
    heading: Math.random() * Math.PI * 2,
    walkPhase: 0,
    punchTimer: 0,
    punchCooldown: 0,
    homeX: x,
    homeZ: z,
    leash: (opts && opts.leash) || 45,
  };
  fig.group.userData.entity.ref = guard;
  G.guards.push(guard);
  return guard;
}

export function damageGuard(guard, amount) {
  if (guard.dead) return;
  guard.health -= amount;
  if (guard.health <= 0) {
    guard.dead = true;
    guard.deadTimer = 0;
    guard.fig.group.rotation.x = Math.PI / 2;
    guard.fig.group.position.y = 0.3;
    G.cash += 20;
    emit('toast', { text: '+$20 taken from the guard' });
    emit('guardDown', { guard });
  }
}

export function updateGuards(dt) {
  const player = G.player;
  if (!player) return;
  const playerPos = player.position();
  for (const guard of G.guards) {
    const pos = guard.fig.group.position;
    if (guard.dead) {
      guard.deadTimer += dt;
      continue;
    }
    guard.punchCooldown = Math.max(0, guard.punchCooldown - dt);
    guard.punchTimer = Math.max(0, guard.punchTimer - dt);
    const d = dist2(pos.x, pos.z, playerPos.x, playerPos.z);
    const homeD = dist2(pos.x, pos.z, guard.homeX, guard.homeZ);
    let moving = false;
    if (d < 32 && homeD < guard.leash && !player.inCar) {
      // Chase the player and swing when close.
      const targetHeading = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
      guard.heading = targetHeading;
      if (d > 2.1) {
        pos.x += Math.sin(guard.heading) * 4.6 * dt;
        pos.z += Math.cos(guard.heading) * 4.6 * dt;
        guard.walkPhase += 4.6 * dt * 1.8;
        moving = true;
      } else if (guard.punchCooldown <= 0) {
        guard.punchCooldown = 0.9;
        guard.punchTimer = 0.35;
        player.damage(6, 'guard');
        if (G.audio) G.audio.punch();
      }
    } else if (homeD > 2) {
      // Drift back to the post.
      const targetHeading = Math.atan2(guard.homeX - pos.x, guard.homeZ - pos.z);
      guard.heading = targetHeading;
      pos.x += Math.sin(guard.heading) * 2.4 * dt;
      pos.z += Math.cos(guard.heading) * 2.4 * dt;
      guard.walkPhase += 2.4 * dt * 1.7;
      moving = true;
    }
    resolveColliders(pos, 0.5, G.city.colliders);
    pos.y = 0;
    guard.fig.group.rotation.y = guard.heading;
    animateHumanoid(guard.fig, guard.walkPhase, moving ? 0.8 : 0, guard.punchTimer > 0 ? 1 - guard.punchTimer / 0.35 : 0);
  }
}

// --- Pickups ------------------------------------------------------------------

function makeHealthMesh() {
  const group = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.25),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  );
  const crossMat = new THREE.MeshLambertMaterial({ color: 0x2fae4f });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.66, 0.3), crossMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.28, 0.3), crossMat);
  group.add(white, crossV, crossH);
  return group;
}

function makeAmmoMesh() {
  const group = new THREE.Group();
  const boxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.55, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x6b7a3a }),
  );
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.14, 0.59),
    new THREE.MeshLambertMaterial({ color: 0x4a5626 }),
  );
  lid.position.y = 0.32;
  group.add(boxMesh, lid);
  return group;
}

export function spawnPickups(scene) {
  const spots = [
    { kind: 'health', x: -60, z: 30 },
    { kind: 'health', x: 280, z: 30 },
    { kind: 'health', x: -120, z: 114 },
    { kind: 'ammo', x: 60, z: -30 },
    { kind: 'ammo', x: -180, z: -180 },
    { kind: 'ammo', x: 236, z: -108 },
  ];
  for (const spot of spots) {
    const mesh = spot.kind === 'health' ? makeHealthMesh() : makeAmmoMesh();
    mesh.position.set(spot.x, 1.1, spot.z);
    scene.add(mesh);
    G.pickups.push({
      kind: spot.kind, mesh, x: spot.x, z: spot.z,
      active: true, respawnTimer: 0, phase: Math.random() * 10,
    });
  }
}

export function updatePickups(dt) {
  const player = G.player;
  if (!player) return;
  const pos = player.position();
  for (const pickup of G.pickups) {
    if (!pickup.active) {
      pickup.respawnTimer -= dt;
      if (pickup.respawnTimer <= 0) {
        pickup.active = true;
        pickup.mesh.visible = true;
      }
      continue;
    }
    pickup.mesh.rotation.y += dt * 1.6;
    pickup.mesh.position.y = 1.1 + Math.sin(G.time * 2 + pickup.phase) * 0.12;
    if (dist2(pos.x, pos.z, pickup.x, pickup.z) < 2.2) {
      if (pickup.kind === 'health' && G.health >= G.maxHealth) continue;
      if (pickup.kind === 'ammo' && G.ammo >= G.maxAmmo) continue;
      if (pickup.kind === 'health') {
        player.heal(40);
        emit('toast', { text: 'HEALTH +40' });
      } else {
        G.ammo = Math.min(G.maxAmmo, G.ammo + 12);
        emit('toast', { text: 'AMMO +12' });
      }
      if (G.audio) G.audio.pickup();
      pickup.active = false;
      pickup.mesh.visible = false;
      pickup.respawnTimer = 25;
    }
  }
}

// --- Per-frame combat update ---------------------------------------------------

export function updateCombat(dt) {
  ensureFx(G.scene);
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) muzzleFlash.visible = false;
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tracer = tracers[i];
    tracer.life -= dt;
    tracer.line.material.opacity = clamp(tracer.life / 0.08, 0, 1) * 0.9;
    if (tracer.life <= 0) {
      G.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
      tracers.splice(i, 1);
    }
  }

  const input = G.input;
  if (!input || G.mode !== 'playing') return;
  if (input.wasPressed('punch')) doPunch();
  // Click shoots only when the pointer is over the game canvas, not a menu.
  if (input.clicked && !G.player.inCar) shoot();
}
