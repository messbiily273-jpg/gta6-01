// vehicles — car meshes, arcade driving physics, traffic AI and police AI.
// Cars are low-poly boxes with a cabin, wheels and lights, built from code:
// no model files, no textures from outside the game.
import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { range, pick } from './random.js';
import { resolveCollisions, clampToCity } from './city.js';

export const CAR_MODELS = [
  { name: 'Comet Coupe', color: 0xd8382c, speed: 1.12, accel: 1.1 },
  { name: 'Harbor Sedan', color: 0x3a6fd8, speed: 1.0, accel: 1.0 },
  { name: 'Bay Taxi', color: PALETTE.taxi, speed: 0.95, accel: 0.95, taxi: true },
  { name: 'Dune Pickup', color: 0x6a8f4a, speed: 0.98, accel: 1.05 },
  { name: 'Solstice Van', color: 0xe8e4da, speed: 0.85, accel: 0.85 },
  { name: 'Night Cruiser', color: 0x1c1e26, speed: 1.05, accel: 1.0 },
  { name: 'Coral Convertible', color: 0xff7ad8, speed: 1.08, accel: 1.05 },
];

const TRAFFIC_COLORS = [0xd8382c, 0x3a6fd8, 0xe8e4da, 0x6a8f4a, 0x1c1e26, 0xc8c8c8, 0x8a6a48];

export function makeCarMesh(model, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  const bodyColor = o.police ? PALETTE.policeCar : model.color;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.15, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  const len = o.police ? 4.6 : 4.4;
  const wid = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.75, len), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.62, len * 0.48), glassMat);
  cabin.position.set(0, 1.28, -len * 0.06);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // headlights + taillights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffe9a8, emissiveIntensity: 0.8 });
  for (const hx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    hl.position.set(hx, 0.72, len / 2 + 0.02);
    group.add(hl);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xd81e1e, emissive: 0xa01010, emissiveIntensity: 0.8 });
  for (const hx of [-0.65, 0.65]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(hx, 0.72, -len / 2 - 0.02);
    group.add(tl);
  }
  if (o.police) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(wid + 0.02, 0.2, len * 0.7),
      new THREE.MeshStandardMaterial({ color: PALETTE.copBlue, roughness: 0.4 }),
    );
    stripe.position.y = 0.85;
    group.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd81e1e, emissive: 0xff2020, emissiveIntensity: 1.4 }),
    );
    bar.position.set(0, 1.68, -len * 0.06);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  if (model.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffc21c, emissive: 0xcc9210, emissiveIntensity: 0.6 }),
    );
    sign.position.set(0, 1.66, -len * 0.06);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  return group;
}

export function createCar(id, model, x, z, yaw, opts) {
  const o = opts || {};
  return {
    id,
    model,
    x, z, yaw,
    speed: 0,
    steer: 0,
    parked: !!o.parked,
    police: !!o.police,
    traffic: !!o.traffic,
    target: null, // traffic: next intersection {x, z}
    lane: o.lane || 0,
    mesh: null,
    health: 100,
    stuck: 0,
    siren: 0,
  };
}

/** Arcade car step: throttle -1..1, steer -1..1, fixed dt. */
export function stepCar(car, city, throttle, steer, dt) {
  const maxSpeed = CAR.maxSpeed * car.model.speed;
  if (throttle > 0) car.speed += CAR.accel * car.model.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * throttle * dt * -1 * -1; // reverse
  }
  car.speed -= car.speed * 0.35 * dt; // drag
  if (car.speed > maxSpeed) car.speed = maxSpeed;
  if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  const turn = steer * CAR.turnRate * Math.min(1, Math.abs(car.speed) / 8) * (car.speed >= 0 ? 1 : -1);
  car.yaw += turn * dt;
  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  const hit = resolveCollisions(city, nx, nz, CAR.radius);
  if ((hit.x !== nx || hit.z !== nz) && Math.abs(car.speed) > 3) {
    car.speed *= 0.45; // bump: lose speed on impact
  }
  const clamped = clampToCity(hit.x, hit.z);
  car.x = clamped.x;
  car.z = clamped.z;
  car.steer = steer;
}

function angleTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Pick a new traffic destination: a random nearby intersection. */
export function retargetTraffic(car, city, rng) {
  const near = city.intersections.filter((n) => Math.hypot(n.x - car.x, n.z - car.z) < 200);
  const pool = near.length ? near : city.intersections;
  car.target = pick(rng, pool);
}

