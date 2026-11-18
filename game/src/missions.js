// The story of Solmarina: five chained jobs from the fixer Dario Kessler,
// told through phone messages, with objective markers, timers, rewards and
// failure states. Completing all five pays off Mara's debt and opens free
// roam. Missions are data plus a small stage machine; the beacon mesh and
// the HUD objective always point at the current target.

import * as THREE from 'three';
import { G, emit, on } from './state.js';
import { dist2 } from './util.js';
import { setWanted } from './police.js';
import { spawnGuard } from './combat.js';

const MISSIONS = [
  {
    name: 'First Fare',
    reward: 150,
    briefing: [
      'Mara. You are back, and you still owe me. First job is easy: a package at the warehouse on the west side.',
      'Pick it up, run it to the Marisol Hotel on the east side. My buyer does not wait. Do not be slow.',
    ],
  },
  {
    name: 'Getaway',
    reward: 250,
    briefing: [
      'A Falcon GT is parked on 5th, red, unlocked. Take it. The owner will report it — that is the point.',
      'Show me you can lose a tail. Three stars, Mara. Then go quiet until the heat dies.',
    ],
  },
  {
    name: 'The Drop',
    reward: 300,
    briefing: [
      'Come to my garage first. I have a drop that needs to reach the end of the pier.',
      'Patrols watch the pier at night. If they light you up, finish the run anyway. The boat leaves either way.',
    ],
  },
  {
    name: 'Shakedown',
    reward: 400,
    briefing: [
      'Three shops on my list stopped paying. Visit each one and collect. Politely. Mostly.',
      'They keep guards. Guards keep opinions. Bring your fists and your pistol.',
    ],
  },
  {
    name: 'The Big Score',
    reward: 800,
    briefing: [
      'Last job, Mara, and then we are square. The Aurora S — one of a kind — is sitting at the marina.',
      'Take it, lose four stars of heat, and bring it to my garage in one piece. Do this and your debt is gone.',
    ],
  },
];

let beacon = null;
let beaconRing = null;
let pierAlerted = false;
let collectedShops = 0;
let guardsSpawnedFor = -1;

function makeBeacon(scene) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd54a, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  });
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 20, 1, true), mat);
  beacon.position.y = 13;
  beacon.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.1, 28), ringMat);
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.15;
  beaconRing.visible = false;
  scene.add(beacon, beaconRing);
}

function setObjective(name, text, sub, pos) {
  G.objective = { name, text, sub: sub || '', pos: pos || null };
  G.objectivePos = pos || null;
  if (pos) {
    beacon.position.x = pos.x;
    beacon.position.z = pos.z;
    beaconRing.position.x = pos.x;
    beaconRing.position.z = pos.z;
    beacon.visible = true;
    beaconRing.visible = true;
  } else {
    beacon.visible = false;
    beaconRing.visible = false;
  }
}

function phone(text, delay) {
  emit('phone', { from: 'DARIO', text, delay: delay || 0 });
}

export function initMissions(scene) {
  makeBeacon(scene);
  G.objective = { name: '', text: '', sub: '', pos: null };
  on('enteredCar', (data) => {
    // Stealing a story car advances its mission the moment Mara is inside.
    if (G.missionIndex === 1 && G.missionStage === 0 && data.car.storyCar === 'falcon') {
      setWanted(3);
      phone('That is the one. Now lose them — go quiet, break line of sight, and wait the heat out.', 0.5);
      G.missionStage = 1;
      setObjective('Getaway', 'Lose the cops', 'Stay out of sight until the wanted level clears', null);
    }
    if (G.missionIndex === 4 && G.missionStage === 0 && data.car.storyCar === 'aurora') {
      setWanted(4);
      phone('FOUR stars, Mara. The whole city is coming. Lose them, then bring my car home.', 0.5);
      G.missionStage = 1;
      setObjective('The Big Score', 'Lose the cops', 'Break away and stay hidden until the heat dies', null);
    }
  });
}

export function startMission(index) {
  const mission = MISSIONS[index];
  if (!mission) {
    // Story finished: free roam.
    G.storyDone = true;
    G.missionIndex = 5;
    setObjective('Free Roam', 'Solmarina is yours', 'Steal cars, find pickups, stay ahead of the sirens', null);
    return;
  }
  G.missionIndex = index;
  G.missionStage = 0;
  G.missionTimer = -1;
  G.missionInteract = null;
  pierAlerted = false;
  collectedShops = 0;
  guardsSpawnedFor = -1;
  mission.briefing.forEach((text, i) => phone(text, 0.4 + i * 3.2));
  applyStage();
}

