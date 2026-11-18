// The heads-up display: cash, health, ammo, wanted stars, clock, mission
// objective, drive readout, prompts, phone messages, toasts and big
// announcements, plus the menu / pause / busted / complete screens.

import { G, on } from './state.js';
import { clamp, formatClock, formatMoney } from './util.js';
import { districtAt } from './city.js';

const el = {};
let lastStars = -1;
let lastCash = -1;
let lastAmmo = -1;
let lastObjective = '';
let toastTimer = 0;
let announceTimer = 0;
let flashTimer = 0;
let phoneQueue = [];
let hintShown = 0;

export function initHud() {
  const ids = [
    'hud', 'cash', 'health-fill', 'ammo', 'stars', 'clock', 'district',
    'mission-name', 'objective-text', 'objective-sub', 'mission-timer',
    'drive-box', 'speed', 'car-name', 'car-health-fill',
    'prompt', 'prompt-text', 'hint', 'phone', 'toast', 'toast-text',
    'announce', 'announce-sub', 'crosshair', 'damage-flash', 'fade-black',
    'menu', 'pause', 'busted', 'complete', 'busted-stats', 'complete-stats',
    'btn-new', 'btn-continue', 'btn-resume', 'btn-mute', 'btn-quit-menu',
    'btn-busted-respawn', 'btn-continue-playing', 'loading',
  ];
  for (const id of ids) el[id] = document.getElementById(id);

  on('toast', (data) => {
    el['toast-text'].textContent = data.text;
    el.toast.classList.add('on');
    toastTimer = 2.6;
  });
  on('announce', (data) => {
    el.announce.textContent = data.text;
    el['announce-sub'].textContent = data.sub || '';
    el.announce.classList.add('on');
    el['announce-sub'].classList.add('on');
    announceTimer = 3;
  });
  on('phone', (data) => {
    phoneQueue.push({ from: data.from, text: data.text, at: G.time + (data.delay || 0) });
    if (G.audio) G.audio.phoneBuzz();
  });
  on('playerDamaged', () => {
    flashTimer = 0.35;
    el['damage-flash'].style.opacity = '1';
  });
  on('wantedChanged', () => {
    lastStars = -1; // force a stars redraw
  });
}

export function showHud(show) {
  el.hud.classList.toggle('on', show);
}

export function showScreen(name) {
  for (const key of ['menu', 'pause', 'busted', 'complete']) {
    el[key].classList.toggle('on', key === name);
  }
}

export function hideLoading() {
  el.loading.classList.add('done');
}

export function setBustedStats(html) {
  el['busted-stats'].innerHTML = html;
}

export function setCompleteStats(html) {
  el['complete-stats'].innerHTML = html;
}

export function fadeBlack(onOff) {
  el['fade-black'].classList.toggle('on', onOff);
}

function renderStars() {
  if (G.wanted === lastStars) return;
  lastStars = G.wanted;
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += i < G.wanted ? '<span class="lit">★</span>' : '<span class="dim">★</span>';
  }
  el.stars.innerHTML = html;
}

function updatePhone(dt) {
  // Deliver queued messages whose delay has elapsed.
  for (let i = phoneQueue.length - 1; i >= 0; i--) {
    if (G.time >= phoneQueue[i].at) {
      const msg = phoneQueue.splice(i, 1)[0];
      const div = document.createElement('div');
      div.className = 'phone-msg';
      const who = document.createElement('b');
      who.textContent = msg.from + ': ';
      div.appendChild(who);
      div.appendChild(document.createTextNode(msg.text));
      el.phone.appendChild(div);
      // Keep the thread short: drop the oldest bubble past three.
      while (el.phone.children.length > 3) el.phone.removeChild(el.phone.firstChild);
      setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 11000);
    }
  }
}

