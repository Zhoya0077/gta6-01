// Solmarina shared state: one object every system reads and writes, plus
// a small event bus so crimes, pickups and mission beats can cross between
// systems without import cycles.

export const WORLD_HALF = 275;
export const SHORE_X = 262;
export const PIER_Z_MIN = 24;
export const PIER_Z_MAX = 36;
export const ROAD_LINES = [-210, -150, -90, -30, 30, 90, 150, 210];
export const ROAD_WIDTH = 12;
export const BLOCK_PITCH = 60;

export const G = {
  renderer: null,
  scene: null,
  camera: null,
  mode: 'menu',
  time: 0,
  clockHours: 17.5,
  seed: 1337,
  rng: Math.random,
  city: null,
  player: null,
  input: null,
  audio: null,
  cars: [],
  peds: [],
  officers: [],
  guards: [],
  pickups: [],
  interactZones: [],
  cash: 120,
  health: 100,
  maxHealth: 100,
  ammo: 24,
  maxAmmo: 48,
  wanted: 0,
  evadeTimer: 0,
  crimeCooldown: 0,
  missionIndex: 0,
  missionStage: 0,
  missionTimer: -1,
  missionsDone: 0,
  storyDone: false,
  missionCooldown: 0,
  stats: { carsStolen: 0, distanceKm: 0, crimes: 0, missionsDone: 0, busted: 0 },
  cameraYaw: Math.PI,
  cameraPitch: 0.34,
  cameraDist: 7.5,
  cameraTargetYaw: Math.PI,
  cameraShake: 0,
  fovKick: 0,
  beacon: null,
  objectivePos: null,
  objectiveLabel: '',
  shotMode: null,
  shotFrames: 0,
  shotReady: false,
  muted: false,
  hintTimer: 0,
  lastCrimePos: null,
  lastCrimeTime: -99,
  passenger: null,
  packageCarried: false,
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
}

export function emit(event, data) {
  const list = listeners.get(event);
  if (!list) return;
  for (const fn of list) fn(data);
}

G.on = on;
G.emit = emit;

export function addShake(amount) {
  G.cameraShake = Math.min(0.6, G.cameraShake + amount);
}

// Daylight factor 0..1 derived from the clock, so lighting and the HUD
// clock always agree. Night is 20:00-06:00, dusk peaks near 17:30.
export function daylightFactor() {
  const h = ((G.clockHours % 24) + 24) % 24;
  if (h >= 6 && h < 17) return 1;
  if (h >= 17 && h < 20) return 1 - (h - 17) / 3;
  if (h >= 20 || h < 5) return 0;
  return (h - 5) / 1;
}

export function resetState() {
  G.time = 0;
  G.clockHours = 17.5;
  G.cash = 120;
  G.health = G.maxHealth;
  G.ammo = 24;
  G.wanted = 0;
  G.evadeTimer = 0;
  G.crimeCooldown = 0;
  G.missionIndex = 0;
  G.missionStage = 0;
  G.missionTimer = -1;
  G.missionsDone = 0;
  G.storyDone = false;
  G.missionCooldown = 0;
  G.stats = { carsStolen: 0, distanceKm: 0, crimes: 0, missionsDone: 0, busted: 0 };
  G.cameraYaw = Math.PI;
  G.cameraPitch = 0.34;
  G.cameraTargetYaw = Math.PI;
  G.cameraShake = 0;
  G.fovKick = 0;
  G.objectivePos = null;
  G.objectiveLabel = '';
  G.lastCrimePos = null;
  G.passenger = null;
  G.packageCarried = false;
}
