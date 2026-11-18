// SOLMARINA boot and main loop: renderer and scene setup, system wiring,
// the menu / playing / paused / busted / complete state machine, the
// busted-and-respawn flow, saving, and the screenshot staging hookup.

import * as THREE from 'three';
import { G, resetState, on, emit } from './state.js';
import { mulberry32, clamp } from './util.js';
import { buildCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { spawnParkedCars, driveCar, resolveCarCollisions } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { initPolice, updatePolice, clearPolice } from './police.js';
import { initMissions, startMission, updateMissions, restartCurrentMission } from './missions.js';
import { updateCombat, updateGuards, spawnPickups, updatePickups } from './combat.js';
import { initHud, updateHud, showHud, showScreen, hideLoading, setBustedStats, setCompleteStats, fadeBlack, resetHud } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { hasSave, saveGame, loadSave, applySave } from './save.js';
import { applyShotPreset, shotFrameTarget } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1337', 10) || 1337;

let saveTimer = 0;

function setupInteractZones() {
  G.interactZones = [
    {
      x: G.city.locations.clinic.x, z: G.city.locations.clinic.z, radius: 4.5,
      text: () => (G.health >= G.maxHealth ? 'Health already full' : 'Buy full health — $50'),
      run: () => {
        if (G.health >= G.maxHealth) return;
        if (G.cash < 50) {
          emit('toast', { text: 'Need $50 for treatment' });
          return;
        }
        G.cash -= 50;
        G.player.heal(G.maxHealth);
        if (G.audio) G.audio.buyBlip();
        emit('toast', { text: 'Patched up — health full' });
      },
    },
    {
      x: G.city.locations.gunShop.x, z: G.city.locations.gunShop.z, radius: 4.5,
      text: () => (G.ammo >= G.maxAmmo ? 'Ammo already full' : 'Refill pistol ammo — $30'),
      run: () => {
        if (G.ammo >= G.maxAmmo) return;
        if (G.cash < 30) {
          emit('toast', { text: 'Need $30 for ammo' });
          return;
        }
        G.cash -= 30;
        G.ammo = G.maxAmmo;
        if (G.audio) G.audio.buyBlip();
        emit('toast', { text: 'Ammo refilled' });
      },
    },
  ];
}

function resetWorldForNewGame() {
  clearPolice();
  for (const guard of [...G.guards]) G.scene.remove(guard.fig.group);
  G.guards.length = 0;
  // Every car goes back to a clean, drivable state; story cars return home.
  for (const car of G.cars) {
    car.health = car.maxHealth;
    car.speed = 0;
    if (car.driver === 'player') car.driver = 'parked';
    if (car.storyCar === 'falcon') {
      car.mesh.position.set(G.city.locations.falconSpot.x, 0, G.city.locations.falconSpot.z);
      car.heading = Math.PI / 2;
      car.driver = 'parked';
    }
    if (car.storyCar === 'aurora') {
      car.mesh.position.set(G.city.locations.auroraSpot.x, 0, G.city.locations.auroraSpot.z);
      car.heading = Math.PI;
      car.driver = 'parked';
    }
    car.mesh.rotation.y = car.heading;
  }
  const player = G.player;
  player.inCar = false;
  player.car = null;
  player.dead = false;
  player.fig.group.visible = true;
  player.teleport(G.city.locations.spawn.x, G.city.locations.spawn.z, Math.PI);
}

function startPlaying() {
  showHud(true);
  showScreen(null);
  hideLoading();
  G.mode = 'playing';
  G.audio.init();
  G.audio.startMusic();
}

function newGame() {
  resetState();
  resetWorldForNewGame();
  resetHud();
  startPlaying();
  startMission(0);
  emit('toast', { text: 'Welcome back to Solmarina, Mara' });
}

function continueGame() {
  const data = loadSave();
  if (!data) return;
  resetState();
  resetWorldForNewGame();
  resetHud();
  applySave(data);
  startPlaying();
  if (data.storyDone) {
    G.storyDone = true;
    G.missionIndex = 5;
    G.objective = { name: 'Free Roam', text: 'Solmarina is yours', sub: 'Keep driving — the city never sleeps', pos: null };
  } else {
    startMission(data.missionIndex);
  }
  emit('toast', { text: 'Welcome back, Mara' });
}

function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  showScreen('pause');
  if (G.audio) {
    G.audio.setEngine(false, 0);
    G.audio.setSiren(false);
  }
  saveGame();
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  showScreen(null);
}

