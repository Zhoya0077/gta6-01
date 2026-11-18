// Procedural people. Every figure is boxes and spheres assembled in
// code, with limbs that pivot at the hip and shoulder so the walk
// cycle and the punch both read. Mara, officers, guards and passers-by
// share one rig and differ only in palette and headgear.

import * as THREE from 'three';

const SKINS = [0xf2c89b, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0x2e6fdb, 0xd64545, 0x3aa655, 0xe0a526, 0x7d4fc9, 0xdddddd, 0x222831, 0x2ee6c8];
const PANTS = [0x2b3440, 0x4a3b2a, 0x334155, 0x1f2937, 0x5b4a68];
const HAIRS = [0x1c1c1c, 0x4a2f1a, 0x8a6b3a, 0xb9b9b9, 0x703d1e];

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function makeFigure(opts = {}) {
  const rng = opts.rng || Math.random;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const skin = opts.skin ?? pick(SKINS);
  const shirt = opts.shirt ?? pick(SHIRTS);
  const pants = opts.pants ?? pick(PANTS);
  const hair = opts.hair ?? pick(HAIRS);

  const group = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.14, 0.82, 0);
  legR.position.set(0.14, 0.82, 0);
  legL.add(box(0.2, 0.82, 0.24, pants, 0, -0.41, 0));
  legR.add(box(0.2, 0.82, 0.24, pants, 0, -0.41, 0));
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.36, 1.42, 0);
  armR.position.set(0.36, 1.42, 0);
  armL.add(box(0.16, 0.62, 0.2, shirt, 0, -0.28, 0));
  armR.add(box(0.16, 0.62, 0.2, shirt, 0, -0.28, 0));
  // Skin hands cap each sleeve, so a raised arm reads as a hand
  // reaching, not a bare box ending mid-air.
  armL.add(box(0.15, 0.14, 0.17, skin, 0, -0.62, 0));
  armR.add(box(0.15, 0.14, 0.17, skin, 0, -0.62, 0));
  const torso = box(0.56, 0.66, 0.32, shirt, 0, 1.15, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.68, 0);
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 12),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
  );
  skull.castShadow = true;
  head.add(skull);
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 }),
  );
  hairMesh.position.y = 0.02;
  head.add(hairMesh);
  group.add(legL, legR, armL, armR, torso, head);

  if (opts.hat === 'cap') {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.09, 14),
      new THREE.MeshStandardMaterial({ color: opts.hatColor || 0xd64545, roughness: 0.8 }),
    );
    cap.position.y = 0.17;
    head.add(cap);
    head.add(box(0.3, 0.03, 0.22, opts.hatColor || 0xd64545, 0, 0.13, 0.26));
  } else if (opts.hat === 'officer') {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.25, 0.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x16233d, roughness: 0.6 }),
    );
    cap.position.y = 0.18;
    head.add(cap);
    const badge = box(0.08, 0.08, 0.02, 0xffd54a, 0.14, 1.28, 0.17);
    group.add(badge);
  }

  // A pistol held in the right hand, kept hidden until combat shows it.
  const gun = new THREE.Group();
  gun.add(box(0.07, 0.09, 0.3, 0x1a1a1a, 0, 0, 0.1));
  gun.position.set(0, -0.68, 0.05);
  gun.visible = false;
  armR.add(gun);

  return { group, head, torso, armL, armR, legL, legR, gun, phase: Math.random() * 6.28, punch: 0 };
}

export function animateFigure(fig, speed, dt, opts = {}) {
  fig.phase += dt * (2 + speed * 1.35);
  const swing = Math.min(0.7, speed * 0.09) * Math.sin(fig.phase);
  if (opts.punch > 0) {
    fig.punch = opts.punch;
    fig.armR.rotation.x = -1.7 + Math.sin(fig.punch * 18) * 0.2;
    fig.armL.rotation.x = -0.4;
  } else if (opts.aim) {
    fig.armR.rotation.x = -1.5;
    fig.armL.rotation.x = -0.3;
    fig.armR.rotation.z = -0.15;
  } else {
    fig.armL.rotation.x = swing;
    fig.armR.rotation.x = -swing;
    fig.armL.rotation.z = 0.06;
    fig.armR.rotation.z = -0.06;
  }
  fig.legL.rotation.x = -swing * 1.15;
  fig.legR.rotation.x = swing * 1.15;
  fig.group.position.y = Math.abs(Math.sin(fig.phase)) * Math.min(0.05, speed * 0.006);
  if (opts.cower) {
    fig.head.rotation.x = 0.5;
    fig.armL.rotation.x = -2.4;
    fig.armR.rotation.x = -2.4;
  } else {
    fig.head.rotation.x = 0;
  }
}

export function makeMara() {
  return makeFigure({ skin: 0xe0ac69, shirt: 0xb03a4e, pants: 0x2b3440, hair: 0x1c1c1c, hat: null });
}

export function makeOfficer() {
  return makeFigure({ shirt: 0x24365e, pants: 0x16233d, hat: 'officer' });
}

export function makeGuard() {
  return makeFigure({ shirt: 0x222831, pants: 0x111111, skin: 0xc68642 });
}

// Dario's pier contact: yellow jacket and cap, unmissable at a distance.
export function makeContact() {
  return makeFigure({ skin: 0x8d5524, shirt: 0xe0a526, pants: 0x334155, hair: 0xb9b9b9, hat: 'cap', hatColor: 0xe0a526 });
}
