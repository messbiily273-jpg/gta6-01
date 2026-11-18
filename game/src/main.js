// main.js — boot, the fixed 60 Hz simulation, screens, camera, shooting and
// the ?shot= staging states and the ?selftest=1 harness.
// One job: wire the modules together and drive the game loop. Rendering
// reads the state; the simulation never reads the renderer.
import * as THREE from 'three';
import { STEP, CITY, PLAYER, PALETTE } from './config.js';
import { createRandom } from './random.js';
import { createGameState, PHASE, WEAPONS, addFeed, showBanner, commitCrime } from './state.js';
import { buildCity } from './city.js';
import { CAR_MODELS, makeCarMesh, createCar, stepCar, stepTraffic, syncCarMesh, populateCars, spawnPoliceCar } from './vehicles.js';
import { spawnPeds, stepPed, syncPersonMesh } from './people.js';
import { makePlayerMesh, stepOnFoot, syncPlayerMesh, nearestCar, enterCar, exitCar, stealCar } from './player.js';
import { playerShoot, stepEnemy, syncEnemyMesh, createTracerPool, fireTracer, updateTracers, spawnPickup, updatePickups, spawnEnemy } from './combat.js';
import { startMission, updateMission, restartMission } from './missions.js';
import { updateWanted } from './wanted.js';
import { createAudio } from './audio.js';
import { buildHud, updateHud } from './hud.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { createInput, ACTION } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 20;

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SELFTEST = params.get('selftest') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const SEED = Number.isInteger(seedParam) ? seedParam : (SHOT ? 1337 : Math.floor(Math.random() * 4294967296));

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createGameState(SEED);
const audio = createAudio();
const input = createInput(canvas);
const hud = buildHud();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(0xcfe4f2, 180, 700);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -280;
sun.shadow.camera.right = 280;
sun.shadow.camera.top = 280;
sun.shadow.camera.bottom = -280;
sun.shadow.camera.far = 600;
scene.add(sun);

const city = buildCity(scene, state.rng);
const playerMesh = makePlayerMesh();
scene.add(playerMesh);
state.cars = populateCars(scene, city, state.rng, 18);
state.peds = spawnPeds(scene, city, state.rng, 36);
const tracerPool = createTracerPool(scene, 24);

// a few pickups scattered at landmarks
state.pickups = [
  spawnPickup(scene, city.landmarks.plaza.x + 10, city.landmarks.plaza.z - 10, 'health'),
  spawnPickup(scene, city.landmarks.bar.x + 6, city.landmarks.bar.z + 4, 'ammo'),
  spawnPickup(scene, city.landmarks.hotel.x - 12, city.landmarks.hotel.z + 8, 'health'),
  spawnPickup(scene, city.landmarks.pier.x - 6, city.landmarks.pier.z - 4, 'ammo'),
  spawnPickup(scene, city.landmarks.warehouse.x + 12, city.landmarks.warehouse.z + 2, 'health'),
];

// --- mission context: what missions.js calls back into ---
let nextCarId = 1000;
let nextCopId = 2000;
let nextEnemyId = 3000;
const ctx = {
  scene,
  city,
  nextCarId() { nextCarId += 1; return nextCarId; },
  nextCopId() { nextCopId += 1; return nextCopId; },
  spawnEnemies(x, z, count, hp) {
    for (let i = 0; i < count; i += 1) {
      const e = spawnEnemy(scene, x + (state.rng() - 0.5) * 14, z + (state.rng() - 0.5) * 14, state.rng, nextEnemyId, hp);
      nextEnemyId += 1;
      state.enemies.push(e);
    }
  },
  spawnMissionCar(model, x, z, yaw) {
    const car = createCar(nextCarId, model, x, z, yaw, { parked: true });
    nextCarId += 1;
    car.mesh = makeCarMesh(model, {});
    scene.add(car.mesh);
    syncCarMesh(car);
    state.cars.push(car);
    return car;
  },
  spawnPickup(x, z, kind) {
    const pk = spawnPickup(scene, x, z, kind);
    state.pickups.push(pk);
    return pk;
  },
  clearMissionActors() {
    for (const e of state.enemies) scene.remove(e.mesh);
    state.enemies = [];
    if (state.missionCar && state.player.car !== state.missionCar) {
      // leave the car in the world: it is just a car now
      state.missionCar = null;
    }
  },
  pickCheckpoints(n) {
    const picks = [];
    const pool = city.intersections.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    for (const p of pool) {
      if (Math.hypot(p.x - state.player.x, p.z - state.player.z) < 60) continue;
      picks.push(p);
      if (picks.length >= n) break;
    }
    return picks.length ? picks : pool.slice(0, n);
  },
};

