// Central game state for Solmarina: one shared object every system reads
// and writes, plus a tiny event bus so systems can react to each other
// (crimes, pickups, mission events) without import cycles.

export const WORLD_HALF = 275; // playable area is a square, +/- this, in units
export const SHORE_X = 262; // east of this is water, except the pier corridor
export const PIER_Z_MIN = 24;
export const PIER_Z_MAX = 36;

// Road centre lines: a regular grid, 60 units apart, roads 12 wide.
export const ROAD_LINES = [-210, -150, -90, -30, 30, 90, 150, 210];
export const ROAD_WIDTH = 12;
export const BLOCK_PITCH = 60;

export const G = {
  renderer: null,
  scene: null,
  camera: null,
  mode: 'menu', // menu | playing | paused | busted | complete
  time: 0,
  clockHours: 17.5, // golden hour at the start of a new game
  seed: 1337,
  rng: Math.random,

  // World + systems, filled in by main.js during boot.
  city: null,
  player: null,
  input: null,
  audio: null,

  // Dynamic entities.
  cars: [], // every car in the world: parked, traffic, police, player-driven
  peds: [],
  officers: [],
  guards: [],
  pickups: [],
  interactZones: [],

  // Player resources and heat.
  cash: 120,
  health: 100,
  maxHealth: 100,
  ammo: 24,
  maxAmmo: 48,
  wanted: 0,
  evadeTimer: 0,
  crimeCooldown: 0,

  // Story progress.
  missionIndex: 0, // 0..4, or 5 when the story is finished
  missionStage: 0,
  missionTimer: -1, // seconds left, or -1 when the mission has no timer
  missionsDone: 0,
  storyDone: false,
  missionCooldown: 0, // delay before the next mission briefing arrives

  // Lifetime stats, shown on the busted / complete screens.
  stats: { carsStolen: 0, distanceKm: 0, crimes: 0, missionsDone: 0, busted: 0 },

  // Third-person camera state.
  cameraYaw: Math.PI,
  cameraPitch: 0.34,
  cameraDist: 7.5,
  cameraTargetYaw: Math.PI,

  // Objective marker (mission beacon) and its minimap blip.
  beacon: null,
  objectivePos: null,

  // Screenshot mode (?shot=...): the game auto-plays a staged scene.
  shotMode: null,
  shotFrames: 0,
  shotReady: false,

  muted: false,
  hintTimer: 0,
};

// --- Tiny event bus -------------------------------------------------------

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

// The bus rides on the singleton too, so the debug handle
// (window.__GAME__) can drive systems from the console.
G.on = on;
G.emit = emit;

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
  G.objectivePos = null;
}
