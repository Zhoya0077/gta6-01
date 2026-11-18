// Combat, pickups, guards and shops: fists, the pistol, health and ammo
// scattered through the city, warehouse guards who protect the Aurora,
// and three storefronts where cash turns into survival.

import * as THREE from 'three';
import { G, emit, on } from './state.js';
import { makeFigure, makeGuard, animateFigure } from './characters.js';
import { nearestPed, knockDownPed } from './pedestrians.js';
import { addWanted } from './police.js';

let sceneRef = null;
let tracer = null;
let tracerTimer = 0;
let flash = null;
let flashTimer = 0;
let shotCooldown = 0;
let guardId = 0;

function reportCrime(x, z, level) {
  G.lastCrimePos = { x, z };
  G.lastCrimeTime = G.time;
  if (G.crimeCooldown <= 0) {
    G.stats.crimes++;
    addWanted(level);
    G.crimeCooldown = 4;
  }
}

function makePickupMesh(kind) {
  const group = new THREE.Group();
  if (kind === 'health') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x27ae60, emissiveIntensity: 0.7, roughness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), mat);
    group.add(box);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.34), crossMat);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.34), crossMat);
    group.add(h, v);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0a526, emissive: 0xb8860b, emissiveIntensity: 0.5, roughness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.55), mat);
    group.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.59), new THREE.MeshStandardMaterial({ color: 0x8a6b3a, roughness: 0.7 }));
    lid.position.y = 0.32;
    group.add(lid);
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 20),
    new THREE.MeshBasicMaterial({ color: kind === 'health' ? 0x2ecc71 : 0xe0a526, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.9;
  group.add(glow);
  return group;
}

export function spawnPickup(scene, kind, x, z) {
  const mesh = makePickupMesh(kind);
  mesh.position.set(x, 1.1, z);
  scene.add(mesh);
  const pickup = { kind, mesh, x, z, taken: false, respawn: 0, phase: Math.random() * 6.28 };
  G.pickups.push(pickup);
  return pickup;
}

export function initCombat(scene, city) {
  sceneRef = scene;
  // Tracer line + muzzle flash, reused for every shot.
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
  );
  scene.add(flash);

  // Pickups on sidewalks and the pier.
  const spots = [
    ['health', -24, 36], ['ammo', 36, -24], ['health', 96, 96], ['ammo', -96, -96],
    ['health', 156, -36], ['ammo', -156, 36], ['health', 36, 156], ['ammo', 216, 30],
    ['health', -216, -156], ['ammo', 96, -156], ['health', 270, 30], ['ammo', -36, 216],
  ];
  for (const [kind, x, z] of spots) spawnPickup(scene, kind, x, z);

  // Warehouse guards around the Aurora lot (north-east blocks).
  const posts = [
    { x: 182, z: -178 }, { x: 196, z: -172 }, { x: 188, z: -192 }, { x: 172, z: -186 },
  ];
  for (const post of posts) {
    const fig = makeGuard();
    fig.group.position.set(post.x, 0, post.z);
    scene.add(fig.group);
    G.guards.push({
      id: guardId++,
      fig,
      post: { ...post },
      heading: Math.random() * Math.PI * 2,
      health: 100,
      down: false,
      downTimer: 0,
      alerted: false,
      punchCooldown: 0,
      speed: 0,
    });
  }

  on('punch', ({ x, z, heading }) => {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    // Guards and officers first, then pedestrians.
    const targets = [];
    for (const g of G.guards) {
      if (!g.down) targets.push({ kind: 'guard', ref: g, x: g.fig.group.position.x, z: g.fig.group.position.z });
    }
    for (const o of G.officers) {
      if (!o.down) targets.push({ kind: 'officer', ref: o, x: o.fig.group.position.x, z: o.fig.group.position.z });
    }
    for (const ped of G.peds) {
      if (!ped.down) targets.push({ kind: 'ped', ref: ped, x: ped.fig.group.position.x, z: ped.fig.group.position.z });
    }
    for (const t of targets) {
      const dx = t.x - x;
      const dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4 || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < 0.4) continue;
      if (t.kind === 'ped') {
        t.ref.health -= 14;
        if (t.ref.health <= 0) knockDownPed(t.ref);
        reportCrime(x, z, 1);
      } else if (t.kind === 'guard') {
        t.ref.health -= 14;
        t.ref.alerted = true;
        if (t.ref.health <= 0) {
          t.ref.down = true;
          t.ref.downTimer = 30;
          t.ref.fig.group.rotation.x = Math.PI / 2;
          spawnPickup(sceneRef, 'ammo', t.x, t.z);
        }
        reportCrime(x, z, 1);
      } else {
        t.ref.health -= 14;
        if (t.ref.health <= 0) {
          t.ref.down = true;
          t.ref.downTimer = 20;
          t.ref.fig.group.rotation.x = Math.PI / 2;
        }
        reportCrime(x, z, 2);
      }
      emit('hitLanded', { kind: t.kind });
      break;
    }
  });
}