const G = {
  state, city, scene, camera, renderer, hud, audio, input, playerMesh, tracerPool, ctx,
  shotCam: null,
  stepWorld,
  render,
};

// player start: the hideout garage
state.player.x = city.spawn.x;
state.player.z = city.spawn.z;
state.player.yaw = city.spawn.yaw;
state.camera.yaw = city.spawn.yaw;

function announce(message) {
  status.textContent = message;
}

function showPanel(id) {
  for (const name of ['title', 'paused', 'dead', 'busted', 'complete']) {
    document.getElementById(name).classList.toggle('hidden', name !== id);
  }
}

function hidePanels() {
  for (const name of ['title', 'paused', 'dead', 'busted', 'complete']) {
    document.getElementById(name).classList.add('hidden');
  }
}

function newGame() {
  clearSave();
  // keep the living world (traffic, pedestrians, pickups); only the run state resets
  const keep = { cars: state.cars, peds: state.peds, cops: state.cops, pickups: state.pickups };
  for (const e of state.enemies) scene.remove(e.mesh);
  const fresh = createGameState(Math.floor(Math.random() * 4294967296));
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh, keep);
  state.player.x = city.spawn.x;
  state.player.z = city.spawn.z;
  state.player.yaw = city.spawn.yaw;
  state.camera.yaw = city.spawn.yaw;
  state.phase = PHASE.PLAY;
  hidePanels();
  audio.ensure();
  startMission(state, ctx, 0);
  announce('Chapter 1 — First Delivery. Pick up the package at Pier 9.');
}

function continueGame() {
  const data = loadSave();
  if (!data) return;
  state.money = data.money;
  state.stats = data.stats;
  state.player.x = data.player.x;
  state.player.z = data.player.z;
  state.player.health = data.player.health;
  state.player.weapon = data.player.weapon;
  state.player.ammo = data.player.ammo;
  state.phase = PHASE.PLAY;
  hidePanels();
  audio.ensure();
  if (data.storyComplete) {
    state.storyComplete = true;
    state.missionIndex = 5;
    state.objective = 'Story complete — free roam Solmara Bay.';
  } else {
    startMission(state, ctx, data.missionIndex);
  }
  announce('Welcome back to Solmara Bay.');
}