function quitToMenu() {
  saveGame();
  G.mode = 'menu';
  showScreen('menu');
  showHud(false);
  if (G.audio) {
    G.audio.setEngine(false, 0);
    G.audio.setSiren(false);
  }
  refreshContinueButton();
}

function refreshContinueButton() {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.disabled = !hasSave();
}

function onBusted(data) {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  G.stats.busted++;
  const fine = Math.round(G.cash * 0.2);
  G.cash = Math.max(0, G.cash - fine);
  setBustedStats(
    'Fine paid: <b>$' + fine + '</b><br>' +
    'Cash left: <b>$' + Math.round(G.cash) + '</b> &nbsp;·&nbsp; ' +
    'Missions done: <b>' + G.missionsDone + ' / 5</b> &nbsp;·&nbsp; ' +
    'Cars stolen: <b>' + G.stats.carsStolen + '</b>',
  );
  showScreen('busted');
  showHud(false);
  if (G.audio) {
    G.audio.setEngine(false, 0);
    G.audio.setSiren(false);
    G.audio.failSting();
  }
  saveGame();
}

function respawnAfterBust() {
  fadeBlack(true);
  setTimeout(() => {
    const player = G.player;
    if (player.inCar) {
      const car = player.car;
      car.driver = 'parked';
      car.speed = 0;
      player.inCar = false;
      player.car = null;
      player.fig.group.visible = true;
    }
    player.dead = false;
    player.invulnTimer = 1;
    G.health = G.maxHealth;
    G.wanted = 0;
    clearPolice();
    restartCurrentMission();
    player.teleport(G.city.locations.clinic.x + 4, G.city.locations.clinic.z, Math.PI);
    G.cameraYaw = Math.PI;
    G.mode = 'playing';
    showScreen(null);
    showHud(true);
    fadeBlack(false);
    saveGame();
    emit('toast', { text: 'Back on the street — Dario is waiting' });
  }, 500);
}

function onStoryComplete() {
  setTimeout(() => {
    if (G.mode !== 'playing') return;
    G.mode = 'complete';
    setCompleteStats(
      'Final cash: <b>$' + Math.round(G.cash) + '</b> &nbsp;·&nbsp; ' +
      'Cars stolen: <b>' + G.stats.carsStolen + '</b> &nbsp;·&nbsp; ' +
      'Distance driven: <b>' + G.stats.distanceKm.toFixed(1) + ' km</b> &nbsp;·&nbsp; ' +
      'Times busted: <b>' + G.stats.busted + '</b>',
    );
    showScreen('complete');
    saveGame();
  }, 2400);
}

function wireMenu() {
  document.getElementById('btn-new').addEventListener('click', () => {
    G.audio.init();
    newGame();
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    G.audio.init();
    continueGame();
  });
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-quit-menu').addEventListener('click', quitToMenu);
  document.getElementById('btn-busted-respawn').addEventListener('click', respawnAfterBust);
  document.getElementById('btn-continue-playing').addEventListener('click', () => {
    G.mode = 'playing';
    showScreen(null);
  });
  const muteBtn = document.getElementById('btn-mute');
  muteBtn.addEventListener('click', () => toggleMute(muteBtn));
  refreshContinueButton();
}

function toggleMute(btn) {
  G.muted = !G.muted;
  G.audio.setMuted(G.muted);
  if (btn) btn.textContent = G.muted ? 'SOUND: OFF' : 'SOUND: ON';
}

