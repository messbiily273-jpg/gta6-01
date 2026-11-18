// combat — hitscan shooting, armed mission hostiles, tracers, muzzle
// flashes and pickups. Enemies are code-built figures like the pedestrians.
import * as THREE from 'three';
import { WEAPONS, commitCrime, addFeed } from './state.js';
import { range, pick } from './random.js';
import { makePersonMesh } from './people.js';

export function createEnemy(id, x, z, rng, hp) {
  return {
    id, x, z, yaw: range(rng, 0, Math.PI * 2),
    hp: hp || 60,
    maxHp: hp || 60,
    state: 'guard', // guard | fight | down
    fireCooldown: range(rng, 0.5, 1.5),
    walkPhase: rng() * Math.PI * 2,
    mesh: null,
  };
}

export function spawnEnemy(scene, x, z, rng, nextId, hp) {
  const e = createEnemy(nextId, x, z, rng, hp);
  e.mesh = makePersonMesh(0x2a2f3a, pick(rng, [0xc98d64, 0x8a5a3a]), { hair: 0x111111 });
  // a red bandana marks the Harbor Kings crew
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xd81e1e, roughness: 0.9 }),
  );
  band.position.y = 1.82;
  e.mesh.add(band);
  // a visible gun in the right hand
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.42, 0.95, 0.25);
  e.mesh.add(gun);
  scene.add(e.mesh);
  return e;
}

/**
 * Fire the player's current weapon from the camera toward the aim point.
 * Returns the hit result: {kind: 'enemy'|'car'|'ped'|'none', target}.
 * Hitscan against actors only (buildings block via a cheap raycast against
 * the collider list in the XZ plane is skipped: range + line of sight is
 * approximated by distance and the enemy's own facing checks).
 */
export function playerShoot(state, origin, dir) {
  const p = state.player;
  const w = WEAPONS[p.weapon];
  if (p.fireCooldown > 0) return null;
  p.fireCooldown = w.rate;
  state.stats.shotsFired += 1;
  if (p.weapon !== 'fists') {
    if (p.ammo[p.weapon] <= 0) {
      addFeed(state, 'Out of ammo — find a pickup.');
      return { kind: 'empty' };
    }
    p.ammo[p.weapon] -= 1;
  }
  // find the closest actor near the ray within range
  let best = null;
  let bestD = w.range;
  const candidates = [];
  for (const e of state.enemies) if (e.state !== 'down') candidates.push({ kind: 'enemy', t: e, x: e.x, z: e.z, y: 1.2, r: 0.9 });
  for (const ped of state.peds) if (ped.state !== 'down') candidates.push({ kind: 'ped', t: ped, x: ped.x, z: ped.z, y: 1.0, r: 0.8 });
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    candidates.push({ kind: 'car', t: car, x: car.x, z: car.z, y: 0.9, r: 2.2 });
  }
  for (const c of candidates) {
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const dz = c.z - origin.z;
    const along = dx * dir.x + dy * dir.y + dz * dir.z;
    if (along < 0 || along > bestD) continue;
    const px = origin.x + dir.x * along;
    const py = origin.y + dir.y * along;
    const pz = origin.z + dir.z * along;
    const miss = Math.hypot(c.x - px, c.y - py, c.z - pz);
    if (miss < c.r) {
      best = { kind: c.kind, target: c.t, dist: along };
      bestD = along;
    }
  }
  if (!best) return { kind: 'none' };
  state.stats.hits += 1;
  if (best.kind === 'enemy') {
    best.target.hp -= w.damage;
    if (best.target.hp <= 0) {
      best.target.state = 'down';
      best.target.mesh.rotation.x = -Math.PI / 2;
      state.money += 40;
      addFeed(state, 'Hostile down — +$40');
    }
  } else if (best.kind === 'ped') {
    best.target.state = 'down';
    commitCrime(state, 2, 'Pedestrian shot');
  } else if (best.kind === 'car') {
    best.target.health -= w.damage;
    if (best.target.health <= 0 && best.target.police) {
      addFeed(state, 'Police car disabled!');
    }
  }
  return best;
}

