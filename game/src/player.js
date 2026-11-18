// Mara Voss, the player: on-foot movement with a third-person orbit
// camera, jumping, entering and stealing cars, exiting, taking damage, and
// the E-key interactions (cars, shops, mission pickups).

import * as THREE from 'three';
import { G, emit } from './state.js';
import { clamp, damp, angleLerp, angleDiff, resolveColliders, dist2 } from './util.js';
import { clampToWorld } from './city.js';
import { makeHumanoid, animateHumanoid } from './characters.js';
import { nearestCar } from './vehicles.js';

const WALK_SPEED = 6;
const RUN_SPEED = 10.5;
const GRAVITY = 24;

export function createPlayer(scene) {
  const fig = makeHumanoid({
    shirt: 0xd94f4f, pants: 0x2e4057, skin: 0xe0ac69, hair: 0x2b1d16,
    hat: 'cap', hatColor: 0xcc3333, pistol: true, rng: G.rng,
  });
  fig.group.position.set(G.city.locations.spawn.x, 0, G.city.locations.spawn.z);
  scene.add(fig.group);

  const player = {
    fig,
    heading: Math.PI,
    vy: 0,
    onGround: true,
    walkPhase: 0,
    speedNorm: 0,
    punchTimer: 0,
    invulnTimer: 0,
    inCar: false,
    car: null,
    lastDragTime: -10,
    dead: false,
  };

  player.position = function position() {
    return fig.group.position;
  };

  player.teleport = function teleport(x, z, heading) {
    if (player.inCar && player.car) player.exitCar();
    fig.group.position.set(x, 0, z);
    if (heading !== undefined) player.heading = heading;
    player.vy = 0;
  };

  player.enterCar = function enterCar(car) {
    const wasTraffic = car.driver === 'traffic';
    const wasParked = car.driver === 'parked';
    car.driver = 'player';
    player.inCar = true;
    player.car = car;
    fig.group.visible = false;
    if (G.audio) G.audio.doorSlam();
    if (wasTraffic || wasParked) {
      G.stats.carsStolen++;
      emit('carStolen', { car, wasTraffic });
      emit('crime', { kind: 'steal', amount: 1, x: car.mesh.position.x, z: car.mesh.position.z });
    }
    emit('enteredCar', { car });
  };

  player.exitCar = function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    player.inCar = false;
    player.car = null;
    // Step out on the left side of the car.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    fig.group.position.set(
      car.mesh.position.x + sideX * 2.4,
      0,
      car.mesh.position.z + sideZ * 2.4,
    );
    resolveColliders(fig.group.position, 0.5, G.city.colliders);
    clampToWorld(fig.group.position, 0.5);
    player.heading = car.heading;
    fig.group.visible = true;
    if (G.audio) G.audio.doorSlam();
    emit('exitedCar', { car });
  };

  player.damage = function damage(amount, source) {
    if (player.dead || player.invulnTimer > 0) return;
    player.invulnTimer = 0.25;
    G.health = Math.max(0, G.health - amount);
    emit('playerDamaged', { amount, source });
    if (G.health <= 0) {
      player.dead = true;
      emit('playerDown', { source });
    }
  };

  player.heal = function heal(amount) {
    G.health = Math.min(G.maxHealth, G.health + amount);
  };

  // What the E key would do right now, for the prompt line. Returns
  // { text, run } or null.
  player.getInteract = function getInteract() {
    if (player.inCar) {
      if (player.car && Math.abs(player.car.speed) < 3) {
        return { text: 'Exit ' + player.car.name, run: () => player.exitCar() };
      }
      return null;
    }
    const pos = fig.group.position;
    // Mission interactable first (collect, pick up, deliver).
    if (G.missionInteract) {
      const mi = G.missionInteract;
      if (dist2(pos.x, pos.z, mi.x, mi.z) < mi.radius) {
        return { text: mi.text, run: mi.run };
      }
    }
    // Shops: clinic and gun store.
    for (const zone of G.interactZones) {
      if (dist2(pos.x, pos.z, zone.x, zone.z) < zone.radius) {
        return { text: zone.text(), run: zone.run };
      }
    }
    // Nearest car.
    const car = nearestCar(pos.x, pos.z, 4.5, null);
    if (car) {
      const verb = car.driver === 'traffic' ? 'Steal' : car.driver === 'parked' ? 'Take' : 'Enter';
      return { text: verb + ' ' + car.name, run: () => player.enterCar(car) };
    }
    return null;
  };

  player.update = function update(dt) {
    const input = G.input;
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
    player.punchTimer = Math.max(0, player.punchTimer - dt);

    // Camera orbit from mouse drag / pointer lock, and arrow keys.
    if (input.mouseDX !== 0 || input.mouseDY !== 0) {
      player.lastDragTime = G.time;
      G.cameraYaw -= input.mouseDX * 0.0032;
      G.cameraPitch = clamp(G.cameraPitch + input.mouseDY * 0.0022, 0.06, 1.05);
    }
    if (input.keys.has('turnLeft')) G.cameraYaw += 1.9 * dt;
    if (input.keys.has('turnRight')) G.cameraYaw -= 1.9 * dt;
    if (input.wheel !== 0) {
      G.cameraDist = clamp(G.cameraDist + input.wheel * 0.7, 4, 11);
    }

    if (player.inCar && player.car) {
      updateDriving(dt);
    } else {
      updateOnFoot(dt);
    }
    updateCamera(dt);
  };

  function updateOnFoot(dt) {
    const input = G.input;
    const pos = fig.group.position;
    // Move relative to the camera's facing.
    const fwdX = Math.sin(G.cameraYaw);
    const fwdZ = Math.cos(G.cameraYaw);
    const leftX = Math.cos(G.cameraYaw);
    const leftZ = -Math.sin(G.cameraYaw);
    let mx = 0;
    let mz = 0;
    if (input.keys.has('up')) { mx += fwdX; mz += fwdZ; }
    if (input.keys.has('down')) { mx -= fwdX; mz -= fwdZ; }
    if (input.keys.has('left')) { mx += leftX; mz += leftZ; }
    if (input.keys.has('right')) { mx -= leftX; mz -= leftZ; }
    const len = Math.hypot(mx, mz);
    const running = input.keys.has('run');
    const speed = running ? RUN_SPEED : WALK_SPEED;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      player.heading = angleLerp(player.heading, targetHeading, 1 - Math.exp(-12 * dt));
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      player.walkPhase += speed * dt * 1.7;
      player.speedNorm = damp(player.speedNorm, running ? 1 : 0.62, 8, dt);
      G.stats.distanceKm += (speed * dt) / 1000;
    } else {
      player.speedNorm = damp(player.speedNorm, 0, 10, dt);
      player.walkPhase += dt * 1.2; // idle breathing
    }

    // Jump + gravity.
    if (input.wasPressed('jump') && player.onGround) {
      player.vy = 8.5;
      player.onGround = false;
    }
    if (!player.onGround) {
      player.vy -= GRAVITY * dt;
      pos.y += player.vy * dt;
      if (pos.y <= 0) {
        pos.y = 0;
        player.vy = 0;
        player.onGround = true;
      }
    }

    resolveColliders(pos, 0.5, G.city.colliders);
    clampToWorld(pos, 0.5);
    fig.group.rotation.y = player.heading;
    animateHumanoid(fig, player.walkPhase, player.speedNorm, player.punchTimer > 0 ? 1 - player.punchTimer / 0.35 : 0);
  }

  function updateDriving(dt) {
    const input = G.input;
    const car = player.car;
    // While driving, the camera eases back behind the car unless the
    // player has dragged it recently.
    if (G.time - player.lastDragTime > 1.2) {
      G.cameraYaw = angleLerp(G.cameraYaw, car.heading, 1 - Math.exp(-2.2 * dt));
    }
    // Keep the hidden player mesh glued to the car for the minimap.
    fig.group.position.copy(car.mesh.position);
    fig.group.rotation.y = car.heading;
  }

  function updateCamera(dt) {
    const cam = G.camera;
    const focus = player.inCar && player.car
      ? player.car.mesh.position
      : fig.group.position;
    const pitch = player.inCar ? Math.max(0.18, G.cameraPitch * 0.8) : G.cameraPitch;
    const dist = player.inCar ? G.cameraDist + 2.5 : G.cameraDist;
    const cx = focus.x - Math.sin(G.cameraYaw) * Math.cos(pitch) * dist;
    const cz = focus.z - Math.cos(G.cameraYaw) * Math.cos(pitch) * dist;
    const cy = focus.y + 1.6 + Math.sin(pitch) * dist;
    cam.position.set(cx, Math.max(1.1, cy), cz);
    cam.lookAt(focus.x, focus.y + 1.5, focus.z);
  }

  return player;
}
