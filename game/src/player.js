// player — on-foot movement (WASD relative to the camera, jump, sprint),
// getting in and out of cars, and the player figure's mesh.
import * as THREE from 'three';
import { PLAYER, CAR } from './config.js';
import { makePersonMesh } from './people.js';
import { resolveCollisions, clampToCity } from './city.js';
import { commitCrime, addFeed } from './state.js';

export function makePlayerMesh() {
  const mesh = makePersonMesh(PLAYER_JACKET, 0xc98d64, { hair: 0x1a1210 });
  return mesh;
}

const PLAYER_JACKET = 0xff5a3c;

export function stepOnFoot(state, city, axes, sprint, jump, dt) {
  const p = state.player;
  const camYaw = state.camera.yaw;
  // movement is relative to the camera yaw
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  const mx = sin * axes.f + cos * axes.s;
  const mz = cos * axes.f - sin * axes.s;
  const moving = Math.hypot(mx, mz) > 0.01;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (moving) {
    const inv = 1 / Math.hypot(mx, mz);
    const tx = mx * inv * speed;
    const tz = mz * inv * speed;
    p.vx += (tx - p.vx) * Math.min(1, PLAYER.accel * dt / speed);
    p.vz += (tz - p.vz) * Math.min(1, PLAYER.accel * dt / speed);
    p.yaw = Math.atan2(p.vx, p.vz);
  } else {
    p.vx *= Math.max(0, 1 - 10 * dt);
    p.vz *= Math.max(0, 1 - 10 * dt);
  }
  const nx = p.x + p.vx * dt;
  const nz = p.z + p.vz * dt;
  const hit = resolveCollisions(city, nx, nz, PLAYER.radius);
  const clamped = clampToCity(hit.x, hit.z);
  p.x = clamped.x;
  p.z = clamped.z;
  // gravity + jump
  if (jump && p.onGround) {
    p.vy = PLAYER.jumpSpeed;
    p.onGround = false;
  }
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
  // walk-cycle phase for the mesh
  const planar = Math.hypot(p.vx, p.vz);
  p.walkPhase = (p.walkPhase || 0) + dt * planar * 1.6;
  return moving;
}

export function syncPlayerMesh(mesh, state) {
  const p = state.player;
  if (!mesh) return;
  mesh.visible = p.onFoot;
  if (!p.onFoot) return;
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = p.yaw;
  const swing = Math.sin(p.walkPhase || 0) * 0.5 * Math.min(1, Math.hypot(p.vx, p.vz) / 6);
  mesh.userData.legL.rotation.x = swing;
  mesh.userData.legR.rotation.x = -swing;
  mesh.userData.armL.rotation.x = -swing * 0.8;
  mesh.userData.armR.rotation.x = swing * 0.8;
  mesh.position.y = p.y + Math.abs(Math.sin(p.walkPhase || 0)) * 0.04;
}

/** The nearest enterable car within 3.5 m, or null. */
export function nearestCar(state, maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist || 3.5;
  for (const car of state.cars) {
    if (car.police && car.speed > 1) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  p.car = car;
  p.onFoot = false;
  car.parked = false;
  car.traffic = false;
  state.camera.yaw = car.yaw;
  if (car.police) {
    addFeed(state, 'You stole a police car!');
  }
}

export function exitCar(state, city) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = 2.6;
  const ex = car.x + Math.cos(car.yaw) * side;
  const ez = car.z - Math.sin(car.yaw) * side;
  const hit = resolveCollisions(city, ex, ez, PLAYER.radius);
  p.x = hit.x;
  p.z = hit.z;
  p.y = 0;
  p.vx = 0;
  p.vz = 0;
  p.yaw = car.yaw;
  p.car = null;
  p.onFoot = true;
  state.camera.yaw = car.yaw;
}

/** Steal a parked/traffic car: entering a car that is not yours is a crime. */
export function stealCar(state, car) {
  enterCar(state, car);
  state.stats.carsStolen += 1;
  commitCrime(state, 1, 'Car stolen');
}
