// The live minimap: roads, water and blocks, the player arrow,
// traffic dots, police strobes, shops and pickups, and the objective
// marker clamped to the edge with a direction wedge so the goal is
// never lost off-screen. The zoom eases out with speed, so fast
// driving still reads at a glance.

import { G, WORLD_HALF, ROAD_LINES, ROAD_WIDTH, SHORE_X } from './state.js';
import { clamp } from './util.js';

let zoom = 120;
void WORLD_HALF;

export function drawMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const player = G.player;
  if (!player) return;
  const p = player.pos();
  const speed = player.inCar ? Math.abs(player.inCar.speed) : player.walkSpeed;
  // The zoom eases toward its speed target instead of snapping, so
  // accelerating never makes the map jump under the player's eyes.
  const targetZoom = 105 + clamp(speed * 3.2, 0, 75);
  zoom += (targetZoom - zoom) * 0.05;
  const half = zoom;
  const scale = (W / 2) / half;
  const toX = (x) => W / 2 + (x - p.x) * scale;
  const toY = (z) => H / 2 + (z - p.z) * scale;

  ctx.fillStyle = '#20262e';
  ctx.fillRect(0, 0, W, H);
  if (toX(SHORE_X) < W) {
    ctx.fillStyle = '#1e6f8e';
    ctx.fillRect(Math.max(0, toX(SHORE_X)), 0, W, H);
  }
  ctx.fillStyle = '#8a7a5a';
  const beachX = toX(SHORE_X - 20);
  if (beachX < W && beachX + 20 * scale > 0) ctx.fillRect(beachX, 0, 20 * scale, H);
  ctx.fillStyle = '#4a5058';
  for (const line of ROAD_LINES) {
    const y = toY(line);
    if (y > -20 && y < H + 20) ctx.fillRect(0, y - (ROAD_WIDTH / 2) * scale, W, ROAD_WIDTH * scale);
    const x = toX(line);
    if (x > -20 && x < W + 20) ctx.fillRect(x - (ROAD_WIDTH / 2) * scale, 0, ROAD_WIDTH * scale, H);
  }
  ctx.fillStyle = '#2c4432';
  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const bx = toX(-120 + ix * 120);
      const bz = toY(-120 + iz * 120);
      if (bx > -40 && bx < W + 40 && bz > -40 && bz < H + 40) {
        ctx.fillRect(bx - 14 * scale, bz - 14 * scale, 28 * scale, 28 * scale);
      }
    }
  }
  if (G.city) {
    for (const shop of G.city.shops) {
      const x = toX(shop.x);
      const y = toY(shop.z);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      ctx.fillStyle = shop.kind === 'clinic' ? '#ff6b6b' : shop.kind === 'guns' ? '#ffa726' : '#66bb6a';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const pickup of G.pickups) {
    if (pickup.taken) continue;
    const x = toX(pickup.x);
    const y = toY(pickup.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillStyle = pickup.kind === 'health' ? '#2ecc71' : '#e0a526';
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  const flash = Math.floor(G.time * 4) % 2 === 0;
  for (const car of G.cars) {
    const x = toX(car.mesh.position.x);
    const y = toY(car.mesh.position.z);
    if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
    if (car.driver === 'police') {
      ctx.fillStyle = flash ? '#ff5252' : '#448aff';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (car.driver === 'traffic') {
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    } else if (car.storyCar) {
      ctx.fillStyle = '#e040fb';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (G.objectivePos) {
    let ox = toX(G.objectivePos.x);
    let oy = toY(G.objectivePos.z);
    const clamped = ox < 14 || ox > W - 14 || oy < 14 || oy > H - 14;
    ox = clamp(ox, 14, W - 14);
    oy = clamp(oy, 14, H - 14);
    ctx.save();
    ctx.translate(ox, oy);
    if (clamped) {
      const ang = Math.atan2(G.objectivePos.z - p.z, G.objectivePos.x - p.x);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-5, -6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.rotate(Math.PI / 4);
      const pulse = 6 + Math.sin(G.time * 4) * 1.5;
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.strokeStyle = '#7a5b00';
      ctx.strokeRect(-pulse / 2, -pulse / 2, pulse, pulse);
    }
    ctx.restore();
  }
  const heading = player.inCar ? player.inCar.heading : player.heading;
  drawArrow(ctx, W / 2, H / 2, heading);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = 'bold 10px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', W / 2, 12);
}

function drawArrow(ctx, cx, cy, heading) {
  // Screen angle: heading 0 (+z) points down the canvas, PI/2 right.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