/** One enemy step: stand guard, or fight the player when close / alerted. */
export function stepEnemy(e, state, dt) {
  if (e.state === 'down') return;
  const p = state.player;
  const dist = Math.hypot(p.x - e.x, p.z - e.z);
  const alerted = dist < 30 || state.wanted > 0;
  if (!alerted) {
    e.state = 'guard';
    return;
  }
  e.state = 'fight';
  const want = Math.atan2(p.x - e.x, p.z - e.z);
  let diff = want - e.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  e.yaw += Math.max(-3.5 * dt, Math.min(3.5 * dt, diff));
  // keep a fighting distance
  if (dist > 14) {
    e.x += Math.sin(e.yaw) * 3.4 * dt;
    e.z += Math.cos(e.yaw) * 3.4 * dt;
  } else if (dist < 6) {
    e.x -= Math.sin(e.yaw) * 2 * dt;
    e.z -= Math.cos(e.yaw) * 2 * dt;
  }
  e.walkPhase += dt * 8;
  e.fireCooldown -= dt;
  if (e.fireCooldown <= 0 && dist < 34 && Math.abs(diff) < 0.5) {
    e.fireCooldown = range(state.rng, 0.7, 1.4);
    // enemy fire: inaccurate, damage scales with closeness
    const hitChance = Math.max(0.08, 0.45 - dist * 0.01);
    if (state.rng() < hitChance && p.onFoot) {
      p.health -= range(state.rng, 5, 11);
      p.hurtFlash = 0.5;
      addFeed(state, 'You are taking fire!');
    }
    e.lastShotAt = state.time;
  }
}

/** Sync an enemy mesh with its simulated state. */
export function syncEnemyMesh(e) {
  if (!e.mesh) return;
  e.mesh.position.set(e.x, 0, e.z);
  e.mesh.rotation.y = e.yaw;
  if (e.state === 'down') {
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.3;
    return;
  }
  e.mesh.rotation.x = 0;
  e.mesh.position.y = Math.abs(Math.sin(e.walkPhase)) * 0.05;
  const swing = Math.sin(e.walkPhase) * 0.4;
  e.mesh.userData.legL.rotation.x = swing;
  e.mesh.userData.legR.rotation.x = -swing;
}

// --- tracers + muzzle flash (pure visual, pooled) ---

export function createTracerPool(scene, size) {
  const pool = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < size; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  return pool;
}

export function fireTracer(pool, from, to) {
  for (const t of pool) {
    if (t.life > 0) continue;
    t.life = 0.09;
    t.mesh.visible = true;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    return;
  }
}

export function updateTracers(pool, dt) {
  for (const t of pool) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.mesh.visible = false;
  }
}

// --- pickups ---

export function spawnPickup(scene, x, z, kind) {
  const group = new THREE.Group();
  const color = kind === 'health' ? 0x37c8a5 : 0xffc21c;
  const boxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 }),
  );
  boxMesh.position.y = 0.9;
  boxMesh.castShadow = true;
  group.add(boxMesh);
  group.position.set(x, 0, z);
  scene.add(group);
  return { kind, x, z, mesh: group, taken: false, spin: 0 };
}

export function updatePickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    pk.spin += dt * 2;
    pk.mesh.rotation.y = pk.spin;
    pk.mesh.position.y = Math.sin(pk.spin * 1.4) * 0.12;
    if (Math.hypot(p.x - pk.x, p.z - pk.z) < 1.6) {
      pk.taken = true;
      pk.mesh.visible = false;
      if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + 50);
        addFeed(state, 'Health +50');
      } else {
        p.ammo.smg += 60;
        if (p.weapon === 'fists') p.weapon = 'smg';
        addFeed(state, 'SMG ammo +60');
      }
    }
  }
}