function applyStage() {
  const loc = G.city.locations;
  const i = G.missionIndex;
  const s = G.missionStage;
  G.missionInteract = null;
  if (i === 0 && s === 0) {
    setObjective('First Fare', 'Pick up the package at the warehouse', 'West side, by the crates', loc.warehouse);
  } else if (i === 0 && s === 1) {
    G.missionTimer = 100;
    setObjective('First Fare', 'Deliver the package to the Marisol Hotel', 'East side — beat the clock', loc.hotel);
  } else if (i === 1 && s === 0) {
    setObjective('Getaway', 'Steal the red Falcon GT', 'Parked on the east road — take it', liveCarPos('falcon'));
  } else if (i === 1 && s === 1) {
    setObjective('Getaway', 'Lose the cops', 'Stay out of sight until the wanted level clears', null);
  } else if (i === 2 && s === 0) {
    setObjective('The Drop', 'Collect the drop from Dario\'s garage', 'North-west corner of the city', loc.garage);
  } else if (i === 2 && s === 1) {
    setObjective('The Drop', 'Take the drop to the end of the pier', 'Watch for patrols near the water', loc.pierEnd);
  } else if (i === 3) {
    const shop = loc.shops[s];
    if (shop) {
      setObjective('Shakedown', 'Collect from ' + shop.name, 'Shop ' + (s + 1) + ' of 3 — press E at the door', shop);
      G.missionInteract = {
        x: shop.x, z: shop.z, radius: 5, text: 'Collect from ' + shop.name,
        run: () => collectShop(s),
      };
    }
  } else if (i === 4 && s === 0) {
    setObjective('The Big Score', 'Steal the Aurora S from the marina', 'Teal supercar on the marina lot', liveCarPos('aurora'));
  } else if (i === 4 && s === 1) {
    setObjective('The Big Score', 'Lose the cops', 'Four stars — break away and stay hidden', null);
  } else if (i === 4 && s === 2) {
    setObjective('The Big Score', 'Deliver the Aurora to Dario\'s garage', 'Bring it home in one piece', loc.garage);
  }
}

function liveCarPos(storyKey) {
  for (const car of G.cars) {
    if (car.storyCar === storyKey) return { x: car.mesh.position.x, z: car.mesh.position.z };
  }
  return G.city.locations.falconSpot;
}

function collectShop(stage) {
  const shop = G.city.locations.shops[stage];
  collectedShops++;
  G.cash += 60;
  emit('toast', { text: '+$60 collected from ' + shop.name });
  if (G.audio) G.audio.buyBlip();
  // The shop's guards object — two per shop, once each.
  if (guardsSpawnedFor !== stage) {
    guardsSpawnedFor = stage;
    spawnGuard(G.scene, shop.x + 4, shop.z + 3, {});
    spawnGuard(G.scene, shop.x - 4, shop.z - 3, {});
    phone('They sent guards? Handle it, Mara. Then the next shop.', 0.5);
  }
  if (collectedShops >= 3) {
    completeMission();
  } else {
    G.missionStage = stage + 1;
    applyStage();
  }
}

function completeMission() {
  const mission = MISSIONS[G.missionIndex];
  G.cash += mission.reward;
  G.missionsDone++;
  G.stats.missionsDone++;
  emit('announce', { text: 'MISSION COMPLETE', sub: mission.name + '  ·  +$' + mission.reward });
  if (G.audio) G.audio.missionJingle();
  emit('saveGame', {});
  const next = G.missionIndex + 1;
  if (next >= MISSIONS.length) {
    G.storyDone = true;
    G.missionIndex = 5;
    G.missionCooldown = 2.5;
    setObjective('Free Roam', 'Solmarina is yours', 'Keep driving — the city never sleeps', null);
    emit('storyComplete', {});
  } else {
    G.missionIndex = next;
    G.missionCooldown = 4;
    setObjective(mission.name, 'Job done — awaiting Dario\'s next call…', '', null);
  }
}

function failMission(reason) {
  emit('announce', { text: 'JOB FAILED', sub: reason });
  if (G.audio) G.audio.failSting();
  phone('That was sloppy, Mara. Do it again — and do it right this time.', 1);
  G.missionStage = 0;
  G.missionTimer = -1;
  applyStage();
}

// Jump straight to a mission stage without briefings. Used by the
// screenshot presets to stage a mid-story moment through the real systems.
export function debugSetMission(index, stage) {
  G.missionIndex = index;
  G.missionStage = stage;
  G.missionTimer = -1;
  G.missionCooldown = 0;
  G.missionInteract = null;
  pierAlerted = index === 2 && stage === 1;
  collectedShops = index === 3 ? stage : 0;
  guardsSpawnedFor = -1;
  applyStage();
}

