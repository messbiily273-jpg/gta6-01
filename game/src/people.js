// people — pedestrians who walk the sidewalks and flee from danger, and
// on-foot Bay PD officers who chase and try to bust the player.
// Figures are low-poly code-built people: no model files.
import * as THREE from 'three';
import { range, pick } from './random.js';
import { resolveCollisions, clampToCity, pointInCollider } from './city.js';

const SHIRT_COLORS = [0xe8e4da, 0x3a6fd8, 0xd8382c, 0x6a8f4a, 0xffc21c, 0xff7ad8, 0x8a6a48, 0x5a4a8a];
const SKIN_COLORS = [0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6a4a30];

export function makePersonMesh(shirt, skin, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: o.cop ? 0x14181f : 0x2a2f3a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  if (o.cop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x1e4fd8, roughness: 0.7 }));
    cap.position.y = 1.86;
    group.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: o.hair || 0x2a1e16, roughness: 1 }));
    hair.position.y = 1.72;
    group.add(hair);
  }
  const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.24);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.34, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.16, 0.34, 0);
  legR.castShadow = true;
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.4, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.4, 1.05, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export function createPed(id, x, z, yaw, rng) {
  return {
    id, x, z, yaw,
    speed: range(rng, 1.1, 1.9),
    target: null,
    state: 'walk', // walk | flee | down
    fear: 0,
    walkPhase: rng() * Math.PI * 2,
    shirt: pick(rng, SHIRT_COLORS),
    skin: pick(rng, SKIN_COLORS),
    mesh: null,
  };
}

export function spawnPeds(scene, city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const n = pick(rng, city.intersections);
    const x = n.x + range(rng, -30, 30);
    const z = n.z + range(rng, -30, 30);
    if (pointInCollider(city, x, z)) continue;
    const ped = createPed(i, x, z, range(rng, 0, Math.PI * 2), rng);
    ped.mesh = makePersonMesh(ped.shirt, ped.skin, {});
    scene.add(ped.mesh);
    peds.push(ped);
  }
  return peds;
}

function pickSidewalkTarget(ped, city, rng) {
  const n = pick(rng, city.intersections);
  return { x: n.x + range(rng, -34, 34), z: n.z + range(rng, -34, 34) };
}

/** One pedestrian step: stroll the sidewalks, or run from a threat. */
export function stepPed(ped, city, rng, dt, threat) {
  if (ped.state === 'down') return;
  let speed = ped.speed;
  let tx;
  let tz;
  if (threat && Math.hypot(threat.x - ped.x, threat.z - ped.z) < 26) {
    ped.state = 'flee';
    ped.fear = 3;
  }
  if (ped.state === 'flee') {
    ped.fear -= dt;
    if (ped.fear <= 0) ped.state = 'walk';
    if (threat) {
      const dx = ped.x - threat.x;
      const dz = ped.z - threat.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 20;
      tz = ped.z + (dz / d) * 20;
      speed = 4.6;
    }
  }
  if (ped.state === 'walk') {
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 2) {
      ped.target = pickSidewalkTarget(ped, city, rng);
    }
    tx = ped.target.x;
    tz = ped.target.z;
  }
  const want = Math.atan2(tx - ped.x, tz - ped.z);
  let diff = want - ped.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.yaw += Math.max(-3 * dt, Math.min(3 * dt, diff));
  const nx = ped.x + Math.sin(ped.yaw) * speed * dt;
  const nz = ped.z + Math.cos(ped.yaw) * speed * dt;
  const hit = resolveCollisions(city, nx, nz, 0.5);
  const clamped = clampToCity(hit.x, hit.z);
  ped.x = clamped.x;
  ped.z = clamped.z;
  ped.walkPhase += dt * speed * 3.2;
}

export function syncPersonMesh(ped) {
  if (!ped.mesh) return;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.yaw;
  if (ped.state === 'down') {
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
    return;
  }
  ped.mesh.rotation.x = 0;
  ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.05;
  const swing = Math.sin(ped.walkPhase) * 0.5;
  ped.mesh.userData.legL.rotation.x = swing;
  ped.mesh.userData.legR.rotation.x = -swing;
  ped.mesh.userData.armL.rotation.x = -swing * 0.8;
  ped.mesh.userData.armR.rotation.x = swing * 0.8;
}

// --- on-foot police ---

export function createCop(id, x, z, rng) {
  return {
    id, x, z, yaw: 0,
    speed: 5.2,
    state: 'chase', // chase | bust
    bustTimer: 0,
    walkPhase: rng() * Math.PI * 2,
    mesh: null,
  };
}

export function spawnCop(scene, x, z, rng, nextId) {
  const cop = createCop(nextId, x, z, rng);
  cop.mesh = makePersonMesh(0x1e4fd8, pick(rng, SKIN_COLORS), { cop: true });
  scene.add(cop.mesh);
  return cop;
}

/** A foot officer chases the player; close contact for 2.5 s means busted. */
export function stepCop(cop, city, playerX, playerZ, dt) {
  const dist = Math.hypot(playerX - cop.x, playerZ - cop.z);
  if (dist < 2.2) {
    cop.bustTimer += dt;
    cop.state = 'bust';
  } else {
    cop.state = 'chase';
    cop.bustTimer = Math.max(0, cop.bustTimer - dt);
  }
  if (cop.state === 'chase') {
    const want = Math.atan2(playerX - cop.x, playerZ - cop.z);
    let diff = want - cop.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.yaw += Math.max(-4 * dt, Math.min(4 * dt, diff));
    const nx = cop.x + Math.sin(cop.yaw) * cop.speed * dt;
    const nz = cop.z + Math.cos(cop.yaw) * cop.speed * dt;
    const hit = resolveCollisions(city, nx, nz, 0.5);
    const clamped = clampToCity(hit.x, hit.z);
    cop.x = clamped.x;
    cop.z = clamped.z;
    cop.walkPhase += dt * 12;
  }
  return cop.bustTimer >= 2.5;
}