function shoot() {
  if (G.ammo <= 0) {
    emit('dryFire', {});
    return;
  }
  G.ammo--;
  shotCooldown = 0.28;
  const player = G.player;
  const p = player.pos();
  const fx = -Math.sin(G.cameraYaw);
  const fz = -Math.cos(G.cameraYaw);
  const start = new THREE.Vector3(p.x + fx * 0.8, 1.45, p.z + fz * 0.8);
  let endDist = 42;
  let hitKind = null;
  // Nearest target inside a narrow cone.
  const candidates = [];
  for (const ped of G.peds) {
    if (!ped.down) candidates.push({ kind: 'ped', ref: ped, x: ped.fig.group.position.x, z: ped.fig.group.position.z });
  }
  for (const g of G.guards) {
    if (!g.down) candidates.push({ kind: 'guard', ref: g, x: g.fig.group.position.x, z: g.fig.group.position.z });
  }
  for (const o of G.officers) {
    if (!o.down) candidates.push({ kind: 'officer', ref: o, x: o.fig.group.position.x, z: o.fig.group.position.z });
  }
  let bestD = 42;
  let best = null;
  for (const c of candidates) {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) continue;
    if ((dx * fx + dz * fz) / d < 0.92) continue;
    bestD = d;
    best = c;
  }
  if (best) {
    endDist = bestD;
    hitKind = best.kind;
    if (best.kind === 'ped') {
      best.ref.health -= 34;
      if (best.ref.health <= 0) knockDownPed(best.ref);
    } else if (best.kind === 'guard') {
      best.ref.health -= 34;
      best.ref.alerted = true;
      if (best.ref.health <= 0) {
        best.ref.down = true;
        best.ref.downTimer = 30;
        best.ref.fig.group.rotation.x = Math.PI / 2;
        spawnPickup(sceneRef, 'ammo', best.x, best.z);
      }
    } else {
      best.ref.health -= 34;
      if (best.ref.health <= 0) {
        best.ref.down = true;
        best.ref.downTimer = 20;
        best.ref.fig.group.rotation.x = Math.PI / 2;
      }
    }
  }
  const end = new THREE.Vector3(p.x + fx * endDist, 1.35, p.z + fz * endDist);
  tracer.geometry.setFromPoints([start, end]);
  tracer.material.opacity = 0.9;
  tracerTimer = 0.07;
  flash.position.copy(start);
  flash.material.opacity = 0.95;
  flashTimer = 0.06;
  if (G.audio) G.audio.shot();
  reportCrime(p.x, p.z, 1);
  emit('shotFired', { hit: hitKind });
}

export function nearestShop(maxDist) {
  const p = G.player ? G.player.pos() : { x: 0, z: 0 };
  let best = null;
  let bestD = maxDist;
  for (const shop of G.city.shops) {
    const d = Math.hypot(shop.x - p.x, shop.z - 6 - p.z);
    if (d < bestD) { bestD = d; best = shop; }
  }
  return best;
}

export function tryShop() {
  const shop = nearestShop(7);
  if (!shop) return null;
  if (shop.kind === 'guns') {
    if (G.ammo >= G.maxAmmo) return { shop, msg: 'Ammo already full.' };
    if (G.cash < 40) return { shop, msg: 'Not enough cash — ammo is $40.' };
    G.cash -= 40;
    G.ammo = Math.min(G.maxAmmo, G.ammo + 24);
    if (G.audio) G.audio.cash();
    return { shop, msg: 'Bought 24 rounds for $40.' };
  }
  if (shop.kind === 'market') {
    if (G.health >= G.maxHealth) return { shop, msg: 'Health already full.' };
    if (G.cash < 30) return { shop, msg: 'Not enough cash — supplies are $30.' };
    G.cash -= 30;
    G.health = G.maxHealth;
    if (G.audio) G.audio.cash();
    return { shop, msg: 'Patched up for $30. Feeling new.' };
  }
  // Clinic: free slow heal, the respawn point after a bust.
  if (G.health >= G.maxHealth) return { shop, msg: 'The clinic has nothing to patch.' };
  G.health = G.maxHealth;
  return { shop, msg: 'The clinic patched you up, no charge.' };
}

