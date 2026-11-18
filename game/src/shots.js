// Screenshot staging: the ?shot= presets drive the real game systems
// (missions, wanted level, police, driving) into photogenic states, so
// captured images are honest renders of gameplay. After a set number of
// rendered frames the page sets window.__SHOT_READY__ for the capture.

import { G } from './state.js';
import { setWanted, forceSpawnPolice } from './police.js';
import { debugSetMission } from './missions.js';

const FRAME_TARGETS = { chase: 45, street: 15, mission: 20, night: 45 };

export function shotFrameTarget(name) {
  return FRAME_TARGETS[name] || 15;
}

function findStoryCar(key) {
  return G.cars.find((c) => c.storyCar === key) || null;
}

function findParkedCar() {
  return G.cars.find((c) => c.driver === 'parked' && !c.storyCar) || G.cars[0];
}

export function applyShotPreset(name) {
  const player = G.player;
  const city = G.city;

  if (name === 'chase') {
    city.setTimeOfDay('dusk');
    const falcon = findStoryCar('falcon');
    falcon.mesh.position.set(-30, 0, 40);
    falcon.heading = 0;
    falcon.speed = 0;
    falcon.mesh.rotation.y = 0;
    player.teleport(-30, 40, 0);
    player.enterCar(falcon);
    falcon.speed = 17;
    debugSetMission(1, 1);
    setWanted(3);
    forceSpawnPolice(2, 0, [
      { x: -27.2, z: 8, heading: 0, speed: 16 },
      { x: -34, z: 95, heading: 0, speed: 15 },
    ]);
    G.cameraYaw = 0;
    G.cameraPitch = 0.3;
    G.cameraDist = 8;
  } else if (name === 'street') {
    // On foot at a busy intersection, looking down the street: traffic
    // rolling toward camera, pedestrians on the corner, storefronts.
    city.setTimeOfDay('dusk');
    debugSetMission(0, 0);
    setWanted(0);
    player.teleport(-18, 36, 0);
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.3;
    G.cameraDist = 7;
    // Stage a taxi rolling down the road toward the camera and peds
    // waiting on the sidewalk corner ahead.
    const taxi = G.cars.find((c) => c.defKey === 'taxi' && c.driver === 'traffic');
    if (taxi) {
      taxi.mesh.position.set(-33, 0, 58);
      taxi.heading = Math.PI;
      taxi.speed = 10;
      if (taxi.traffic) {
        taxi.traffic.axis = 'z';
        taxi.traffic.dir = -1;
        taxi.traffic.line = -30;
      }
    }
    const pedSpots = [[-20, 46], [-16, 43], [-20, 51]];
    let moved = 0;
    for (const ped of G.peds) {
      if (moved >= 3) break;
      ped.fig.group.position.set(pedSpots[moved][0], 0, pedSpots[moved][1]);
      moved++;
    }
  } else if (name === 'mission') {
    // Mara approaches the contact from the south along the shore road,
    // so the frame holds the contact, the beacon, the pier and the city
    // edge together instead of empty sea. Camera behind Mara, looking
    // north toward the contact.
    city.setTimeOfDay('dusk');
    debugSetMission(2, 1);
    setWanted(0);
    player.teleport(269, 21, 0.245);
    G.cameraYaw = 0.245 + Math.PI;
    G.cameraPitch = 0.28;
    G.cameraDist = 7;
  } else if (name === 'night') {
    city.setTimeOfDay('night');
    debugSetMission(3, 0);
    const car = findParkedCar();
    car.mesh.position.set(30, 0, -70);
    car.heading = 0;
    car.speed = 0;
    car.mesh.rotation.y = 0;
    player.teleport(30, -70, 0);
    player.enterCar(car);
    car.speed = 13;
    setWanted(2);
    forceSpawnPolice(1, 0, [{ x: 30, z: -98, heading: 0, speed: 12 }]);
    G.cameraYaw = 0;
    G.cameraPitch = 0.3;
    G.cameraDist = 8;
  }

  G.shotMode = name;
  G.shotFrames = 0;
  G.shotReady = false;
  // Presets always start from a clean, readable HUD state.
  G.health = G.maxHealth;
  G.ammo = 24;
}
