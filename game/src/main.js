// Solmarina boot and main loop: renderer, world assembly, camera,
// screens, and the frame that drives every system. The menu orbits the
// city; the game chases Mara with a damped third-person camera whose
// field of view widens with speed and shakes with every hard hit.

import * as THREE from 'three';
import { G, on, emit, resetState } from './state.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { spawnTraffic, spawnParked, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { initCombat, updateCombat, nearestShop, tryShop } from './combat.js';
import { initPolice, updatePolice, setWanted, clearPolice, addWanted } from './police.js';
import { initMissions, updateMissions, startMission } from './missions.js';
import { initHud, updateHud, showToast, setPrompt, showScreen, fadeBlack, setBustedStats, setCompleteStats, setObjective } from './hud.js';
import { drawMinimap } from './minimap.js';
import { applyShotPreset, shotFrameTarget } from './shots.js';
import { hasSave, saveGame, loadSave, applySave, maybeAutosave } from './save.js';
import { createCar } from './vehicles.js';
import { clamp, damp, angleDamp, formatMoney } from './util.js';
import { makeRng } from './util.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = parseInt(params.get('seed') || '1', 10);
G.seed = Number.isFinite(seedParam) ? 1337 + seedParam : 1337;

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.renderer = renderer;
G.scene = scene;
G.camera = camera;

const rng = makeRng(G.seed);
G.rng = rng.next;
G.city = buildCity(scene, G.seed);
G.input = new Input();
G.input.attach(renderer.domElement);
G.audio = new AudioSys();
G.player = new Player(scene);

// Story cars, placed before the systems that reference them.
const falcon = createCar('falcon', 155, -150, Math.PI / 2, { driver: 'parked', storyCar: 'falcon' });
scene.add(falcon.mesh);
G.cars.push(falcon);
const aurora = createCar('aurora', 210, -180, 0, { driver: 'parked', storyCar: 'aurora' });
scene.add(aurora.mesh);
G.cars.push(aurora);

spawnTraffic(scene, 14, rng.next);
spawnParked(scene, 22, rng.next, G.city);
spawnPeds(scene, 34, G.seed, G.city);
initCombat(scene, G.city);
initPolice(scene);
initMissions(scene);
initHud();

const minimapCanvas = document.getElementById('minimap');
let lastDragTime = -99;
let baseFov = 62;
let menuAngle = 0;

// --- Screens and buttons ---------------------------------------------------
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const btnMute = document.getElementById('btn-mute');
const btnQuit = document.getElementById('btn-quit-menu');
const btnRespawn = document.getElementById('btn-busted-respawn');
const btnFreeRoam = document.getElementById('btn-continue-playing');

function refreshMenu() {
  btnContinue.disabled = !hasSave();
  btnContinue.textContent = hasSave() ? 'CONTINUE' : 'CONTINUE — NO SAVE YET';
}

function beginPlay(fresh) {
  G.audio.ensure();
  if (fresh) {
    resetState();
    for (const car of G.cars) {
      car.health = car.maxHealth;
      car.speed = 0;
    }
    for (const guard of G.guards) {
      guard.down = false;
      guard.health = 100;
      guard.alerted = false;
      guard.fig.group.rotation.x = 0;
      guard.fig.group.position.set(guard.post.x, 0, guard.post.z);
    }
    for (const pickup of G.pickups) {
      pickup.taken = false;
      pickup.mesh.visible = true;
    }
    clearPolice();
    setWanted(0);
    G.player.teleport(-30, 30, Math.PI);
    falcon.mesh.position.set(155, 0, -150);
    falcon.heading = Math.PI / 2;
    falcon.driver = 'parked';
    aurora.mesh.position.set(210, 0, -180);
    aurora.heading = 0;
    aurora.driver = 'parked';
    G.city.setTimeOfDay('dusk');
    G.clockHours = 17.5;
  }
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
  G.hintTimer = 0;
  if (fresh) {
    // Start the first briefing directly: the between-jobs cooldown path
    // only fires when no briefing has ever been sent this session.
    startMission(0);
  }
}

function beginContinue() {
  const data = loadSave();
  G.audio.ensure();
  resetState();
  clearPolice();
  setWanted(0);
  if (data) applySave(data);
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
  if (G.storyDone) {
    setObjective('Free Roam', 'Solmarina is yours — drive, earn, stay ahead.', '');
  } else {
    startMission(G.missionIndex);
  }
  showToast('Save loaded. Welcome back to Solmarina.');
}