/** One traffic car step: follow roads toward its target intersection. */
export function stepTraffic(car, city, rng, dt, allCars) {
  if (!car.target) retargetTraffic(car, city, rng);
  const dx = car.target.x - car.x;
  const dz = car.target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) {
    retargetTraffic(car, city, rng);
    return;
  }
  const want = angleTo(car.x, car.z, car.target.x, car.target.z);
  const diff = angleDiff(want, car.yaw);
  let throttle = 0.55;
  let steer = Math.max(-1, Math.min(1, diff * 1.6));
  // slow down for a car ahead
  for (const other of allCars) {
    if (other === car || other.parked) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const forward = ox * Math.sin(car.yaw) + oz * Math.cos(car.yaw);
    const side = Math.abs(ox * Math.cos(car.yaw) - oz * Math.sin(car.yaw));
    if (forward > 0 && forward < 9 && side < 2.4) {
      throttle = 0;
      if (other.speed < 0.5) car.stuck += dt;
      break;
    }
  }
  if (car.stuck > 4) {
    // nudge around a jam
    steer = 1;
    throttle = 0.4;
    if (car.stuck > 6) {
      car.stuck = 0;
      retargetTraffic(car, city, rng);
    }
  }
  stepCar(car, city, throttle, steer, dt);
}

/** One police car step: chase the player, ram when close. */
export function stepPolice(car, city, playerX, playerZ, dt) {
  const dist = Math.hypot(playerX - car.x, playerZ - car.z);
  const want = angleTo(car.x, car.z, playerX, playerZ);
  const diff = angleDiff(want, car.yaw);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 1;
  if (dist < 4) throttle = 0.35;
  if (Math.abs(diff) > 2.4 && car.speed < 2) {
    // stuck facing the wrong way: reverse out
    throttle = -0.7;
  }
  stepCar(car, city, throttle, steer, dt);
  car.siren += dt;
}

/** Sync a car's three.js mesh with its simulated state. */
export function syncCarMesh(car) {
  if (!car.mesh) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  const spin = car.speed * 0.5;
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += spin * 0.016;
  if (car.police && car.mesh.userData.lightBar) {
    const mat = car.mesh.userData.lightBar.material;
    const on = Math.floor(car.siren * 4) % 2 === 0;
    mat.emissive.setHex(on ? 0xff2020 : 0x2040ff);
    mat.color.setHex(on ? 0xd81e1e : 0x1e4fd8);
  }
}

/** Spawn the starting traffic and parked cars for a fresh world. */
export function populateCars(scene, city, rng, count) {
  const cars = [];
  let id = 0;
  // parked cars along the curbs
  const spots = city.parkingSpots.slice();
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = spots[i];
    spots[i] = spots[j];
    spots[j] = t;
  }
  const parkedCount = Math.min(26, spots.length);
  for (let i = 0; i < parkedCount; i += 1) {
    const s = spots[i];
    const model = pick(rng, CAR_MODELS);
    const car = createCar(id, model, s.x, s.z, s.yaw, { parked: true });
    car.mesh = makeCarMesh(model, {});
    scene.add(car.mesh);
    syncCarMesh(car);
    cars.push(car);
    id += 1;
  }
  // moving traffic
  for (let i = 0; i < count; i += 1) {
    const n = pick(rng, city.intersections);
    const model = pick(rng, CAR_MODELS);
    const lane = rng() < 0.5 ? -3.2 : 3.2;
    const car = createCar(id, model, n.x + range(rng, -4, 4), n.z + range(rng, -4, 4), range(rng, 0, Math.PI * 2), { traffic: true, lane });
    car.mesh = makeCarMesh(model, {});
    scene.add(car.mesh);
    retargetTraffic(car, city, rng);
    syncCarMesh(car);
    cars.push(car);
    id += 1;
  }
  return cars;
}

/** Add a police car near (but not on top of) the player. */
export function spawnPoliceCar(scene, city, rng, x, z, nextId) {
  const model = { name: 'Bay PD Interceptor', color: PALETTE.policeCar, speed: 1.08, accel: 1.1 };
  const angle = rng() * Math.PI * 2;
  const px = x + Math.sin(angle) * range(rng, 45, 70);
  const pz = z + Math.cos(angle) * range(rng, 45, 70);
  const clamped = clampToCity(px, pz);
  const car = createCar(nextId, model, clamped.x, clamped.z, angle, { police: true });
  car.mesh = makeCarMesh(model, { police: true });
  scene.add(car.mesh);
  syncCarMesh(car);
  return car;
}