export function updateCombat(dt, input) {
  shotCooldown = Math.max(0, shotCooldown - dt);
  tracerTimer = Math.max(0, tracerTimer - dt);
  flashTimer = Math.max(0, flashTimer - dt);
  if (tracer) tracer.material.opacity = tracerTimer > 0 ? 0.9 : 0;
  if (flash) flash.material.opacity = flashTimer > 0 ? 0.95 : 0;

  // Click to shoot, on foot only, with a cooldown so a camera drag
  // never turns into a burst.
  if (input.consumeClick() && !G.player.inCar && shotCooldown <= 0 && G.mode === 'playing') {
    shoot();
  }
  if (input.consume('KeyF')) G.player.punch();

  // Pickups: bob, spin, magnet, collect, respawn.
  const p = G.player.pos();
  for (const pickup of G.pickups) {
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) {
        pickup.taken = false;
        pickup.mesh.visible = true;
      }
      continue;
    }
    pickup.phase += dt * 2;
    pickup.mesh.rotation.y += dt * 1.6;
    pickup.mesh.position.y = 1.1 + Math.sin(pickup.phase) * 0.14;
    const d = Math.hypot(pickup.x - p.x, pickup.z - p.z);
    if (d < 2.0 && !G.player.inCar) {
      if (pickup.kind === 'health' && G.health < G.maxHealth) {
        G.health = Math.min(G.maxHealth, G.health + 30);
        pickup.taken = true;
        pickup.respawn = 25;
        pickup.mesh.visible = false;
        if (G.audio) G.audio.pickup();
        emit('pickup', { kind: 'health' });
      } else if (pickup.kind === 'ammo' && G.ammo < G.maxAmmo) {
        G.ammo = Math.min(G.maxAmmo, G.ammo + 12);
        pickup.taken = true;
        pickup.respawn = 25;
        pickup.mesh.visible = false;
        if (G.audio) G.audio.pickup();
        emit('pickup', { kind: 'ammo' });
      }
    }
  }

  // Guards: patrol their post, chase and swing when alerted or provoked.
  for (const g of G.guards) {
    if (g.down) {
      g.downTimer -= dt;
      if (g.downTimer <= 0) {
        g.down = false;
        g.health = 100;
        g.alerted = false;
        g.fig.group.rotation.x = 0;
        g.fig.group.position.set(g.post.x, 0, g.post.z);
        // Fresh guards forget old grudges; only the mission re-arms them.
        g.punchCooldown = 0;
      }
      continue;
    }
    g.punchCooldown = Math.max(0, g.punchCooldown - dt);
    const gp = g.fig.group.position;
    const dPlayer = Math.hypot(gp.x - p.x, gp.z - p.z);
    const provoked = G.missionIndex === 4 && dPlayer < 26;
    if (g.alerted || provoked) {
      if (dPlayer > 30) {
        g.alerted = false;
      } else if (dPlayer > 1.8) {
        const want = Math.atan2(p.x - gp.x, p.z - gp.z);
        g.heading = want;
        g.speed = 4.4;
        let nx = gp.x + Math.sin(g.heading) * g.speed * dt;
        let nz = gp.z + Math.cos(g.heading) * g.speed * dt;
        const res = G.city.collideCircle(nx, nz, 0.5);
        gp.x = res.x;
        gp.z = res.z;
      } else {
        g.speed = 0;
        if (g.punchCooldown <= 0 && !G.player.inCar) {
          g.punchCooldown = 1.0;
          G.player.hurt(9, gp.x, gp.z);
        }
      }
      animateFigure(g.fig, g.speed, dt, { punch: g.punchCooldown > 0.7 ? 0.2 : 0 });
    } else {
      // Idle patrol: slow loop around the post.
      const t = G.time * 0.25 + g.id * 1.7;
      const tx = g.post.x + Math.sin(t) * 5;
      const tz = g.post.z + Math.cos(t) * 5;
      const dx = tx - gp.x;
      const dz = tz - gp.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        g.heading = Math.atan2(dx, dz);
        g.speed = 1.4;
        gp.x += Math.sin(g.heading) * g.speed * dt;
        gp.z += Math.cos(g.heading) * g.speed * dt;
      } else {
        g.speed = 0;
      }
      animateFigure(g.fig, g.speed, dt, {});
    }
    g.fig.group.rotation.y = g.heading;
  }
  void makeFigure;
}
