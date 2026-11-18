// The 2D minimap: a north-up view of the streets around the player, with
// the objective marker, police blips and nearby traffic. Drawn on the
// small canvas in the HUD's bottom-left corner.

import { G, ROAD_LINES, ROAD_WIDTH } from './state.js';
import { clamp } from './util.js';

const SIZE = 184;
const VIEW_HALF = 110; // world units shown from the centre to each edge

let ctx = null;
let canvas = null;

export function initMinimap() {
  canvas = document.getElementById('minimap');
  if (canvas) ctx = canvas.getContext('2d');
}

function toMap(x, z, cx, cz) {
  const scale = SIZE / (VIEW_HALF * 2);
  return {
    x: SIZE / 2 + (x - cx) * scale,
    y: SIZE / 2 + (z - cz) * scale,
  };
}

export function drawMinimap() {
  if (!ctx || !G.player) return;
  const player = G.player;
  const pos = player.position();
  const cx = pos.x;
  const cz = pos.z;
  const scale = SIZE / (VIEW_HALF * 2);

  // Base: dark city ground.
  ctx.fillStyle = '#1d2733';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Water on the east edge, beach beside it.
  const shore = toMap(262, 0, cx, cz).x;
  if (shore < SIZE) {
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(Math.max(0, shore), 0, SIZE, SIZE);
    ctx.fillStyle = '#cbb27f';
    ctx.fillRect(Math.max(0, shore - 36 * scale), 0, 36 * scale, SIZE);
  }

  // City blocks.
  ctx.fillStyle = '#33414f';
  for (let bx = -180; bx <= 180; bx += 60) {
    for (let bz = -180; bz <= 180; bz += 60) {
      const p = toMap(bx - 24, bz - 24, cx, cz);
      const w = 48 * scale;
      if (p.x + w < 0 || p.x > SIZE || p.y + w < 0 || p.y > SIZE) continue;
      ctx.fillRect(p.x, p.y, w, w);
    }
  }

  // Park + plaza accents.
  const park = toMap(-120, 120, cx, cz);
  ctx.fillStyle = '#4a7a3f';
  ctx.fillRect(park.x, park.y, 48 * scale, 48 * scale);
  const plaza = toMap(0, 0, cx, cz);
  ctx.fillStyle = '#7a5a3f';
  ctx.beginPath();
  ctx.arc(plaza.x, plaza.y, 20 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Roads.
  ctx.strokeStyle = '#12181f';
  ctx.lineWidth = Math.max(2, ROAD_WIDTH * scale);
  for (const line of ROAD_LINES) {
    const px = toMap(line, 0, cx, cz).x;
    if (px >= -8 && px <= SIZE + 8) {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, SIZE);
      ctx.stroke();
    }
    const pz = toMap(0, line, cx, cz).y;
    if (pz >= -8 && pz <= SIZE + 8) {
      ctx.beginPath();
      ctx.moveTo(0, pz);
      ctx.lineTo(SIZE, pz);
      ctx.stroke();
    }
  }

  // Objective marker: pulsing gold diamond.
  if (G.objectivePos) {
    const p = toMap(G.objectivePos.x, G.objectivePos.z, cx, cz);
    const onScreen = p.x >= 4 && p.x <= SIZE - 4 && p.y >= 4 && p.y <= SIZE - 4;
    const edge = {
      x: clamp(p.x, 8, SIZE - 8),
      y: clamp(p.y, 8, SIZE - 8),
    };
    const pulse = 5 + Math.sin(G.time * 4) * 1.5;
    ctx.fillStyle = '#ffd54a';
    ctx.save();
    ctx.translate(onScreen ? p.x : edge.x, onScreen ? p.y : edge.y);
    if (!onScreen) ctx.rotate(Math.atan2(p.y - SIZE / 2, p.x - SIZE / 2) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -pulse - 2);
    ctx.lineTo(pulse, 0);
    ctx.lineTo(0, pulse + 2);
    ctx.lineTo(-pulse, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Police blips: flashing red/blue.
  const policeOn = Math.sin(G.time * 8) > 0;
  for (const car of G.cars) {
    if (car.driver !== 'police') continue;
    const p = toMap(car.mesh.position.x, car.mesh.position.z, cx, cz);
    if (p.x < 0 || p.x > SIZE || p.y < 0 || p.y > SIZE) continue;
    ctx.fillStyle = policeOn ? '#ff4444' : '#4488ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const officer of G.officers) {
    if (officer.dead) continue;
    const p = toMap(officer.fig.group.position.x, officer.fig.group.position.z, cx, cz);
    if (p.x < 0 || p.x > SIZE || p.y < 0 || p.y > SIZE) continue;
    ctx.fillStyle = '#ff8888';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nearby traffic: small pale dots.
  ctx.fillStyle = 'rgba(220,225,235,0.7)';
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    const p = toMap(car.mesh.position.x, car.mesh.position.z, cx, cz);
    if (p.x < 0 || p.x > SIZE || p.y < 0 || p.y > SIZE) continue;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }

  // Player arrow, pointing along the player's (or car's) heading.
  const heading = player.inCar && player.car ? player.car.heading : player.heading;
  const center = { x: SIZE / 2, y: SIZE / 2 };
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // North tick.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', SIZE - 10, 13);
}