function boot() {
  G.seed = SEED;
  G.rng = mulberry32(SEED);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(-60, 30, 60);
  G.camera = camera;

  G.city = buildCity(scene, SEED);
  G.input = createInput(renderer.domElement);
  G.audio = createAudio();
  G.player = createPlayer(scene);
  spawnParkedCars(scene, G.rng);
  spawnTraffic(scene, G.rng);
  spawnPedestrians(scene, G.rng);
  spawnPickups(scene);
  setupInteractZones();
  initPolice();
  initMissions(scene);
  initHud();
  initMinimap();
  wireMenu();

  on('busted', onBusted);
  on('storyComplete', onStoryComplete);
  on('saveGame', () => saveGame());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('beforeunload', () => {
    if (G.mode === 'playing') saveGame();
  });

  // Debug / verification handle for headless play-testing.
  window.__GAME__ = G;

  if (SHOT) {
    // Screenshot mode: skip the menu, stage the scene, report readiness.
    resetState();
    resetHud();
    G.mode = 'playing';
    showHud(true);
    showScreen(null);
    hideLoading();
    applyShotPreset(SHOT);
  } else {
    hideLoading();
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    tick(dt);
  });
}

function tick(dt) {
  const input = G.input;

  if (G.mode === 'menu') {
    // Slow orbit over the plaza behind the title screen.
    const t = G.time * 0.05;
    G.camera.position.set(Math.sin(t) * 70, 26, Math.cos(t) * 70);
    G.camera.lookAt(0, 4, 0);
    G.city.update(dt, G.time);
    G.time += dt;
    G.renderer.render(G.scene, G.camera);
    input.endFrame();
    return;
  }

  if (G.mode !== 'playing') {
    // Paused, busted or complete: frozen world, still rendered.
    G.renderer.render(G.scene, G.camera);
    input.endFrame();
    return;
  }

  G.time += dt;
  G.clockHours = (G.clockHours + dt / 120) % 24;

  // Global keys.
  if (input.wasPressed('pause') || input.wasPressed('escape')) {
    pauseGame();
    input.endFrame();
    G.renderer.render(G.scene, G.camera);
    return;
  }
  if (input.wasPressed('mute')) toggleMute(document.getElementById('btn-mute'));

  const player = G.player;

  // E-key interaction.
  if (input.wasPressed('interact')) {
    const interact = player.getInteract();
    if (interact) interact.run();
  }

  // Driving input feeds the car physics; on foot the player module moves.
  if (player.inCar && player.car) {
    const control = {
      throttle: (input.keys.has('up') ? 1 : 0) - (input.keys.has('down') ? 1 : 0),
      steer: (input.keys.has('left') ? 1 : 0) - (input.keys.has('right') ? 1 : 0),
      handbrake: input.keys.has('jump'),
    };
    driveCar(player.car, control, dt);
    G.stats.distanceKm += (Math.abs(player.car.speed) * dt) / 1000;
    if (G.audio) G.audio.setEngine(true, clamp(Math.abs(player.car.speed) / player.car.def.maxSpeed, 0, 1));
  } else if (G.audio) {
    G.audio.setEngine(false, 0);
  }

  player.update(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updatePolice(dt);
  updateGuards(dt);
  updateCombat(dt);
  updatePickups(dt);
  updateMissions(dt);
  resolveCarCollisions(dt);
  G.city.update(dt, G.time);

  updateHud(dt);
  drawMinimap();

  // Periodic autosave.
  saveTimer += dt;
  if (saveTimer > 20) {
    saveTimer = 0;
    saveGame();
  }

  // Screenshot readiness: after the preset's frame budget, signal the
  // capture script that the staged scene has settled.
  if (G.shotMode && !G.shotReady) {
    G.shotFrames++;
    if (G.shotFrames >= shotFrameTarget(G.shotMode)) {
      G.shotReady = true;
      window.__SHOT_READY__ = true;
    }
  }

  G.renderer.render(G.scene, G.camera);
  input.endFrame();
}

boot();
