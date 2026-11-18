// localStorage saves: cash, health, ammo, story progress, stats and the
// player's last position. Wanted level is never saved — a fresh session
// always starts clean, the way a new morning in the city should.

import { G } from './state.js';

const KEY = 'solmarina-save-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function saveGame() {
  try {
    const p = G.player ? G.player.pos() : { x: -30, z: 30 };
    const data = {
      v: 1,
      cash: G.cash,
      health: G.health,
      ammo: G.ammo,
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      storyDone: G.storyDone,
      stats: G.stats,
      clockHours: G.clockHours,
      x: p.x,
      z: p.z,
      heading: G.player ? G.player.heading : Math.PI,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(data) {
  G.cash = data.cash ?? 120;
  G.health = data.health ?? 100;
  G.ammo = data.ammo ?? 24;
  G.missionIndex = data.missionIndex ?? 0;
  G.missionsDone = data.missionsDone ?? 0;
  G.storyDone = !!data.storyDone;
  G.stats = data.stats || G.stats;
  G.clockHours = data.clockHours ?? 17.5;
  G.wanted = 0;
  if (G.player) G.player.teleport(data.x ?? -30, data.z ?? 30, data.heading ?? Math.PI);
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* private mode: nothing to clear */ }
}

// Save quietly every 20 seconds while playing, plus on pause and busted,
// so a closed tab never costs more than a short drive.
export function maybeAutosave(dt) {
  maybeAutosave._t = (maybeAutosave._t || 0) + dt;
  if (maybeAutosave._t > 20) {
    maybeAutosave._t = 0;
    saveGame();
  }
}
