// Mara, on foot and behind the wheel: camera-relative walking, run
// and jump, stealing and entering cars, and the handoff to the driving
// model. The camera always chases Mara or her car — never a free orbit.

import { G, emit, addShake } from './state.js';
import { makeMara, animateFigure } from './characters.js';
import { clamp, angleDamp, damp } from './util.js';
import { drivePlayerCar, moveCar, carDistance } from './vehicles.js';

export class Player {
  constructor(scene) {
    this.fig = makeMara();
    scene.add(this.fig.group);
    this.fig.group.position.set(-30, 0, 30);
    this.heading = Math.PI;
    this.velY = 0;
    this.onGround = true;
    this.inCar = null;
    this.walkSpeed = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.hurtTimer = 0;
    this.visible = true;
  }

  pos() {
    const p = this.inCar ? this.inCar.mesh.position : this.fig.group.position;
    return { x: p.x, z: p.z };
  }

  headPos() {
    const p = this.pos();
    return { x: p.x, y: this.inCar ? 1.6 : 1.7, z: p.z };
  }

  teleport(x, z, heading) {
    if (this.inCar) this.exitCar(true);
    this.fig.group.position.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.fig.group.rotation.y = this.heading;
    this.velY = 0;
  }

  enterCar(car) {
    if (this.inCar) return;
    const wasParked = car.driver === 'parked';
    const wasTraffic = car.driver === 'traffic';
    car.driver = 'player';
    car.traffic = null;
    this.inCar = car;
    this.fig.group.visible = false;
    if (wasParked || wasTraffic) {
      G.stats.carsStolen++;
      emit('carStolen', { car });
    }
    if (G.audio) G.audio.door();
  }

  // Mara steps out on the car's left side, clear of traffic, and the
  // car becomes an ordinary parked car again.
  exitCar(silent) {
    const car = this.inCar;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    this.inCar = null;
    const side = car.heading + Math.PI / 2;
    const x = car.mesh.position.x + Math.sin(side) * 2.4;
    const z = car.mesh.position.z + Math.cos(side) * 2.4;
    const res = G.city.collideCircle(x, z, 0.5);
    this.fig.group.position.set(res.x, 0, res.z);
    this.heading = car.heading;
    this.fig.group.rotation.y = this.heading;
    this.fig.group.visible = true;
    if (!silent && G.audio) G.audio.door();
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    const p = this.pos();
    for (const car of G.cars) {
      if (car.driver === 'police') continue;
      if (car.police) continue;
      const d = carDistance(car, p.x, p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  punch() {
    if (this.punchCooldown > 0 || this.inCar) return false;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.45;
    emit('punch', { x: this.fig.group.position.x, z: this.fig.group.position.z, heading: this.heading });
    if (G.audio) G.audio.punch();
    return true;
  }

  hurt(amount, fromX, fromZ) {
    if (this.hurtTimer > 0) return;
    this.hurtTimer = 0.5;
    G.health = Math.max(0, G.health - amount);
    addShake(0.25);
    emit('playerHurt', { amount });
    if (G.audio) G.audio.hurt();
    if (G.health <= 0) emit('playerDown', {});
    void fromX;
    void fromZ;
  }

  update(dt, input) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    const axes = input.axes();

    if (this.inCar) {
      const car = this.inCar;
      const handbrake = input.held('Space');
      const slipping = drivePlayerCar(car, axes, dt, handbrake);
      const before = { x: car.mesh.position.x, z: car.mesh.position.z };
      const prevHealth = car.health;
      moveCar(car, dt, G.city, G.cars);
      const moved = Math.hypot(car.mesh.position.x - before.x, car.mesh.position.z - before.z);
      G.stats.distanceKm += moved / 1000;
      if (car.health < prevHealth - 1 && G.audio) G.audio.crash(Math.abs(car.speed));
      if (car.health <= 0) {
        this.exitCar(true);
        emit('carWrecked', { car });
      }
      if (Math.abs(car.speed) > 6) {
        G.cameraTargetYaw = car.heading + Math.PI;
      }
      G.fovKick = damp(G.fovKick, clamp(Math.abs(car.speed) / 36, 0, 1) * 8, 3, dt);
      return { driving: true, speed: car.speed, slipping };
    }

    // On foot, movement is relative to where the camera sits.
    const camYaw = G.cameraYaw;
    let mx = 0;
    let mz = 0;
    if (axes.y !== 0 || axes.x !== 0) {
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      mx = -sin * axes.y + -cos * axes.x;
      mz = -cos * axes.y + sin * axes.x;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }
    const running = input.held('ShiftLeft') || input.held('ShiftRight');
    const targetSpeed = (axes.x !== 0 || axes.y !== 0) ? (running ? 8.2 : 4.6) : 0;
    this.walkSpeed = damp(this.walkSpeed, targetSpeed, 10, dt);
    if (this.walkSpeed > 0.2) {
      const wantHeading = Math.atan2(mx, mz);
      this.heading = angleDamp(this.heading, wantHeading, 12, dt);
      const nx = this.fig.group.position.x + mx * this.walkSpeed * dt;
      const nz = this.fig.group.position.z + mz * this.walkSpeed * dt;
      const res = G.city.collideCircle(nx, nz, 0.5);
      this.fig.group.position.x = res.x;
      this.fig.group.position.z = res.z;
      G.stats.distanceKm += this.walkSpeed * dt / 1000;
    }
    if (input.consume('Space') && this.onGround) {
      this.velY = 7.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= 22 * dt;
      let y = this.fig.group.position.y + this.velY * dt;
      if (y <= 0) { y = 0; this.velY = 0; this.onGround = true; }
      this.fig.group.position.y = y;
    }
    this.fig.group.rotation.y = this.heading;
    const aiming = input.held('MouseLeft') || false;
    animateFigure(this.fig, this.walkSpeed, dt, {
      punch: this.punchTimer,
      aim: aiming && G.ammo > 0,
    });
    this.fig.gun.visible = G.ammo > 0;
    G.fovKick = damp(G.fovKick, 0, 4, dt);
    return { driving: false, speed: this.walkSpeed, slipping: false };
  }
}