export function restartCurrentMission() {  // After a bust: the current job resets to its first stage, guards gone.
  for (const guard of [...G.guards]) {
    G.scene.remove(guard.fig.group);
  }
  G.guards.length = 0;
  if (G.missionIndex < MISSIONS.length) {
    G.missionStage = 0;
    G.missionTimer = -1;
    applyStage();
  }
}

export function updateMissions(dt) {
  // Beacon pulse.
  if (beacon && beacon.visible) {
    const pulse = 1 + Math.sin(G.time * 3) * 0.08;
    beacon.scale.set(pulse, 1, pulse);
    beaconRing.scale.setScalar(pulse);
    beacon.material.opacity = 0.24 + Math.sin(G.time * 3) * 0.06;
  }

  if (G.mode !== 'playing') return;

  // Delayed briefing for the next mission.
  if (G.missionCooldown > 0) {
    G.missionCooldown -= dt;
    if (G.missionCooldown <= 0 && G.missionIndex < MISSIONS.length) {
      startMission(G.missionIndex);
    }
    return;
  }
  if (G.storyDone || G.missionIndex >= MISSIONS.length) return;

  const player = G.player;
  if (!player) return;
  const pos = player.position();
  const loc = G.city.locations;
  const i = G.missionIndex;
  const s = G.missionStage;

  // Mission timer (First Fare delivery leg).
  if (G.missionTimer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) {
      G.missionTimer = -1;
      failMission('Too slow — the buyer walked away.');
      return;
    }
  }

  // Story-car markers follow the car.
  if ((i === 1 && s === 0) || (i === 4 && s === 0)) {
    const target = liveCarPos(i === 1 ? 'falcon' : 'aurora');
    if (G.objectivePos) {
      G.objectivePos.x = target.x;
      G.objectivePos.z = target.z;
      beacon.position.x = target.x;
      beacon.position.z = target.z;
      beaconRing.position.x = target.x;
      beaconRing.position.z = target.z;
    }
    // Already driving the target car when the mission starts: advance.
    if (player.inCar && player.car && player.car.storyCar === (i === 1 ? 'falcon' : 'aurora')) {
      if (i === 1) {
        setWanted(3);
        G.missionStage = 1;
        setObjective('Getaway', 'Lose the cops', 'Stay out of sight until the wanted level clears', null);
      } else {
        setWanted(4);
        G.missionStage = 1;
        setObjective('The Big Score', 'Lose the cops', 'Break away and stay hidden until the heat dies', null);
      }
    }
    return;
  }

  // Lose-the-cops stages complete when the heat hits zero.
  if ((i === 1 && s === 1) || (i === 4 && s === 1)) {
    if (G.wanted === 0) {
      if (i === 1) {
        completeMission();
      } else {
        G.missionStage = 2;
        phone('Clean. Now bring the Aurora to my garage — and try not to scratch it.', 0.5);
        applyStage();
      }
    }
    return;
  }

  // Arrival stages.
  function arrived(target, radius) {
    return dist2(pos.x, pos.z, target.x, target.z) < radius;
  }
  if (i === 0 && s === 0 && arrived(loc.warehouse, 7)) {
    emit('toast', { text: 'PACKAGE COLLECTED' });
    if (G.audio) G.audio.pickup();
    G.missionStage = 1;
    applyStage();
  } else if (i === 0 && s === 1 && arrived(loc.hotel, 8)) {
    completeMission();
  } else if (i === 2 && s === 0 && arrived(loc.garage, 7)) {
    emit('toast', { text: 'DROP COLLECTED' });
    if (G.audio) G.audio.pickup();
    G.missionStage = 1;
    applyStage();
  } else if (i === 2 && s === 1) {
    if (!pierAlerted && dist2(pos.x, pos.z, loc.pierEnd.x, loc.pierEnd.z) < 70) {
      pierAlerted = true;
      setWanted(Math.max(G.wanted, 2));
      phone('Patrols on the pier road — they made you. Finish the run anyway.', 0.3);
    }
    if (arrived(loc.pierEnd, 7)) completeMission();
  } else if (i === 4 && s === 2) {
    if (player.inCar && player.car && player.car.storyCar === 'aurora' && arrived(loc.garage, 9)) {
      completeMission();
    } else if (arrived(loc.garage, 9) && !(player.inCar && player.car && player.car.storyCar === 'aurora')) {
      // At the garage without the car: remind, don't complete.
      if (!updateMissions.reminded || G.time - updateMissions.reminded > 8) {
        updateMissions.reminded = G.time;
        phone('Where is the car, Mara? Bring the Aurora itself to my garage.', 0.2);
      }
    }
  }
}
