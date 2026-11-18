// Five chained story jobs for Mara Voss, from a first timed fare to
// the Aurora S itself. Each job is a chain of stages marked by a
// glowing beacon, opened by a phone briefing from Dario, and paid on
// completion. Timers are forgiving: running out restarts the job, it
// never ends the story.

import * as THREE from 'three';
import { G, emit } from './state.js';
import { setWanted } from './police.js';
import { phoneMessage, setObjective, announce, showToast } from './hud.js';
import { makeFigure, makeContact } from './characters.js';

export const MISSIONS = [
  {
    name: 'First Fare',
    brief: ["Mara. First job's simple.", 'Pick up my friend at 9th & Harbor. Then get them across town — fast, but in one piece.'],
    stages: [
      { label: 'Pick up the passenger', sub: 'Drive to the marker', pos: { x: -90, z: -30 } },
      { label: 'Drop off the passenger', sub: 'You are on the clock', pos: { x: 90, z: 90 }, timer: 100, needCar: true },
    ],
    reward: 250,
  },
  {
    name: 'Hot Wheels',
    brief: ['A Falcon GT is sitting pretty uptown. No owner in sight.', 'Borrow it. Bring it to my garage on the west side. Cops will notice — of course they will.'],
    stages: [
      { label: 'Find the Falcon GT', sub: 'Uptown, near the towers', pos: { x: 155, z: -150 } },
      { label: 'Steal the Falcon GT', sub: 'Press E beside the car', pos: { x: 155, z: -150 }, needStoryCar: 'falcon' },
      { label: 'Deliver the Falcon to the garage', sub: 'Lose the heat if you can', pos: { x: -150, z: 150 }, needCar: true, needStoryCar: 'falcon' },
    ],
    reward: 400,
  },
  {
    name: 'Pier Drop',
    brief: ['Pier 9. A friend in a yellow jacket is waiting.', 'Take the package. Bring it north. Do not open it, do not drop it, do not get chatty with uniforms.'],
    stages: [
      { label: 'Meet the contact on the pier', sub: 'East end, past the shack', pos: { x: 270, z: 30 } },
      { label: 'Take the package', sub: 'Walk up to the contact', pos: { x: 270, z: 30 } },
      { label: 'Deliver the package uptown', sub: 'Keep it quiet', pos: { x: -30, z: -210 } },
    ],
    reward: 500,
  },
  {
    name: 'Night Run',
    brief: ['Tonight we run the whole city, end to end.', 'Three checkpoints, one clock. The streets are empty and the lamps are on. Show me what you can do.'],
    stages: [
      { label: 'Checkpoint 1 of 3', sub: 'Drive the route', pos: { x: 150, z: 150 }, timer: 130, needCar: true },
      { label: 'Checkpoint 2 of 3', sub: 'Keep the pace', pos: { x: -150, z: -150 }, needCar: true },
      { label: 'Checkpoint 3 of 3', sub: 'Almost there', pos: { x: 30, z: -210 }, needCar: true },
      { label: 'Finish at the south lot', sub: 'Bring it home', pos: { x: 90, z: 210 }, needCar: true },
    ],
    reward: 650,
  },
  {
    name: 'The Aurora S',
    brief: ['Last job, Mara. The Aurora S. One of one.', 'It sits in a guarded lot in Harbor North. Guards, cameras, attitude. Take it, bring it to my garage, and your debt is gone.'],
    stages: [
      { label: 'Reach the guarded lot', sub: 'Harbor North — expect company', pos: { x: 210, z: -180 } },
      { label: 'Steal the Aurora S', sub: 'Press E beside the car', pos: { x: 210, z: -180 }, needStoryCar: 'aurora' },
      { label: 'Deliver the Aurora to the garage', sub: 'The whole city will hear this one', pos: { x: -150, z: 150 }, needCar: true, needStoryCar: 'aurora' },
    ],
    reward: 1200,
  },
];

let beaconGroup = null;
let beaconRing = null;
let passengerFig = null;
let contactFig = null;
let briefingSent = false;
let stageTimerRunning = false;