let lastMouseAt = -999;
let lastDamageAt = -999;
let lastAutosave = 0;
let completeShown = false;
let hitmarkUntil = 0;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** One fixed simulation step. `inp` is the scripted or live input state. */
function stepWorld(dt, inp) {
  const p = state.player;
  state.time += dt;
  state.clockMinutes += dt * 0.5;

  // ambient life runs on the title screen too, so the city feels alive
  for (const car of state.cars) {
    if (car.traffic) stepTraffic(car, city, state.rng, dt, state.cars);
    else if (!car.police) syncCarMesh(car);
  }
  const threat = state.wanted > 0 ? { x: p.x, z: p.z } : null;
  for (const ped of state.peds) stepPed(ped, city, state.rng, dt, threat);

  if (state.phase !== PHASE.PLAY) return;

  // --- mouse look ---
  const mouse = input.takeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) lastMouseAt = state.time;
  state.camera.yaw -= mouse.dx * 0.0032;
  state.camera.pitch = Math.max(0.08, Math.min(0.9, state.camera.pitch + mouse.dy * 0.0022));

  // --- player ---
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 1.6);
  if (p.onFoot) {
    stepOnFoot(state, city, inp.axes, inp.sprint, inp.jump, dt);
  } else if (p.car) {
    stepCar(p.car, city, inp.throttle, inp.steer, dt);
    // the player's position IS the car's while driving: the camera, the
    // police chase, the minimap and the ped checks all read p.x / p.z
    p.x = p.car.x;
    p.z = p.car.z;
    // camera follows the car when the mouse has been still
    if (state.time - lastMouseAt > 1.2) {
      state.camera.yaw += angleDiff(p.car.yaw, state.camera.yaw) * Math.min(1, 2.5 * dt);
    }
    // running over pedestrians is a crime
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - p.x, ped.z - p.z) < 2.3 && Math.abs(p.car.speed) > 4) {
        ped.state = 'down';
        state.stats.pedsHit += 1;
        p.car.speed *= 0.6;
        audio.crash();
        commitCrime(state, 1, 'Pedestrian hit');
      }
    }
    // bumping traffic
    for (const other of state.cars) {
      if (other === p.car || other.parked) continue;
      const d = Math.hypot(other.x - p.x, other.z - p.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = (other.x - p.x) / d;
        const nz = (other.z - p.z) / d;
        other.x += nx * push;
        other.z += nz * push;
        other.speed *= 0.5;
        p.car.speed *= 0.7;
      }
    }
  }

  // traffic cars can run the player down on foot
  if (p.onFoot && state.time - lastDamageAt > 1) {
    for (const car of state.cars) {
      if (car.parked) continue;
      if (Math.hypot(car.x - p.x, car.z - p.z) < 2.1 && Math.abs(car.speed) > 3) {
        p.health -= 14;
        p.hurtFlash = 0.6;
        lastDamageAt = state.time;
        addFeed(state, 'Hit by a car!');
        break;
      }
    }
  }

  // --- interact: steal / enter / exit ---
  if (inp.interact) {
    if (p.onFoot) {
      const car = nearestCar(state, 3.5);
      if (car) {
        audio.ensure();
        if (car.parked || car.traffic) stealCar(state, car);
        else enterCar(state, car);
        addFeed(state, 'Driving the ' + car.model.name);
      }
    } else {
      exitCar(state, city);
    }
  }

  // --- shooting ---
  if (inp.fire && p.onFoot) {
    if (p.weapon === 'fists') {
      // a punch: nearest hostile in front within reach
      const targets = [...state.enemies, ...state.peds].filter((t) => t.state !== 'down');
      for (const t of targets) {
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        const ang = Math.abs(angleDiff(Math.atan2(t.x - p.x, t.z - p.z), p.yaw));
        if (d < 2.4 && ang < 0.9) {
          if (t.hp !== undefined) {
            t.hp -= WEAPONS.fists.damage;
            if (t.hp <= 0) t.state = 'down';
          } else {
            t.state = 'down';
            commitCrime(state, 1, 'Pedestrian assaulted');
          }
          hitmarkUntil = state.time + 0.25;
          break;
        }
      }
      p.fireCooldown = WEAPONS.fists.rate;
    } else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = { x: p.x, y: p.y + 1.55, z: p.z };
      const from = new THREE.Vector3(origin.x, origin.y, origin.z);
      const to = from.clone().add(dir.clone().multiplyScalar(60));
      const hit = playerShoot(state, origin, { x: dir.x, y: dir.y, z: dir.z });
      audio.shot();
      if (hit && hit.kind !== 'none' && hit.kind !== 'empty') {
        const t = hit.target;
        to.set(t.x, 1.2, t.z);
        hitmarkUntil = state.time + 0.3;
        if (hit.kind === 'enemy' && t.state === 'down') audio.pickup();
      } else if (hit && hit.kind === 'none') {
        // a warning shot still draws heat
        commitCrime(state, 0, '');
      }
      fireTracer(tracerPool, from, to);
      if (p.weapon !== 'fists') state.camera.shake = 0.12;
    }
  }

  // --- enemies ---
  for (const e of state.enemies) {
    const before = e.lastShotAt;
    stepEnemy(e, state, dt);
    if (e.lastShotAt !== before) {
      audio.enemyShot();
      const from = new THREE.Vector3(e.x, 1.4, e.z);
      const to = new THREE.Vector3(p.x, 1.4, p.z);
      fireTracer(tracerPool, from, to);
    }
  }

  // --- wanted / police ---
  updateWanted(state, ctx, dt);
  if (state.phase === PHASE.BUSTED) {
    onBusted();
    return;
  }

  // --- missions ---
  updateMission(state, ctx, dt);
  if (state.storyComplete && !completeShown) {
    completeShown = true;
    state.phase = PHASE.COMPLETE;
    showPanel('complete');
    audio.missionComplete();
    input.unlock();
  }

  // --- pickups, tracers, health ---
  updatePickups(state, dt);
  updateTracers(tracerPool, dt);
  if (p.health < PLAYER.maxHealth && state.time - lastDamageAt > 8) {
    p.health = Math.min(PLAYER.maxHealth, p.health + 2 * dt);
  }
  if (p.health <= 0 && !p.dead) {
    p.dead = true;
    state.phase = PHASE.DEAD;
    showPanel('dead');
    audio.fail();
    input.unlock();
    announce('Mara is down. Retry the mission.');
  }
  // prompt
  if (p.onFoot) {
    const car = nearestCar(state, 3.5);
    state.message = car ? 'E — Steal the ' + car.model.name : '';
  } else {
    state.message = 'E — Get out  ·  WASD — Drive';
  }
  // engine + siren
  if (p.car) audio.setEngine(Math.min(1, Math.abs(p.car.speed) / 42));
  else audio.setEngine(0);
  audio.setSiren(state.wanted > 0);
  // autosave
  if (state.time - lastAutosave > AUTOSAVE_EVERY) {
    lastAutosave = state.time;
    saveGame(state);
  }
  state.camera.shake = Math.max(0, state.camera.shake - dt);
}