export function updateHud(dt) {
  if (!el.hud) return;
  renderStars();

  if (G.cash !== lastCash) {
    lastCash = G.cash;
    el.cash.textContent = formatMoney(G.cash).slice(1); // the $ comes from CSS
  }
  const healthPct = clamp(G.health / G.maxHealth, 0, 1);
  el['health-fill'].style.width = (healthPct * 100).toFixed(1) + '%';
  el['health-fill'].style.background = healthPct > 0.5
    ? 'linear-gradient(90deg, #57d977, #b8e356)'
    : healthPct > 0.25
      ? 'linear-gradient(90deg, #e0a83b, #ffd54a)'
      : 'linear-gradient(90deg, #d94f4f, #ff8a80)';
  if (G.ammo !== lastAmmo) {
    lastAmmo = G.ammo;
    el.ammo.textContent = String(G.ammo);
  }
  el.clock.textContent = formatClock(G.clockHours);

  const player = G.player;
  if (player) {
    const pos = player.position();
    el.district.textContent = districtAt(pos.x, pos.z);
  }

  // Objective block.
  const obj = G.objective;
  if (obj) {
    const key = obj.name + '|' + obj.text + '|' + obj.sub;
    if (key !== lastObjective) {
      lastObjective = key;
      el['mission-name'].textContent = obj.name;
      el['objective-text'].textContent = obj.text;
      el['objective-sub'].textContent = obj.sub;
    }
    if (obj.pos && player) {
      const pos = player.position();
      const d = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z);
      el['objective-sub'].textContent = obj.sub + (obj.sub ? '  ·  ' : '') + Math.round(d) + 'm';
    }
  }
  if (G.missionTimer > 0) {
    el['mission-timer'].textContent = Math.ceil(G.missionTimer) + 's';
    el['mission-timer'].classList.add('on');
  } else {
    el['mission-timer'].classList.remove('on');
  }

  // Drive readout.
  if (player && player.inCar && player.car) {
    el['drive-box'].classList.add('on');
    el.speed.textContent = String(Math.round(Math.abs(player.car.speed) * 2.2));
    el['car-name'].textContent = player.car.name;
    el['car-health-fill'].style.width = (clamp(player.car.health / player.car.maxHealth, 0, 1) * 100).toFixed(0) + '%';
  } else {
    el['drive-box'].classList.remove('on');
  }

  // Interaction prompt.
  if (player && G.mode === 'playing') {
    const interact = player.getInteract();
    if (interact) {
      el['prompt-text'].textContent = interact.text;
      el.prompt.classList.add('on');
    } else {
      el.prompt.classList.remove('on');
    }
  } else {
    el.prompt.classList.remove('on');
  }

  // Controls hint fades away after the first seconds of play.
  if (G.mode === 'playing') {
    hintShown += dt;
    el.hint.style.opacity = hintShown > 14 ? '0' : '1';
  }

  // Crosshair only on foot while playing.
  el.crosshair.classList.toggle('on', G.mode === 'playing' && player && !player.inCar);

  // Timers: toast, announce, damage flash.
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el.toast.classList.remove('on');
  }
  if (announceTimer > 0) {
    announceTimer -= dt;
    if (announceTimer <= 0) {
      el.announce.classList.remove('on');
      el['announce-sub'].classList.remove('on');
    }
  }
  if (flashTimer > 0) {
    flashTimer -= dt;
    el['damage-flash'].style.opacity = String(clamp(flashTimer / 0.35, 0, 1));
    if (flashTimer <= 0) el['damage-flash'].style.opacity = '0';
  }

  updatePhone(dt);
}

export function resetHud() {
  lastStars = -1;
  lastCash = -1;
  lastAmmo = -1;
  lastObjective = '';
  phoneQueue = [];
  hintShown = 0;
  if (el.phone) el.phone.innerHTML = '';
  if (el.toast) el.toast.classList.remove('on');
  if (el.announce) {
    el.announce.classList.remove('on');
    el['announce-sub'].classList.remove('on');
  }
}