btnNew.addEventListener('click', () => { G.audio.ensure(); G.audio.click(); beginPlay(true); });
btnContinue.addEventListener('click', () => { G.audio.ensure(); G.audio.click(); beginContinue(); });
btnResume.addEventListener('click', () => { G.audio.click(); resumeGame(); });
btnMute.addEventListener('click', () => {
  G.muted = !G.muted;
  G.audio.setMuted(G.muted);
  btnMute.textContent = G.muted ? 'SOUND: OFF' : 'SOUND: ON';
});
btnQuit.addEventListener('click', () => {
  saveGame();
  G.mode = 'menu';
  refreshMenu();
  showScreen('menu');
  document.getElementById('hud').classList.remove('on');
});
btnRespawn.addEventListener('click', () => {
  G.audio.click();
  respawnAfterBust();
});
btnFreeRoam.addEventListener('click', () => {
  G.audio.click();
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
});

function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  saveGame();
  showScreen('pause');
  document.getElementById('hud').classList.remove('on');
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
}

function respawnAfterBust() {
  if (G.player.inCar) G.player.exitCar(true);
  G.health = G.maxHealth;
  G.player.teleport(-32, 116, Math.PI);
  G.cameraYaw = Math.PI;
  G.cameraTargetYaw = Math.PI;
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
  showToast('Back on the street. The clinic sends its bill separately.');
}

on('busted', () => {
  if (G.mode !== 'playing') return;
  const fine = Math.floor(G.cash * 0.2);
  G.cash -= fine;
  G.stats.busted++;
  G.mode = 'busted';
  clearPolice();
  setWanted(0);
  if (G.audio) G.audio.busted();
  saveGame();
  setBustedStats(
    'Fine paid: <b>$' + formatMoney(fine) + '</b> &nbsp;•&nbsp; Cash left: <b>$' + formatMoney(G.cash) + '</b><br>' +
    'Jobs done: <b>' + G.missionsDone + ' / 5</b> &nbsp;•&nbsp; Times busted: <b>' + G.stats.busted + '</b>',
  );
  showScreen('busted');
  document.getElementById('hud').classList.remove('on');
});

on('playerDown', () => {
  if (G.mode !== 'playing') return;
  emit('busted', { reason: 'down' });
});

on('storyComplete', () => {
  if (G.mode !== 'playing') return;
  G.mode = 'complete';
  setCompleteStats(
    'Final cash: <b>$' + formatMoney(G.cash) + '</b> &nbsp;•&nbsp; Cars stolen: <b>' + G.stats.carsStolen + '</b><br>' +
    'Distance driven: <b>' + G.stats.distanceKm.toFixed(1) + ' km</b> &nbsp;•&nbsp; Times busted: <b>' + G.stats.busted + '</b>',
  );
  showScreen('complete');
  document.getElementById('hud').classList.remove('on');
  saveGame();
});

on('carStolen', () => {
  // Stealing in sight of the law draws heat immediately.
  const p = G.player.pos();
  let seen = false;
  for (const car of G.cars) {
    if (car.driver === 'police' && Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z) < 45) seen = true;
  }
  for (const o of G.officers) {
    if (Math.hypot(o.fig.group.position.x - p.x, o.fig.group.position.z - p.z) < 40) seen = true;
  }
  if (seen) {
    G.lastCrimePos = { ...p };
    G.lastCrimeTime = G.time;
    addWanted(1);
  }
});

// --- Camera ----------------------------------------------------------------
function updateCamera(dt) {
  if (G.mode === 'menu') {
    menuAngle += dt * 0.045;
    const cx = Math.sin(menuAngle) * 95;
    const cz = Math.cos(menuAngle) * 95;
    camera.position.set(cx, 34, cz);
    camera.lookAt(0, 6, 0);
    if (Math.abs(camera.fov - 55) > 0.1) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const look = G.input.takeLook();
  if (look.yaw !== 0 || look.pitch !== 0) {
    lastDragTime = G.time;
    G.cameraYaw -= look.yaw * 0.0052;
    G.cameraPitch = clamp(G.cameraPitch + look.pitch * 0.0032, 0.08, 1.05);
  }
  const driving = !!G.player.inCar;
  if (driving && G.time - lastDragTime > 2.5) {
    G.cameraYaw = angleDamp(G.cameraYaw, G.cameraTargetYaw, 1.1, dt);
  }
  const head = G.player.headPos();
  const target = new THREE.Vector3(head.x, head.y + 0.6, head.z);
  const dist = driving ? 8.6 : 7.5;
  G.cameraDist = damp(G.cameraDist, dist, 4, dt);
  const cp = Math.cos(G.cameraPitch);
  const sp = Math.sin(G.cameraPitch);
  G.cameraShake = damp(G.cameraShake, 0, 4.5, dt);
  const shake = G.cameraShake;
  const sx = (Math.random() - 0.5) * shake * 0.5;
  const sy = (Math.random() - 0.5) * shake * 0.4;
  camera.position.set(
    target.x + Math.sin(G.cameraYaw) * cp * G.cameraDist + sx,
    target.y + sp * G.cameraDist + sy,
    target.z + Math.cos(G.cameraYaw) * cp * G.cameraDist,
  );
  // Never let the camera sink under the street.
  if (camera.position.y < 1.1) camera.position.y = 1.1;
  const lookAhead = driving ? 3.2 : 1.4;
  const fwd = G.player.inCar ? G.player.inCar.heading : G.player.heading;
  camera.lookAt(
    target.x + Math.sin(fwd) * lookAhead * 0.3,
    target.y - 0.4,
    target.z + Math.cos(fwd) * lookAhead * 0.3,
  );
  const wantFov = baseFov + G.fovKick;
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov = damp(camera.fov, wantFov, 5, dt);
    camera.updateProjectionMatrix();
  }
}

