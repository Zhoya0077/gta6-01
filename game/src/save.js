// Saving Solmarina: the player's cash, health, ammo, story progress,
// position and lifetime stats persist in localStorage, so Continue on the
// menu picks up where the last session left off. Missions always resume
// at the start of their current stage.

import { G } from './state.js';

const SAVE_KEY = 'solmarina-save-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
}

export function saveGame() {
  try {
    const player = G.player;
    const pos = player ? player.position() : { x: 0, z: 0 };
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: Math.round(G.cash),
      health: Math.round(G.health),
      ammo: G.ammo,
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      storyDone: G.storyDone,
      x: Math.round(pos.x * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
      heading: player ? player.heading : Math.PI,
      clockHours: G.clockHours,
      stats: { ...G.stats },
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) { /* storage unavailable */ }
}

export function applySave(data) {
  G.cash = data.cash;
  G.health = Math.max(1, Math.min(G.maxHealth, data.health));
  G.ammo = Math.min(G.maxAmmo, Math.max(0, data.ammo));
  G.missionIndex = data.missionIndex;
  G.missionsDone = data.missionsDone;
  G.storyDone = !!data.storyDone;
  G.missionStage = 0;
  G.missionTimer = -1;
  G.wanted = 0;
  G.clockHours = data.clockHours || 17.5;
  if (data.stats) G.stats = { ...G.stats, ...data.stats };
  if (G.player) {
    G.player.teleport(data.x, data.z, data.heading);
  }
  G.cameraYaw = data.heading;
}