function findStoryCar(key) {
  return G.cars.find((c) => c.storyCar === key) || null;
}

function buildBeacon(scene) {
  beaconGroup = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.2, 26, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 13;
  beaconGroup.add(pillar);
  beaconRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.28, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9 }),
  );
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.y = 0.3;
  beaconGroup.add(beaconRing);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.08;
  beaconGroup.add(disc);
  beaconGroup.visible = false;
  scene.add(beaconGroup);
  G.beacon = beaconGroup;
}

export function initMissions(scene) {
  buildBeacon(scene);
  passengerFig = makeFigure({ shirt: 0x7d4fc9, pants: 0x2b3440 });
  passengerFig.group.position.set(-90, 0, -30);
  passengerFig.group.visible = false;
  scene.add(passengerFig.group);
  contactFig = makeContact();
  contactFig.group.position.set(272, 0, 30);
  contactFig.group.visible = false;
  contactFig.group.rotation.y = -Math.PI / 2;
  scene.add(contactFig.group);
}

function currentStage() {
  if (G.missionIndex >= MISSIONS.length) return null;
  const m = MISSIONS[G.missionIndex];
  return m.stages[G.missionStage] || null;
}

function placeBeacon() {
  const stage = currentStage();
  if (!stage) {
    beaconGroup.visible = false;
    G.objectivePos = null;
    G.objectiveLabel = '';
    return;
  }
  const pos = stage.pos;
  // Steal stages track the car itself once it moves; delivery stages
  // keep the beacon on the destination, where the car must arrive.
  if (stage.needStoryCar && !stage.needCar) {
    const car = findStoryCar(stage.needStoryCar);
    if (car) {
      beaconGroup.position.set(car.mesh.position.x, 0, car.mesh.position.z);
      G.objectivePos = { x: car.mesh.position.x, z: car.mesh.position.z };
      G.objectiveLabel = stage.label;
      beaconGroup.visible = true;
      return;
    }
  }
  beaconGroup.position.set(pos.x, 0, pos.z);
  G.objectivePos = { ...pos };
  G.objectiveLabel = stage.label;
  beaconGroup.visible = true;
}

function refreshObjective() {
  const stage = currentStage();
  if (!stage || G.missionIndex >= MISSIONS.length) {
    setObjective('Free Roam', 'Solmarina is yours — drive, earn, stay ahead.', '');
    return;
  }
  const m = MISSIONS[G.missionIndex];
  setObjective(m.name, stage.label, stage.sub || '');
}

export function startMission(index) {
  G.missionIndex = index;
  G.missionStage = 0;
  G.missionTimer = -1;
  stageTimerRunning = false;
  briefingSent = true;
  const m = MISSIONS[index];
  if (G.audio) G.audio.phone();
  m.brief.forEach((line, i) => {
    setTimeout(() => phoneMessage('DARIO', line), 400 + i * 1400);
  });
  if (index === 3 && G.city) G.city.setTimeOfDay('night');
  if (index === 0) passengerFig.group.visible = true;
  if (index === 2) contactFig.group.visible = true;
  placeBeacon();
  refreshObjective();
  G.missionCooldown = 0;
}

export function debugSetMission(index, stage) {
  G.missionIndex = index;
  G.missionStage = stage;
  G.missionTimer = -1;
  briefingSent = true;
  if (index === 0) passengerFig.group.visible = true;
  if (index === 2) contactFig.group.visible = true;
  placeBeacon();
  refreshObjective();
}

function advanceStage() {
  const m = MISSIONS[G.missionIndex];
  if (G.missionIndex === 0 && G.missionStage === 0) {
    passengerFig.group.visible = false;
    G.passenger = true;
  }
  if (G.missionIndex === 1 && G.missionStage === 1) {
    setWanted(Math.max(G.wanted, 2));
  }
  if (G.missionIndex === 2 && G.missionStage === 1) {
    G.packageCarried = true;
    contactFig.group.visible = false;
    setWanted(Math.max(G.wanted, 1));
    showToast('Package secured. Do not get stopped.');
  }
  if (G.missionIndex === 4 && G.missionStage === 1) {
    setWanted(Math.max(G.wanted, 3));
  }
  G.missionStage++;
  G.missionTimer = -1;
  stageTimerRunning = false;
  if (G.audio) G.audio.checkpoint();
  if (G.missionStage >= m.stages.length) {
    completeMission();
    return;
  }
  placeBeacon();
  refreshObjective();
}

