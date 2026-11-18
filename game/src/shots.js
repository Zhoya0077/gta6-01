// Screenshot staging for Solmarina: the ?shot= presets drive the REAL game
// systems (missions, wanted level, police, driving) into photogenic states
// so the captured images are honest renders of gameplay. After a preset
// number of rendered frames the page sets window.__SHOT_READY__ so the
// capture script knows the scene has settled.

import { G } from './state.js';
import { setWanted, forceSpawnPolice } from './police.js';
import { debugSetMission } from './missions.js';

const FRAME_TARGETS = { chase: 45, street: 15, mission: 20, night: 45 };

export function shotFrameTarget(name) {
  return FRAME_TARGETS[name] || 15;
}

function findStoryCar(key) {
  for (const car of G.cars) {
    if (car.storyCar === key) return car;
  }
  return null;
}

function findParkedCar() {
  for (const car of G.cars) {
    if (car.driver === 'parked' && !car.storyCar) return car;
  }
  return G.cars[0];
}

export function applyShotPreset(name) {
  const player = G.player;
  const city = G.city;

  if (name === 'chase') {
    // Cover shot: Mara in the Falcon GT, three stars, two interceptors
    // closing in, mission objective on the HUD.
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
    // One interceptor chases from behind; a second runs alongside ahead
    // in the next lane, already rolling, so the pursuit is visible in
    // frame rather than only on the minimap.
    forceSpawnPolice(2, 0, [
      { x: -27.2, z: 8, heading: 0, speed: 16 },
      { x: -34, z: 95, heading: 0, speed: 15 },
    ]);
    G.cameraYaw = 0;
    G.cameraPitch = 0.3;
    G.cameraDist = 8;
  } else if (name === 'street') {
    // On foot at a busy intersection: traffic, pedestrians, storefronts.
    city.setTimeOfDay('dusk');
    debugSetMission(0, 0);
    setWanted(0);
    player.teleport(-37, 38, 2.36);
    G.cameraYaw = 2.36;
    G.cameraPitch = 0.32;
    G.cameraDist = 7;
    // Stage a taxi rolling through the intersection and peds on the corner.
    const taxi = G.cars.find((c) => c.defKey === 'taxi' && c.driver === 'traffic');
    if (taxi) {
      taxi.mesh.position.set(-30, 0, 90);
      taxi.heading = Math.PI;
      taxi.speed = 10;
      if (taxi.traffic) {
        taxi.traffic.axis = 'z';
        taxi.traffic.dir = -1;
        taxi.traffic.line = -30;
      }
    }
    let moved = 0;
    for (const ped of G.peds) {
      if (moved >= 3) break;
      ped.fig.group.position.set(-24 + moved * 3, 0, 24 - moved * 2);
      moved++;
    }
  } else if (name === 'mission') {
    // The pier drop: beacon glowing at the pier end, heat rising, an
    // officer closing in on foot.
    city.setTimeOfDay('dusk');
    debugSetMission(2, 1);
    setWanted(2);
    player.teleport(252, 30, 1.49);
    G.cameraYaw = 1.49;
    G.cameraPitch = 0.3;
    G.cameraDist = 7;
    // The officer patrols the pier ahead of Mara, in frame.
    forceSpawnPolice(0, 1, null, [{ x: 270, z: 30 }]);
  } else if (name === 'night') {
    // Night chase under the streetlamps: wanted, interceptor behind,
    // lit windows and the minimap glowing.
    city.setTimeOfDay('night');
    debugSetMission(3, 0);
    const car = findParkedCar();
    // A long clear run: the next intersection is 40 units ahead, so the
    // car is still rolling mid-block when the frame is captured.
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
}