function updatePrompt() {
  if (G.mode !== 'playing') {
    setPrompt(null);
    return;
  }
  if (G.player.inCar) {
    setPrompt('Leave the car');
    return;
  }
  const car = G.player.nearestCar(4.5);
  if (car) {
    setPrompt((car.driver === 'parked' ? 'Steal the ' : 'Take the ') + car.def.name);
    return;
  }
  const shop = nearestShop(7);
  if (shop) {
    setPrompt(shop.kind === 'guns' ? 'Harbor Guns — buy ammo ($40)' : shop.kind === 'market' ? 'Marina Market — supplies ($30)' : 'Coastal Clinic — get patched up');
    return;
  }
  setPrompt(null);
}

function handleInteract() {
  if (G.input.consume('KeyE')) {
    if (G.player.inCar) {
      G.player.exitCar(false);
      return;
    }
    const car = G.player.nearestCar(4.5);
    if (car) {
      G.player.enterCar(car);
      return;
    }
    const result = tryShop();
    if (result) showToast(result.msg);
  }
  if (G.input.consume('KeyM')) {
    G.muted = !G.muted;
    G.audio.setMuted(G.muted);
    showToast(G.muted ? 'Sound off.' : 'Sound on.');
  }
  if (G.input.consume('KeyP') || G.input.consume('Escape')) {
    if (G.mode === 'playing') pauseGame();
    else if (G.mode === 'paused') resumeGame();
  }
}

function updateLighting() {
  if (shotName || G.missionIndex === 3) return;
  const h = ((G.clockHours % 24) + 24) % 24;
  const want = h < 6 || h >= 20 ? 'night' : h < 17 ? 'day' : 'dusk';
  if (want !== G.city.timeMode) G.city.setTimeOfDay(want);
}

// --- Shot mode ---------------------------------------------------------------
if (shotName) {
  resetState();
  G.mode = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.add('on');
  // Briefings are skipped in shot mode; the preset stages the objective.
  applyShotPreset(shotName);
} else {
  refreshMenu();
  showScreen('menu');
}

// Debug handle for the capture harness and curious players.
window.__GAME__ = {
  G,
  startMission,
  setWanted,
  teleport: (x, z, h) => G.player.teleport(x, z, h),
  version: 'solmarina-rebuild-1',
};

document.getElementById('loading').classList.add('done');
fadeBlack(false);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  G.time += dt;

  if (G.mode === 'playing') {
    G.clockHours += dt / 180;
    const drive = G.player.update(dt, G.input);
    updateTraffic(dt, G.city);
    updatePeds(dt, G.city, rng.next);
    updatePolice(dt);
    updateCombat(dt, G.input);
    updateMissions(dt);
    handleInteract();
    updatePrompt();
    updateLighting();
    maybeAutosave(dt);
    if (G.audio) G.audio.update(drive.speed, drive.driving, G.wanted, drive.slipping);
    updateHud(dt);
    drawMinimap(minimapCanvas);
    if (shotName && !G.shotReady) {
      G.shotFrames++;
      if (G.shotFrames >= shotFrameTarget(shotName)) {
        G.shotReady = true;
        window.__SHOT_READY__ = true;
      }
    }
  } else if (G.mode === 'paused') {
    if (G.input.consume('KeyP') || G.input.consume('Escape')) resumeGame();
  } else if (G.mode === 'menu') {
    updateTraffic(dt * 0.4, G.city);
    updatePeds(dt * 0.4, G.city, rng.next);
  }
  G.city.update(dt, G.time);
  updateCamera(dt);
  G.input.endFrame();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