function onBusted() {
  state.money = Math.max(0, state.money - 200);
  showPanel('busted');
  audio.fail();
  input.unlock();
  announce('Busted. Bail $200.');
}

/** Sync every mesh with the simulated state, place the camera, paint the HUD. */
function render() {
  const p = state.player;
  syncPlayerMesh(playerMesh, state);
  for (const car of state.cars) syncCarMesh(car);
  for (const ped of state.peds) syncPersonMesh(ped);
  for (const cop of state.cops) syncPersonMesh(cop);
  for (const e of state.enemies) syncEnemyMesh(e);

  // camera
  if (G.shotCam) {
    camera.position.set(G.shotCam.pos[0], G.shotCam.pos[1], G.shotCam.pos[2]);
    camera.lookAt(G.shotCam.look[0], G.shotCam.look[1], G.shotCam.look[2]);
  } else {
    const dist = p.car ? 11.5 : 8.5;
    const tx = p.x;
    const ty = p.y + 1.7;
    const tz = p.z;
    const cy = state.camera.yaw;
    const cp = state.camera.pitch;
    const shake = state.camera.shake || 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    camera.position.set(
      tx - Math.sin(cy) * Math.cos(cp) * dist + sx,
      Math.max(0.6, ty + Math.sin(cp) * dist) + sy,
      tz - Math.cos(cy) * Math.cos(cp) * dist,
    );
    camera.lookAt(tx + Math.sin(cy) * 3, ty - 0.4, tz + Math.cos(cy) * 3);
  }
  updateHud(hud, state, city);
  document.getElementById('hitmark').style.opacity = state.time < hitmarkUntil ? '1' : '0';
  renderer.render(scene, camera);
}

function liveInput() {
  const axes = input.moveAxes();
  const p = state.player;
  return {
    axes,
    sprint: input.sprint(),
    jump: input.jump(),
    throttle: p.car ? axes.f : 0,
    steer: p.car ? -axes.s : 0,
    fire: input.mouse.down,
    interact: false,
  };
}

function handleActions(actions) {
  if (actions & ACTION.MUTE) {
    audio.setMuted(!audio.isMuted());
    addFeed(state, audio.isMuted() ? 'Sound off' : 'Sound on');
  }
  if (actions & ACTION.WEAPON_NEXT) {
    const order = ['fists', 'pistol', 'smg'];
    const idx = order.indexOf(state.player.weapon);
    state.player.weapon = order[(idx + 1) % order.length];
    addFeed(state, 'Weapon: ' + WEAPONS[state.player.weapon].name);
  }
  if (state.phase === PHASE.TITLE) {
    if (actions & ACTION.CONFIRM) newGame();
    return;
  }
  if (state.phase === PHASE.PLAY) {
    if (actions & ACTION.PAUSE) {
      state.phase = PHASE.PAUSED;
      showPanel('paused');
      input.unlock();
      announce('Paused.');
    }
    return;
  }
  if (state.phase === PHASE.PAUSED) {
    if (actions & (ACTION.PAUSE | ACTION.CONFIRM)) {
      state.phase = PHASE.PLAY;
      hidePanels();
      announce('Playing.');
    }
  }
}

