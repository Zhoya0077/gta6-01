// Solmarina itself: a procedural sun-soaked coastal city built from one
// painted ground texture, instanced buildings, palms and lamps, a pier and
// a marina. Everything is generated from a seed, so the same seed always
// builds the same city. Also owns the day/dusk/night lighting presets and
// the collision boxes every mover in the game resolves against.

import * as THREE from 'three';
import { ROAD_LINES, BLOCK_PITCH, ROAD_WIDTH, WORLD_HALF } from './state.js';
import { clamp, pick, mulberry32 } from './util.js';

const GROUND_EXTENT = 560; // ground plane covers [-280, 280] in x and z
const PX_PER_UNIT = 2048 / GROUND_EXTENT;

function toPx(v) {
  return (v + GROUND_EXTENT / 2) * PX_PER_UNIT;
}

const BLOCK_CENTERS = [-180, -120, -60, 0, 60, 120, 180];
const PLAZA = { x: 0, z: 0 };
const PARK = { x: -120, z: 120 };

function makeGroundTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  // Base concrete.
  ctx.fillStyle = '#8f8a80';
  ctx.fillRect(0, 0, 2048, 2048);

  // City blocks: warm varied tints.
  const blockTints = ['#a89f92', '#9d968b', '#b0a696', '#968e82', '#a39a8c'];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const half = BLOCK_PITCH / 2 - ROAD_WIDTH / 2;
      ctx.fillStyle = pick(rng, blockTints);
      ctx.fillRect(toPx(bx - half), toPx(bz - half), half * 2 * PX_PER_UNIT, half * 2 * PX_PER_UNIT);
      // Sidewalk border around each block.
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(toPx(bx - half), toPx(bz - half), half * 2 * PX_PER_UNIT, half * 2 * PX_PER_UNIT);
    }
  }

  // Roads: dark asphalt bands along every grid line.
  ctx.fillStyle = '#3a3c42';
  for (const line of ROAD_LINES) {
    ctx.fillRect(toPx(line - ROAD_WIDTH / 2), 0, ROAD_WIDTH * PX_PER_UNIT, 2048);
    ctx.fillRect(0, toPx(line - ROAD_WIDTH / 2), 2048, ROAD_WIDTH * PX_PER_UNIT);
  }
  // Centre dashes.
  ctx.fillStyle = '#d8c56a';
  for (const line of ROAD_LINES) {
    for (let v = -270; v < 270; v += 12) {
      ctx.fillRect(toPx(line) - 2, toPx(v), 4, 5 * PX_PER_UNIT);
      ctx.fillRect(toPx(v), toPx(line) - 2, 5 * PX_PER_UNIT, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,240,0.75)';
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(toPx(lx - 5 + i * 2), toPx(lz - 7), 1.2 * PX_PER_UNIT, 2.4 * PX_PER_UNIT);
        ctx.fillRect(toPx(lx - 7), toPx(lz - 5 + i * 2), 2.4 * PX_PER_UNIT, 1.2 * PX_PER_UNIT);
      }
    }
  }

  // Central plaza: terracotta disc with rings.
  ctx.fillStyle = '#b5764f';
  ctx.beginPath();
  ctx.arc(toPx(PLAZA.x), toPx(PLAZA.z), 20 * PX_PER_UNIT, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,200,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(toPx(PLAZA.x), toPx(PLAZA.z), 14 * PX_PER_UNIT, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(toPx(PLAZA.x), toPx(PLAZA.z), 7 * PX_PER_UNIT, 0, Math.PI * 2);
  ctx.stroke();

  // Park block: lawn with paths.
  ctx.fillStyle = '#6f9f5a';
  ctx.fillRect(toPx(PARK.x - 24), toPx(PARK.z - 24), 48 * PX_PER_UNIT, 48 * PX_PER_UNIT);
  ctx.strokeStyle = '#c9b183';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(toPx(PARK.x - 24), toPx(PARK.z));
  ctx.lineTo(toPx(PARK.x + 24), toPx(PARK.z));
  ctx.moveTo(toPx(PARK.x), toPx(PARK.z - 24));
  ctx.lineTo(toPx(PARK.x), toPx(PARK.z + 24));
  ctx.stroke();

  // Beach: sand band on the east edge.
  ctx.fillStyle = '#e0c896';
  ctx.fillRect(toPx(226), 0, (262 - 226) * PX_PER_UNIT, 2048);
  // Wet sand line where the water meets the beach.
  ctx.fillStyle = '#cbb27f';
  ctx.fillRect(toPx(258), 0, 4 * PX_PER_UNIT, 2048);
  // Deep water colour under the water plane.
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(toPx(262), 0, 2048 - toPx(262), 2048);

  // Marina lot: painted concrete with parking bays.
  ctx.fillStyle = '#97928a';
  ctx.fillRect(toPx(228), toPx(-165), 32 * PX_PER_UNIT, 90 * PX_PER_UNIT);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.strokeRect(toPx(232), toPx(-158 + i * 14), 12 * PX_PER_UNIT, 10 * PX_PER_UNIT);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeFacadeTextures(rng) {
  // Colour map: pale facade with a grid of windows (tinted per building
  // by the instance colour). Emissive map: only the lit windows, so they
  // glow after dark.
  const w = 128;
  const h = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const cctx = colorCanvas.getContext('2d');
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = w;
  emissiveCanvas.height = h;
  const ectx = emissiveCanvas.getContext('2d');
  cctx.fillStyle = '#e8e2d6';
  cctx.fillRect(0, 0, w, h);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 14;
  const ww = w / cols;
  const wh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * ww + ww * 0.22;
      const y = r * wh + wh * 0.25;
      const lit = rng() < 0.28;
      cctx.fillStyle = lit ? '#ffd98a' : '#5a6b7d';
      cctx.fillRect(x, y, ww * 0.56, wh * 0.5);
      if (lit) {
        ectx.fillStyle = '#ffca66';
        ectx.fillRect(x, y, ww * 0.56, wh * 0.5);
      }
    }
  }
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // --- Ground -------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_EXTENT, GROUND_EXTENT),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  // --- Water --------------------------------------------------------------
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x2a7fa5,
    transparent: true,
    opacity: 0.88,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, GROUND_EXTENT), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(262 + 45, -0.35, 0);
  scene.add(water);

  // --- Buildings (one instanced mesh) --------------------------------------
  const facade = makeFacadeTextures(rng);
  const buildingMat = new THREE.MeshLambertMaterial({
    map: facade.map,
    emissive: 0xffffff,
    emissiveMap: facade.emissiveMap,
    emissiveIntensity: 0.45,
  });
  const placements = [];
  const palette = [0xffffff, 0xf3e2c7, 0xdfe8ee, 0xf0d9b5, 0xe6d3d3, 0xd5e0d5, 0xe8e0f0];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === PLAZA.x && bz === PLAZA.z) continue;
      if (bx === PARK.x && bz === PARK.z) continue;
      const distCenter = Math.hypot(bx, bz);
      const downtown = distCenter < 110;
      const pattern = rng();
      const lots = [];
      if (pattern < 0.3) {
        lots.push({ dx: 0, dz: 0, w: 34, d: 34 });
      } else if (pattern < 0.65) {
        lots.push({ dx: -11, dz: 0, w: 20, d: 34 });
        lots.push({ dx: 11, dz: 0, w: 20, d: 34 });
      } else {
        lots.push({ dx: -11, dz: -11, w: 20, d: 20 });
        lots.push({ dx: 11, dz: -11, w: 20, d: 20 });
        lots.push({ dx: -11, dz: 11, w: 20, d: 20 });
        lots.push({ dx: 11, dz: 11, w: 20, d: 20 });
      }
      for (const lot of lots) {
        const h = downtown ? 14 + rng() * 30 : 8 + rng() * 14;
        const x = bx + lot.dx;
        const z = bz + lot.dz;
        placements.push({ x, z, w: lot.w, d: lot.d, h, color: pick(rng, palette) });
        colliders.push({
          minX: x - lot.w / 2, maxX: x + lot.w / 2,
          minZ: z - lot.d / 2, maxZ: z + lot.d / 2,
        });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    buildingMat,
    placements.length,
  );
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.h / 2, p.z);
    dummy.scale.set(p.w, p.h, p.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    buildings.setColorAt(i, color.setHex(p.color));
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Rooftop boxes on some buildings.
  const roofSpots = placements.filter(() => rng() < 0.5);
  const roofs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x8a857c }),
    Math.max(1, roofSpots.length),
  );
  roofSpots.forEach((p, i) => {
    dummy.position.set(p.x + (rng() - 0.5) * p.w * 0.4, p.h + 1, p.z + (rng() - 0.5) * p.d * 0.4);
    dummy.scale.set(4, 2, 4);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
  });
  roofs.instanceMatrix.needsUpdate = true;
  scene.add(roofs);

  // --- Palms ---------------------------------------------------------------
  const palmSpots = [];
  for (let z = -260; z <= 260; z += 26) {
    palmSpots.push({ x: 232 + rng() * 4, z: z + rng() * 8 });
  }
  for (let i = 0; i < 26; i++) {
    const line = pick(rng, ROAD_LINES);
    const along = -240 + rng() * 480;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) palmSpots.push({ x: line + side * 8.5, z: along });
    else palmSpots.push({ x: along, z: line + side * 8.5 });
  }
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    palmSpots.push({ x: PLAZA.x + Math.cos(ang) * 21, z: PLAZA.z + Math.sin(ang) * 21 });
  }
  for (let i = 0; i < 10; i++) {
    palmSpots.push({ x: PARK.x - 18 + rng() * 36, z: PARK.z - 18 + rng() * 36 });
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.32, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
    palmSpots.length,
  );
  const frondGeo = new THREE.BoxGeometry(0.5, 0.12, 3.4);
  frondGeo.translate(0, 0, 1.5);
  const fronds = new THREE.InstancedMesh(
    frondGeo,
    new THREE.MeshLambertMaterial({ color: 0x3d8b4f }),
    palmSpots.length * 6,
  );
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 3, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let f = 0; f < 6; f++) {
      dummy.position.set(p.x, 6, p.z);
      dummy.rotation.set(0.5, (f / 6) * Math.PI * 2, 0);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 6 + f, dummy.matrix);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  scene.add(trunks, fronds);

  // --- Street lamps ---------------------------------------------------------
  const lampSpots = [];
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      lampSpots.push({ x: lx + 7.5, z: lz + 7.5 });
      lampSpots.push({ x: lx - 7.5, z: lz - 7.5 });
    }
  }
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5),
    new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
    lampSpots.length,
  );
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    lampHeadMat,
    lampSpots.length,
  );
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 2.7, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 5.5, p.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles, heads);

  // --- Plaza fountain --------------------------------------------------------
  const fountainMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 1.1, 20), fountainMat);
  basin.position.set(PLAZA.x, 0.55, PLAZA.z);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x4fa8c8 }),
  );
  fountainWater.position.set(PLAZA.x, 1.05, PLAZA.z);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 10), fountainMat);
  column.position.set(PLAZA.x, 1.8, PLAZA.z);
  scene.add(basin, fountainWater, column);
  colliders.push({ minX: PLAZA.x - 5, maxX: PLAZA.x + 5, minZ: PLAZA.z - 5, maxZ: PLAZA.z + 5 });

  // --- Pier -------------------------------------------------------------------
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a6b42 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(72, 0.5, 10), woodMat);
  deck.position.set(262, 0.3, 30);
  scene.add(deck);
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    24,
  );
  let postIdx = 0;
  for (let x = 230; x <= 296; x += 12) {
    for (const dz of [-4.5, 4.5]) {
      dummy.position.set(x, -0.7, 30 + dz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(postIdx++, dummy.matrix);
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  scene.add(posts);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  for (const dz of [-4.8, 4.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(72, 0.18, 0.18), railMat);
    rail.position.set(262, 1.35, 30 + dz);
    scene.add(rail);
  }
  // Bait shack at the end of the pier.
  const shack = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshLambertMaterial({ color: 0x4f7ed9 }));
  shack.position.set(293, 2.5, 26);
  const shackRoof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
  shackRoof.position.set(293, 4.7, 26);
  scene.add(shack, shackRoof);
  colliders.push({ minX: 290, maxX: 296, minZ: 23.5, maxZ: 28.5 });

  // --- Marina: docks, boats, crates ------------------------------------------
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const boats = [];
  for (let i = 0; i < 3; i++) {
    const dz = -150 + i * 34;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(26, 0.4, 4), dockMat);
    dock.position.set(274, 0.1, dz);
    scene.add(dock);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(9, 1.6, 3.2),
      new THREE.MeshLambertMaterial({ color: [0xe8e8e8, 0x4f7ed9, 0xd94f4f][i] }),
    );
    hull.position.set(272, 0.4, dz + 5);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.6, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    cabin.position.set(271, 1.9, dz + 5);
    scene.add(hull, cabin);
    boats.push({ hull, cabin, phase: rng() * Math.PI * 2, z: dz + 5 });
  }
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb58a4f });
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, 14);
  const crateSpots = [];
  for (let i = 0; i < 8; i++) crateSpots.push({ x: 232 + rng() * 20, z: -160 + rng() * 80 });
  for (let i = 0; i < 6; i++) crateSpots.push({ x: -196 + rng() * 16, z: -196 + rng() * 16 });
  crateSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0.8, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
    colliders.push({ minX: p.x - 0.9, maxX: p.x + 0.9, minZ: p.z - 0.9, maxZ: p.z + 0.9 });
  });
  crates.instanceMatrix.needsUpdate = true;
  scene.add(crates);

  // --- Shoreline blockers: water is out of bounds except the pier corridor --
  colliders.push({ minX: 262, maxX: 400, minZ: -400, maxZ: 23 });
  colliders.push({ minX: 262, maxX: 400, minZ: 37, maxZ: 400 });

  // --- Sky: sun disc + drifting clouds ---------------------------------------
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(18, 24), sunMat);
  sun.position.set(320, 90, -140);
  sun.lookAt(0, 20, 0);
  scene.add(sun);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + rng() * 4, 8, 6), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(j * 6 - 6 + rng() * 2, rng() * 1.5, rng() * 3);
      cloud.add(puff);
    }
    cloud.position.set(-260 + rng() * 520, 70 + rng() * 30, -260 + rng() * 520);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- Lighting ----------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x4a5a6a, 0.95);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffd9a0, 1.35);
  dirLight.position.set(180, 140, -80);
  scene.add(dirLight);
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);
  scene.fog = new THREE.Fog(0xf2c99a, 180, 520);
  scene.background = new THREE.Color(0xf7c98b);

  const city = {
    colliders,
    placements,
    targetMeshes: [ground, buildings, roofs, deck, shack],
    buildingMat,
    lampHeadMat,
    waterMat,
    hemi,
    dirLight,
    ambient,
    sun,
    sunMat,
    clouds,
    boats,
    timeOfDay: 'dusk',
    locations: {
      spawn: { x: -36, z: 6 },
      clinic: { x: -66, z: 36 },
      gunShop: { x: 66, z: -36 },
      shops: [
        { x: 141, z: 24, name: 'Coral Cafe' },
        { x: -156, z: -84, name: 'Harbor Hardware' },
        { x: 24, z: 156, name: 'Sunset Souvenirs' },
      ],
      garage: { x: -186, z: 174 },
      warehouse: { x: -186, z: -186 },
      hotel: { x: 186, z: 144 },
      pierEnd: { x: 288, z: 33 },
      marina: { x: 240, z: -120 },
      falconSpot: { x: 154.5, z: -90 },
      auroraSpot: { x: 242, z: -120 },
      plaza: { x: PLAZA.x, z: PLAZA.z },
      park: { x: PARK.x, z: PARK.z },
    },
  };

  city.setTimeOfDay = function setTimeOfDay(mode) {
    city.timeOfDay = mode;
    if (mode === 'night') {
      scene.background.setHex(0x0d1526);
      scene.fog.color.setHex(0x0d1526);
      scene.fog.near = 140;
      scene.fog.far = 420;
      hemi.color.setHex(0x8a9cc8);
      hemi.groundColor.setHex(0x1a2233);
      hemi.intensity = 0.5;
      dirLight.color.setHex(0x9db4e8);
      dirLight.intensity = 0.35;
      dirLight.position.set(-120, 180, 60);
      ambient.intensity = 0.08;
      buildingMat.emissiveIntensity = 1.0;
      lampHeadMat.color.setHex(0xffe9a8);
      waterMat.color.setHex(0x14384f);
      sunMat.color.setHex(0xe8ecf4);
      sun.position.set(-260, 150, 120);
      sun.lookAt(0, 20, 0);
      sun.scale.setScalar(0.55);
    } else if (mode === 'day') {
      scene.background.setHex(0x87bfe8);
      scene.fog.color.setHex(0xa8cfe8);
      scene.fog.near = 200;
      scene.fog.far = 560;
      hemi.color.setHex(0xcfe8ff);
      hemi.groundColor.setHex(0x6a7a5a);
      hemi.intensity = 1.0;
      dirLight.color.setHex(0xfff2dd);
      dirLight.intensity = 1.5;
      dirLight.position.set(120, 220, 40);
      ambient.intensity = 0.15;
      buildingMat.emissiveIntensity = 0.12;
      lampHeadMat.color.setHex(0xd8d8d8);
      waterMat.color.setHex(0x2a7fa5);
      sunMat.color.setHex(0xfff6d8);
      sun.position.set(140, 240, 60);
      sun.lookAt(0, 20, 0);
      sun.scale.setScalar(0.8);
    } else {
      // dusk: golden hour, the game's default look.
      scene.background.setHex(0xf7c98b);
      scene.fog.color.setHex(0xf2c99a);
      scene.fog.near = 180;
      scene.fog.far = 520;
      hemi.color.setHex(0xffe0b3);
      hemi.groundColor.setHex(0x4a5a6a);
      hemi.intensity = 0.95;
      dirLight.color.setHex(0xffd9a0);
      dirLight.intensity = 1.35;
      dirLight.position.set(180, 140, -80);
      ambient.intensity = 0.12;
      buildingMat.emissiveIntensity = 0.45;
      lampHeadMat.color.setHex(0xfff2c0);
      waterMat.color.setHex(0x2a7fa5);
      sunMat.color.setHex(0xffdf8a);
      sun.position.set(320, 90, -140);
      sun.lookAt(0, 20, 0);
      sun.scale.setScalar(1);
    }
  };

  city.update = function update(dt, time) {
    for (const boat of boats) {
      boat.hull.position.y = 0.4 + Math.sin(time * 0.7 + boat.phase) * 0.12;
      boat.hull.rotation.z = Math.sin(time * 0.5 + boat.phase) * 0.02;
      boat.cabin.position.y = 1.9 + Math.sin(time * 0.7 + boat.phase) * 0.12;
      boat.cabin.rotation.z = boat.hull.rotation.z;
    }
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 300) cloud.position.x = -300;
    }
    waterMat.opacity = 0.86 + Math.sin(time * 0.4) * 0.03;
  };

  return city;
}

// Keep a mover inside the playable area: the full square, plus the pier
// corridor reaching east over the water.
export function clampToWorld(pos, radius) {
  pos.z = clamp(pos.z, -WORLD_HALF + radius, WORLD_HALF - radius);
  pos.x = clamp(pos.x, -WORLD_HALF + radius, 300 - radius);
}

// A random point on a road, for spawning traffic and police.
export function randomRoadPoint(rng, out) {
  const line = pick(rng, ROAD_LINES);
  const along = -240 + rng() * 480;
  if (rng() < 0.5) {
    out.x = line;
    out.z = along;
  } else {
    out.x = along;
    out.z = line;
  }
  return out;
}

// The nearest district name for the HUD, from a world position.
export function districtAt(x, z) {
  if (x > 226) return 'The Pier';
  if (x > 170 && z < -60) return 'Marina District';
  if (Math.abs(x) < 40 && Math.abs(z) < 40) return 'Plaza Central';
  if (x < -100 && z > 60) return 'Old Town';
  if (x < -100) return 'Warehouse Row';
  if (z > 120) return 'South Beach';
  if (z < -120) return 'North Hills';
  if (x > 100) return 'East End';
  return 'Downtown';
}
