// Low-poly humanoid figures for Solmarina: the player, pedestrians,
// police officers and guards are all built from the same box-based body
// with swinging limbs, so the whole crowd shares one cheap animation rig.

import * as THREE from 'three';

const SKIN_TONES = [0xf2c89b, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR_COLORS = [0x2b1d16, 0x4a2f1d, 0x111111, 0x6b4a2a, 0xb0b0b0, 0x8a5a2b];
const SHIRT_COLORS = [0xd94f4f, 0x4f7ed9, 0x4fd97a, 0xe0d24f, 0x9b4fd9, 0x4fd9d2, 0xe88a4f, 0xf2f2f2];
const PANTS_COLORS = [0x2e4057, 0x3b3b3b, 0x5a4a3b, 0x274156, 0x4a4a55];

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// Build a humanoid ~1.8 units tall, facing +Z. Returns the group plus
// references to the parts the walk animation swings.
export function makeHumanoid(options) {
  const opts = options || {};
  const rng = opts.rng || Math.random;
  const skin = opts.skin ?? SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const shirt = opts.shirt ?? SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const pants = opts.pants ?? PANTS_COLORS[Math.floor(rng() * PANTS_COLORS.length)];
  const hair = opts.hair ?? HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)];

  const group = new THREE.Group();

  // Legs pivot at the hip (y = 0.85) so the walk swing looks right.
  const legGeo = new THREE.BoxGeometry(0.22, 0.85, 0.24);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.geometry = legGeo.clone();
  leftLeg.geometry.translate(0, -0.425, 0);
  leftLeg.position.set(-0.14, 0.85, 0);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.geometry = legGeo.clone();
  rightLeg.geometry.translate(0, -0.425, 0);
  rightLeg.position.set(0.14, 0.85, 0);

  // Arms pivot at the shoulder (y = 1.42).
  const armGeo = new THREE.BoxGeometry(0.16, 0.72, 0.18);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.geometry = armGeo.clone();
  leftArm.geometry.translate(0, -0.36, 0);
  leftArm.position.set(-0.36, 1.42, 0);
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.geometry = armGeo.clone();
  rightArm.geometry.translate(0, -0.36, 0);
  rightArm.position.set(0.36, 1.42, 0);

  const body = box(0.56, 0.62, 0.3, shirt, 0, 1.16, 0);
  const head = box(0.34, 0.36, 0.34, skin, 0, 1.66, 0);
  const hairMesh = box(0.36, 0.14, 0.36, hair, 0, 1.86, 0);
  // Simple face: two dark eyes on the front of the head.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const eyeGeo = new THREE.BoxGeometry(0.05, 0.06, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 1.68, 0.18);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.08, 1.68, 0.18);

  group.add(leftLeg, rightLeg, leftArm, rightArm, body, head, hairMesh, eyeL, eyeR);

  // Optional extras: a cap, a police hat, or a held pistol.
  let hat = null;
  if (opts.hat === 'police') {
    hat = box(0.4, 0.1, 0.4, 0x1d3557, 0, 1.92, 0);
    const brim = box(0.44, 0.03, 0.44, 0x101820, 0, 1.87, 0);
    group.add(hat, brim);
  } else if (opts.hat === 'cap') {
    hat = box(0.38, 0.1, 0.38, opts.hatColor || 0xcc3333, 0, 1.9, 0);
    const peak = box(0.38, 0.03, 0.2, opts.hatColor || 0xcc3333, 0, 1.86, 0.26);
    group.add(hat, peak);
  }

  let pistol = null;
  if (opts.pistol) {
    pistol = box(0.07, 0.1, 0.3, 0x222222, 0, -0.72, 0.1);
    rightArm.add(pistol);
  }

  return {
    group,
    parts: { leftLeg, rightLeg, leftArm, rightArm, body, head },
    pistol,
  };
}

// Swing the limbs for a walk/run cycle. walkPhase advances with distance
// travelled; speedNorm 0..1 blends the swing from idle to full stride.
// punchT 0..1 overrides the right arm with a punch jab.
export function animateHumanoid(fig, walkPhase, speedNorm, punchT) {
  const swing = Math.sin(walkPhase) * 0.62 * speedNorm;
  fig.parts.leftLeg.rotation.x = swing;
  fig.parts.rightLeg.rotation.x = -swing;
  fig.parts.leftArm.rotation.x = -swing * 0.8;
  if (punchT > 0) {
    // Jab: right arm snaps forward, then relaxes back.
    const jab = Math.sin(Math.min(1, punchT) * Math.PI);
    fig.parts.rightArm.rotation.x = -1.5 * jab;
  } else {
    fig.parts.rightArm.rotation.x = swing * 0.8;
  }
  // Subtle idle breathing when standing still.
  if (speedNorm < 0.05 && punchT <= 0) {
    fig.parts.body.position.y = 1.16 + Math.sin(walkPhase * 0.4) * 0.008;
  }
}
