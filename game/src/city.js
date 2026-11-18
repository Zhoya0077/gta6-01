// Solmarina itself: a procedural coastal grid city built entirely in
// code. Roads and blocks, towers, palms, lamps, the pier and the sea.
// Facades are canvas textures, so windows glow at night without a
// single image file, and every solid object registers a collider the
// physics can trust.

import * as THREE from 'three';
import { WORLD_HALF, SHORE_X, PIER_Z_MIN, PIER_Z_MAX, ROAD_LINES, ROAD_WIDTH, BLOCK_PITCH } from './state.js';
import { makeRng, clamp } from './util.js';

void BLOCK_PITCH;

const PALETTE = [0xe8dcc8, 0xdfc9a8, 0xc9d6dd, 0xe6b8a2, 0xb8c9a8, 0xd9b8c4, 0xf2e8d5, 0xa8bfd4];
const TOWER_COLORS = [0x8fa8bf, 0x7d94a8, 0x9fb4c4, 0x6f87a0, 0xb0a890];

function facadeTexture(base, rng, floors, cols) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.12)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const lit = [];
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = 10 + c * ((128 - 20) / cols);
      const y = 12 + f * ((256 - 24) / floors);
      const w = (128 - 20) / cols - 8;
      const h = (256 - 24) / floors - 10;
      const isLit = rng.chance(0.45);
      lit.push(isLit);
      ctx.fillStyle = isLit ? '#ffd98a' : '#2a3542';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, w, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const eCanvas = document.createElement('canvas');
  eCanvas.width = 128;
  eCanvas.height = 256;
  const eCtx = eCanvas.getContext('2d');
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 128, 256);
  let i = 0;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (lit[i]) {
        const x = 10 + c * ((128 - 20) / cols);
        const y = 12 + f * ((256 - 24) / floors);
        eCtx.fillStyle = '#ffcf7a';
        eCtx.fillRect(x, y, (128 - 20) / cols - 8, (256 - 24) / floors - 10);
      }
      i++;
    }
  }
  const emissive = new THREE.CanvasTexture(eCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map: tex, emissive };
}

function signTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 26px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const lampMats = [];
  const windowMats = [];
  const glowSprites = [];

  // Ground, roads, beach, sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 220, WORLD_HALF * 2 + 220),
    new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const cityFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.95 }),
  );
  cityFloor.rotation.x = -Math.PI / 2;
  cityFloor.position.y = 0;
  cityFloor.receiveShadow = true;
  group.add(cityFloor);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.9 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  for (const line of ROAD_LINES) {
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, ROAD_WIDTH), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, line);
    hRoad.receiveShadow = true;
    group.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_HALF * 2), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(line, 0.02, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
    for (let t = -WORLD_HALF + 15; t < WORLD_HALF; t += 12) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(t, 0.04, line);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(line, 0.04, t);
      group.add(dashV);
    }
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(40, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0xdcc49a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(SHORE_X - 8, 0.01, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, WORLD_HALF * 2 + 400), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SHORE_X + 150, -0.3, 0);
  group.add(sea);

  // Buildings, block by block.
  const blockCenters = [];
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      blockCenters.push({
        x: (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2,
        z: (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2,
      });
    }
  }
  for (const x of [-240, 240]) {
    for (let z = -210; z <= 210; z += 60) blockCenters.push({ x, z });
  }
  for (const z of [-240, 240]) {
    for (let x = -180; x <= 180; x += 60) blockCenters.push({ x, z });
  }

  // Facade textures are cached by colour and grid size: dozens of
  // buildings share a handful of canvases, which keeps texture memory
  // small and the build fast.
  const facadeCache = new Map();
  function facadeFor(base, floors, cols) {
    const key = base + '/' + floors + '/' + cols;
    if (!facadeCache.has(key)) facadeCache.set(key, facadeTexture(base, rng, floors, cols));
    return facadeCache.get(key);
  }

  for (const block of blockCenters) {
    if (block.x > SHORE_X - 30) continue;
    const distCenter = Math.hypot(block.x, block.z);
    const downtown = distCenter < 95;
    const count = downtown ? rng.int(1, 2) : rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const w = rng.range(16, downtown ? 30 : 22);
      const d = rng.range(16, downtown ? 30 : 22);
      const h = downtown ? rng.range(28, 62) : rng.range(9, 24);
      const ox = count === 1 ? 0 : rng.range(-11, 11);
      const oz = count === 1 ? 0 : rng.range(-11, 11);
      const x = block.x + ox;
      const z = block.z + oz;
      const base = downtown ? rng.pick(TOWER_COLORS) : rng.pick(PALETTE);
      const floors = Math.max(3, Math.round(h / 3.4));
      const cols = Math.max(3, Math.round(w / 3.4));
      const { map, emissive } = facadeFor(base, floors, cols);
      const mat = new THREE.MeshStandardMaterial({
        map, emissiveMap: emissive, emissive: new THREE.Color(0xffc46a),
        emissiveIntensity: 0.55, roughness: 0.85,
      });
      windowMats.push(mat);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 1 }),
      );
      roof.position.set(x, h + 0.25, z);
      group.add(roof);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // Palms along the beach and scattered through the blocks.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.9, side: THREE.DoubleSide });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 7 * s, 7), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(4.4 * s, 0.9 * s), frondMat);
      frond.position.y = 7 * s;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.rotation.z = 0.5;
      frond.translateX(1.8 * s);
      frond.castShadow = true;
      g.add(frond);
    }
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 8, 6), trunkMat);
    coconut.position.y = 6.8 * s;
    g.add(coconut);
    g.position.set(x, 0, z);
    group.add(g);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  for (let z = -240; z <= 240; z += 30) {
    palm(SHORE_X - 18 + rng.range(-2, 2), z + rng.range(-4, 4), rng.range(0.85, 1.2));
    if (rng.chance(0.6)) palm(rng.pick(ROAD_LINES) + 10, z + rng.range(-6, 6), rng.range(0.8, 1.1));
  }
  for (let i = 0; i < 26; i++) {
    palm(rng.range(-240, 230), rng.range(-240, 240), rng.range(0.8, 1.15));
  }

  // Street lamps with a cheap additive glow pool — no extra lights.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 1.6 });
  lampMats.push(bulbMat);
  function lamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
    pole.position.y = 3.2;
    pole.castShadow = true;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bulbMat);
    bulb.position.y = 6.5;
    g.add(bulb);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    g.add(pool);
    glowSprites.push(pool.material);
    g.position.set(x, 0, z);
    group.add(g);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
  }
  for (const line of ROAD_LINES) {
    for (let t = -210; t <= 210; t += 60) {
      lamp(line + 8, t + 8);
    }
  }
  void lampMats;

  // Billboards with invented local names.
  const billboards = [
    { x: -60, z: -120, text: 'SOLMARINA', bg: '#123a5c', fg: '#ffd54a' },
    { x: 120, z: 60, text: 'MARINA MOTORS', bg: '#5c1717', fg: '#ffffff' },
    { x: -150, z: 150, text: 'PIER 9  •  FRESH CATCH', bg: '#14594a', fg: '#e8fff8' },
  ];
  for (const b of billboards) {
    const tex = signTexture(b.text, b.bg, b.fg);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(20, 5, 0.6),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.7 }),
    );
    board.position.set(b.x, 12, b.z);
    board.castShadow = true;
    group.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), poleMat);
    post.position.set(b.x, 5, b.z);
    group.add(post);
    colliders.push({ minX: b.x - 0.6, maxX: b.x + 0.6, minZ: b.z - 0.6, maxZ: b.z + 0.6 });
  }

  // The pier, reaching east over the water.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 12), pierMat);
  pierDeck.position.set(SHORE_X + 14, 0.6, (PIER_Z_MIN + PIER_Z_MAX) / 2);
  pierDeck.receiveShadow = true;
  group.add(pierDeck);
  for (let x = SHORE_X + 2; x <= SHORE_X + 28; x += 8) {
    for (const z of [PIER_Z_MIN + 1, PIER_Z_MAX - 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 7), pierMat);
      post.position.set(x, -0.4, z);
      group.add(post);
    }
  }
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a6b7d, roughness: 0.9 }),
  );
  shack.position.set(SHORE_X + 26, 3.1, PIER_Z_MIN + 3);
  shack.castShadow = true;
  group.add(shack);
  colliders.push({ minX: SHORE_X + 22.5, maxX: SHORE_X + 29.5, minZ: PIER_Z_MIN, maxZ: PIER_Z_MIN + 6 });

  // The three shops, each with a sign and an awning.
  const shops = [
    { name: 'Harbor Guns', kind: 'guns', x: -60, z: -28, color: '#5c1717' },
    { name: 'Marina Market', kind: 'market', x: 60, z: 32, color: '#14594a' },
    { name: 'Coastal Clinic', kind: 'clinic', x: -32, z: 122, color: '#e8e8e8' },
  ];
  for (const shop of shops) {
    const tex = signTexture(shop.name.toUpperCase(), shop.color, shop.kind === 'clinic' ? '#c0392b' : '#ffffff');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.4),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.4 }),
    );
    sign.position.set(shop.x, 5.4, shop.z - 8.4);
    group.add(sign);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(15, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: shop.kind === 'clinic' ? 0xe74c3c : 0x2e6fdb, roughness: 0.8 }),
    );
    awning.position.set(shop.x, 3.6, shop.z - 8);
    group.add(awning);
  }

  // Sun, sky, clouds.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-120, 160, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a6a55, 1.25);
  scene.add(hemi);
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 10, 8), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(j * 8 - 12 + rng.range(-2, 2), rng.range(-1, 1), rng.range(-3, 3));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-260, 260), rng.range(70, 95), rng.range(-260, 260));
    scene.add(cloud);
    clouds.push(cloud);
  }
  scene.fog = new THREE.Fog(0xf2b880, 220, 620);
  scene.background = new THREE.Color(0xf7b267);

  let timeMode = 'dusk';
  function setTimeOfDay(mode) {
    timeMode = mode;
    if (mode === 'day') {
      sun.color.set(0xfff3d6);
      sun.intensity = 2.8;
      sun.position.set(-60, 200, 40);
      hemi.intensity = 1.4;
      scene.background.set(0x87b5e0);
      scene.fog.color.set(0xa8c8e0);
      scene.fog.near = 260;
      scene.fog.far = 700;
      for (const m of windowMats) m.emissiveIntensity = 0.12;
      for (const m of glowSprites) m.opacity = 0;
      bulbMat.emissiveIntensity = 0.4;
    } else if (mode === 'night') {
      sun.color.set(0x8aa8d8);
      sun.intensity = 0.8;
      sun.position.set(80, 180, -60);
      hemi.intensity = 0.55;
      scene.background.set(0x0b1026);
      scene.fog.color.set(0x0b1026);
      scene.fog.near = 160;
      scene.fog.far = 520;
      for (const m of windowMats) m.emissiveIntensity = 1.4;
      for (const m of glowSprites) m.opacity = 0.16;
      bulbMat.emissiveIntensity = 2.4;
    } else {
      sun.color.set(0xffd9a0);
      sun.intensity = 2.6;
      sun.position.set(-120, 160, 60);
      hemi.intensity = 1.25;
      scene.background.set(0xf7b267);
      scene.fog.color.set(0xf2b880);
      scene.fog.near = 220;
      scene.fog.far = 620;
      for (const m of windowMats) m.emissiveIntensity = 0.55;
      for (const m of glowSprites) m.opacity = 0.06;
      bulbMat.emissiveIntensity = 1.6;
    }
  }

  function districtAt(x, z) {
    const d = Math.hypot(x, z);
    if (d < 80) return 'Downtown';
    if (x > 170) return 'Marina District';
    if (x < -150 && z < 0) return 'Old Town';
    if (z < -150) return 'Harbor North';
    if (z > 150) return 'Palms South';
    if (x < 0) return 'Westside';
    return 'Eastside';
  }

  function isOnRoad(x, z) {
    for (const line of ROAD_LINES) {
      if (Math.abs(z - line) < ROAD_WIDTH / 2 + 1) return true;
      if (Math.abs(x - line) < ROAD_WIDTH / 2 + 1) return true;
    }
    return false;
  }

  // Push a circle out of building colliders, world bounds and deep
  // water. A small skin keeps bodies from jittering against walls;
  // callers at scrape speed ask for a thinner one.
  function collideCircle(x, z, r, opts = {}) {
    const skin = opts.skin ?? 0.06;
    let hit = false;
    const half = WORLD_HALF - r;
    if (x < -half) { x = -half; hit = true; }
    if (x > SHORE_X + 26) { x = SHORE_X + 26; hit = true; }
    if (z < -half) { z = -half; hit = true; }
    if (z > half) { z = half; hit = true; }
    if (x > SHORE_X - 2 && !(z > PIER_Z_MIN - 1 && z < PIER_Z_MAX + 1)) {
      if (x > SHORE_X + 4) { x = SHORE_X + 4; hit = true; }
    }
    if (x > SHORE_X + 2 && (z < PIER_Z_MIN - 1 || z > PIER_Z_MAX + 1)) {
      x = SHORE_X + 2;
      hit = true;
    }
    for (const c of colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      const rr = r + skin;
      if (d2 < rr * rr) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * rr;
          z = cz + (dz / d) * rr;
        } else {
          const pushL = x - c.minX + rr;
          const pushR = c.maxX - x + rr;
          const pushU = z - c.minZ + rr;
          const pushD = c.maxZ - z + rr;
          const m = Math.min(pushL, pushR, pushU, pushD);
          if (m === pushL) x = c.minX - rr;
          else if (m === pushR) x = c.maxX + rr;
          else if (m === pushU) z = c.minZ - rr;
          else z = c.maxZ + rr;
        }
      }
    }
    return { x, z, hit };
  }

  function update(dt, t) {
    sea.position.y = -0.3 + Math.sin(t * 0.6) * 0.12;
    seaMat.color.setHSL(0.54, 0.62, timeMode === 'night' ? 0.16 : 0.38);
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.1;
      if (cloud.position.x > 300) cloud.position.x = -300;
    }
  }

  function randomRoadPos(rngFn) {
    const line = ROAD_LINES[Math.floor(rngFn() * ROAD_LINES.length)];
    const along = (rngFn() * 2 - 1) * (WORLD_HALF - 30);
    return rngFn() < 0.5 ? { x: line, z: along } : { x: along, z: line };
  }

  return {
    group, colliders, shops, sun, hemi, clouds,
    setTimeOfDay, districtAt, isOnRoad, collideCircle, update, randomRoadPos,
    get timeMode() { return timeMode; },
  };
}