function completeMission() {
  const m = MISSIONS[G.missionIndex];
  G.cash += m.reward;
  G.missionsDone++;
  G.stats.missionsDone++;
  G.passenger = null;
  G.packageCarried = false;
  if (G.audio) {
    G.audio.missionDone();
    G.audio.cash();
  }
  announce('JOB DONE', m.name + '  •  +$' + m.reward);
  showToast('Dario paid $' + m.reward + '. Debt shrinking.');
  emit('missionComplete', { index: G.missionIndex, reward: m.reward });
  if (G.missionIndex === 3 && G.city) G.city.setTimeOfDay('dusk');
  G.missionIndex++;
  G.missionStage = 0;
  G.missionTimer = -1;
  briefingSent = false;
  if (G.missionIndex >= MISSIONS.length) {
    G.storyDone = true;
    beaconGroup.visible = false;
    G.objectivePos = null;
    refreshObjective();
    emit('storyComplete', {});
    return;
  }
  G.missionCooldown = 5;
  beaconGroup.visible = false;
  G.objectivePos = null;
  setObjective('Between Jobs', 'Dario is lining up the next job…', '');
}

function failTimer() {
  showToast('Too slow — Dario gives you another shot.');
  G.missionStage = 0;
  G.missionTimer = -1;
  stageTimerRunning = false;
  if (G.missionIndex === 0) {
    passengerFig.group.visible = true;
    G.passenger = null;
  }
  placeBeacon();
  refreshObjective();
}

export function updateMissions(dt) {
  if (beaconGroup && beaconGroup.visible) {
    const s = 1 + Math.sin(G.time * 3.2) * 0.12;
    beaconRing.scale.set(s, s, s);
    beaconGroup.rotation.y += dt * 0.6;
  }
  if (G.missionIndex >= MISSIONS.length) return;
  if (!briefingSent) {
    G.missionCooldown -= dt;
    if (G.missionCooldown <= 0) startMission(G.missionIndex);
    return;
  }
  const stage = currentStage();
  if (!stage) return;
  if (stage.timer && !stageTimerRunning && G.missionTimer < 0) {
    G.missionTimer = stage.timer;
    stageTimerRunning = true;
  }
  if (G.missionTimer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) {
      G.missionTimer = -1;
      failTimer();
      return;
    }
  }
  const p = G.player.pos();
  const target = stage.needStoryCar && !stage.needCar ? findStoryCar(stage.needStoryCar) : null;
  const tx = target ? target.mesh.position.x : stage.pos.x;
  const tz = target ? target.mesh.position.z : stage.pos.z;
  const d = Math.hypot(p.x - tx, p.z - tz);
  if (stage.needStoryCar && !stage.needCar) {
    const car = findStoryCar(stage.needStoryCar);
    if (car && G.player.inCar === car) {
      advanceStage();
      return;
    }
    if (d < 7 && car) placeBeacon();
    return;
  }
  if (stage.needStoryCar && stage.needCar) {
    const car = findStoryCar(stage.needStoryCar);
    if (d < 9 && G.player.inCar === car) {
      advanceStage();
      return;
    }
    return;
  }
  if (stage.needCar) {
    if (d < 9 && G.player.inCar) advanceStage();
    return;
  }
  if (d < 6) advanceStage();
}

export function missionProgressText() {
  if (G.storyDone) return 'Story complete';
  return 'Job ' + (G.missionIndex + 1) + ' of ' + MISSIONS.length;
}

export function objectiveDistance() {
  if (!G.objectivePos || !G.player) return null;
  const p = G.player.pos();
  return Math.round(Math.hypot(p.x - G.objectivePos.x, p.z - G.objectivePos.z));
}