let acc = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  const actions = input.takeActions();
  handleActions(actions);
  // edge-triggered interact: apply it to the first step only, so one press
  // can never enter and immediately exit a car in the same frame
  let interactLeft = (actions & ACTION.INTERACT) !== 0;
  while (acc >= STEP) {
    const inp = liveInput();
    if (interactLeft) {
      inp.interact = true;
      interactLeft = false;
    }
    stepWorld(STEP, inp);
    acc -= STEP;
  }
  render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === PHASE.PLAY) {
    state.phase = PHASE.PAUSED;
    showPanel('paused');
    input.unlock();
  }
});

// --- buttons ---
document.getElementById('btnNew').addEventListener('click', () => newGame());
document.getElementById('btnContinue').addEventListener('click', () => continueGame());
document.getElementById('btnResume').addEventListener('click', () => {
  state.phase = PHASE.PLAY;
  hidePanels();
});
document.getElementById('btnQuit').addEventListener('click', () => {
  saveGame(state);
  state.phase = PHASE.TITLE;
  showPanel('title');
});
document.getElementById('btnRetry').addEventListener('click', () => {
  hidePanels();
  restartMission(state, ctx);
  state.player.x = city.spawn.x;
  state.player.z = city.spawn.z;
  state.player.car = null;
  state.player.onFoot = true;
  state.phase = PHASE.PLAY;
});
document.getElementById('btnDeadTitle').addEventListener('click', () => {
  state.phase = PHASE.TITLE;
  showPanel('title');
});
document.getElementById('btnBustedRetry').addEventListener('click', () => {
  hidePanels();
  restartMission(state, ctx);
  state.player.x = city.spawn.x;
  state.player.z = city.spawn.z;
  state.player.car = null;
  state.player.onFoot = true;
  state.phase = PHASE.PLAY;
});
document.getElementById('btnFreeRoam').addEventListener('click', () => {
  hidePanels();
  state.phase = PHASE.PLAY;
});

if (hasSave()) document.getElementById('btnContinue').classList.remove('hidden');

// --- screenshot staging ---
function runShot(name) {
  const screen = stageShot(name, G);
  if (screen === 'title') showPanel('title');
  else hidePanels();
  let painted = 0;
  function paint() {
    render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// --- self-test harness: ?selftest=1 runs scripted checks, no interaction ---
function runSelfTest() {
  const results = [];
  function check(name, fn) {
    try {
      const ok = fn();
      results.push({ name, ok: !!ok });
    } catch (err) {
      results.push({ name, ok: false, error: String(err && err.message ? err.message : err) });
    }
  }
  check('city has colliders', () => city.colliders.length > 50);
  check('traffic and parked cars exist', () => state.cars.length >= 30);
  check('pedestrians exist', () => state.peds.length >= 20);
  check('landmarks exist', () => Object.keys(city.landmarks).length >= 6);
  check('mission starts', () => {
    startMission(state, ctx, 0);
    return state.objective.length > 0 && state.waypoint !== null;
  });
  check('steal car raises wanted', () => {
    const car = state.cars.find((c) => c.parked);
    const before = state.wanted;
    stealCar(state, car);
    const raised = state.wanted > before && state.player.car === car;
    exitCar(state, city);
    return raised;
  });
  check('shooting damages an enemy', () => {
    const e = spawnEnemy(scene, state.player.x + 6, state.player.z, state.rng, 9001, 60);
    state.enemies.push(e);
    const hp = e.hp;
    const origin = { x: state.player.x, y: 1.5, z: state.player.z };
    playerShoot(state, origin, { x: 1, y: 0, z: 0 });
    return e.hp < hp;
  });
  check('police spawn when wanted', () => {
    commitCrime(state, 2, '');
    state.time = 30;
    state.lastPoliceSpawn = 0;
    updateWanted(state, ctx, 3);
    return state.cars.some((c) => c.police);
  });
  check('save and load round-trip', () => {
    state.money = 777;
    saveGame(state);
    const data = loadSave();
    return data && data.money === 777;
  });
  check('seeded rng is deterministic', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    return a() === b() && a() === b() && a() === b();
  });
  check('renderer paints a frame', () => {
    render();
    return true;
  });
  const passed = results.filter((r) => r.ok).length;
  window.__selftest = { passed, failed: results.length - passed, results };
  document.title = 'SELFTEST ' + passed + '/' + results.length;
}

if (SHOT) {
  runShot(SHOT);
} else if (SELFTEST) {
  state.phase = PHASE.PLAY;
  hidePanels();
  runSelfTest();
} else {
  showPanel('title');
  announce('Solmara Heat. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}
