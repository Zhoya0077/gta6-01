// HUD and screens: cash, health, ammo, wanted stars, clock, district,
// objective chip, drive readout, phone messages, toasts, announcements,
// prompts, and the menu / pause / busted / complete overlays. All DOM,
// updated from state every frame, with pulses on every change that hurts.

import { G, on } from './state.js';
import { formatMoney, formatClock, formatTimer } from './util.js';
import { isEvading } from './police.js';

const $ = (id) => document.getElementById(id);
let els = {};
let lastCash = -1;
let lastHealth = -1;
let lastAmmo = -1;
let lastWanted = -1;
let toastTimer = 0;
let announceTimer = 0;
let hintFade = 0;
let damageTimer = 0;

export function initHud() {
  els = {
    hud: $('hud'), cash: $('cash'), healthFill: $('health-fill'), ammo: $('ammo'),
    stars: $('stars'), clock: $('clock'), district: $('district'),
    missionName: $('mission-name'), objectiveText: $('objective-text'),
    objectiveSub: $('objective-sub'), missionTimer: $('mission-timer'),
    driveBox: $('drive-box'), speed: $('speed'), carName: $('car-name'),
    carHealthFill: $('car-health-fill'),
    prompt: $('prompt'), promptText: $('prompt-text'), hint: $('hint'),
    phone: $('phone'), toast: $('toast'), toastText: $('toast-text'),
    announce: $('announce'), announceSub: $('announce-sub'),
    crosshair: $('crosshair'), damageFlash: $('damage-flash'), fadeBlack: $('fade-black'),
    menu: $('menu'), pause: $('pause'), busted: $('busted'), complete: $('complete'),
  };
  on('playerHurt', () => { damageTimer = 0.35; });
  on('wantedChanged', ({ wanted }) => {
    if (wanted > lastWanted) showToast(wanted >= 3 ? 'The whole city is looking for you.' : 'The police are onto you.');
  });
  on('pickup', ({ kind }) => showToast(kind === 'health' ? '+30 health' : '+12 rounds'));
  on('evaded', ({ wanted }) => showToast(wanted === 0 ? 'You lost them. Breathe.' : 'Heat cooling… ' + wanted + ' star' + (wanted === 1 ? '' : 's') + ' left.'));
  on('carStolen', () => showToast('Car stolen. Drive like you own it.'));
  on('missionComplete', ({ reward }) => { pulse(els.cash); void reward; });
}

function pulse(el) {
  if (!el) return;
  el.style.transform = 'scale(1.12)';
  el.style.transition = 'transform 0.1s ease';
  setTimeout(() => { el.style.transform = ''; }, 130);
}

export function showToast(text) {
  if (!els.toast) return;
  els.toastText.textContent = text;
  els.toast.classList.add('on');
  toastTimer = 3.2;
}

export function announce(title, sub) {
  if (!els.announce) return;
  els.announce.textContent = title;
  els.announceSub.textContent = sub || '';
  els.announce.classList.add('on');
  els.announceSub.classList.add('on');
  announceTimer = 2.6;
}

export function phoneMessage(from, text) {
  if (!els.phone) return;
  const div = document.createElement('div');
  div.className = 'phone-msg';
  const b = document.createElement('b');
  b.textContent = from + '  ';
  div.appendChild(b);
  div.appendChild(document.createTextNode(text));
  els.phone.appendChild(div);
  while (els.phone.children.length > 3) els.phone.removeChild(els.phone.firstChild);
  setTimeout(() => {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, 9000);
}

export function setObjective(name, text, sub) {
  if (!els.missionName) return;
  els.missionName.textContent = name;
  els.objectiveText.textContent = text;
  els.objectiveSub.textContent = sub || '';
}

export function setPrompt(html) {
  if (!els.prompt) return;
  if (!html) {
    els.prompt.classList.remove('on');
    return;
  }
  els.promptText.textContent = html;
  els.prompt.classList.add('on');
}

export function showScreen(name) {
  for (const key of ['menu', 'pause', 'busted', 'complete']) {
    if (els[key]) els[key].classList.toggle('on', key === name);
  }
  if (els.hud) els.hud.classList.toggle('on', name === null && G.mode === 'playing');
}

export function fadeBlack(onOff) {
  if (els.fadeBlack) els.fadeBlack.classList.toggle('on', onOff);
}

export function setBustedStats(html) {
  const el = $('busted-stats');
  if (el) el.innerHTML = html;
}

export function setCompleteStats(html) {
  const el = $('complete-stats');
  if (el) el.innerHTML = html;
}

export function updateHud(dt) {
  if (!els.hud) return;
  toastTimer = Math.max(0, toastTimer - dt);
  if (toastTimer <= 0) els.toast.classList.remove('on');
  announceTimer = Math.max(0, announceTimer - dt);
  if (announceTimer <= 0) {
    els.announce.classList.remove('on');
    els.announceSub.classList.remove('on');
  }
  damageTimer = Math.max(0, damageTimer - dt);
  els.damageFlash.style.opacity = damageTimer > 0 ? '1' : '0';
  // Hint fades after the first minute of play.
  hintFade += dt;
  if (els.hint) els.hint.style.opacity = hintFade > 60 ? '0' : '1';

  if (G.cash !== lastCash) {
    if (lastCash >= 0 && G.cash < lastCash) pulse(els.cash);
    els.cash.textContent = formatMoney(G.cash);
    lastCash = G.cash;
  }
  if (G.health !== lastHealth) {
    els.healthFill.style.width = Math.max(0, (G.health / G.maxHealth) * 100) + '%';
    els.healthFill.style.background = G.health < 30
      ? 'linear-gradient(90deg, #e53935, #ff7043)'
      : 'linear-gradient(90deg, #57d977, #b8e356)';
    if (lastHealth >= 0 && G.health < lastHealth) pulse(els.healthFill);
    lastHealth = G.health;
  }
  if (G.ammo !== lastAmmo) {
    els.ammo.textContent = G.ammo;
    lastAmmo = G.ammo;
  }
  if (G.wanted !== lastWanted) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += '<span class="' + (i < G.wanted ? 'lit' : 'dim') + '">★</span>';
    }
    els.stars.innerHTML = html;
    if (lastWanted >= 0 && G.wanted > lastWanted) pulse(els.stars);
    lastWanted = G.wanted;
  }
  els.clock.textContent = formatClock(G.clockHours);
  if (G.city && G.player) {
    const p = G.player.pos();
    const district = G.city.districtAt(p.x, p.z);
    const evading = isEvading();
    els.district.textContent = (evading ? 'EVADING • ' : '') + district;
  }
  if (G.missionTimer > 0) {
    els.missionTimer.textContent = formatTimer(G.missionTimer);
    els.missionTimer.classList.add('on');
  } else {
    els.missionTimer.classList.remove('on');
  }
  // Drive readout.
  if (G.player && G.player.inCar) {
    const car = G.player.inCar;
    els.driveBox.classList.add('on');
    els.speed.textContent = Math.round(Math.abs(car.speed) * 2.2);
    els.carName.textContent = car.def.name + (car.storyCar ? '  •  STOLEN' : '');
    els.carHealthFill.style.width = Math.max(0, (car.health / car.maxHealth) * 100) + '%';
    els.crosshair.classList.remove('on');
  } else {
    els.driveBox.classList.remove('on');
    els.crosshair.classList.toggle('on', G.mode === 'playing' && G.ammo > 0);
  }
  // HUD breathes: dim the top-left panel while cruising calmly.
  const calm = G.wanted === 0 && G.missionTimer <= 0;
  els.hud.style.setProperty('--hud-dim', calm ? '0.82' : '1');
}
