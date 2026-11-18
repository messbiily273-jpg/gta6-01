// The shared game state: one plain object every module reads and writes.
// The simulation never reads the renderer; rendering never writes the state
// except through the fixed-step update functions in main.js.
import { createRandom } from './random.js';
import { PLAYER, WANTED } from './config.js';

export const PHASE = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  DEAD: 'dead',
  BUSTED: 'busted',
  COMPLETE: 'complete',
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: PLAYER.punchDamage, rate: 0.35, range: 2.2, auto: false },
  pistol: { name: 'P9 Pistol', damage: 34, rate: 0.22, range: 60, auto: false },
  smg: { name: 'Ripper SMG', damage: 18, rate: 0.08, range: 45, auto: true },
};

export function createGameState(seed) {
  return {
    seed,
    rng: createRandom(seed),
    time: 0,
    clockMinutes: 9 * 60 + 24, // the story starts at 09:24, a bright morning
    money: 250,
    score: 0,
    phase: PHASE.TITLE,
    // --- player ---
    player: {
      x: 0, z: 120, y: 0, vy: 0, yaw: Math.PI, pitch: -0.12,
      vx: 0, vz: 0, onGround: true, health: PLAYER.maxHealth,
      onFoot: true, car: null, weapon: 'pistol', ammo: { pistol: 48, smg: 0 },
      fireCooldown: 0, hurtFlash: 0, dead: false, bustedTimer: 0,
    },
    // --- wanted / police heat ---
    wanted: 0,
    heat: 0, // 0..100 inside the current star level
    lastCrimeAt: -999,
    lastSeenAt: 0,
    // --- world actors (filled by city / traffic / people builders) ---
    cars: [], // traffic + parked + police cars
    peds: [],
    cops: [], // on-foot officers
    enemies: [], // armed mission hostiles
    pickups: [], // health + cash
    // --- missions ---
    missionIndex: 0,
    missionStep: 0,
    missionDone: false,
    storyComplete: false,
    missionTimer: 0,
    objective: 'Start the story from the menu.',
    waypoint: null, // {x, z, label} or null
    // --- run stats ---
    stats: { carsStolen: 0, pedsHit: 0, copsDodged: 0, missionsDone: 0, shotsFired: 0, hits: 0 },
    // --- transient feedback ---
    banner: null, // {title, sub, until}
    feed: [], // recent event lines for the HUD feed
    message: null, // centre-screen prompt, e.g. "E — Steal car"
    camera: { dist: 8.5, yaw: 0, pitch: 0.32, shake: 0 },
    muted: false,
  };
}

export function addFeed(state, text) {
  state.feed.unshift(text);
  if (state.feed.length > 5) state.feed.length = 5;
}

export function showBanner(state, title, sub, seconds) {
  state.banner = { title, sub: sub || '', until: state.time + (seconds || 3) };
}

/** Raise the wanted level by `stars` and stamp the crime time. */
export function commitCrime(state, stars, label) {
  if (stars <= 0) return;
  state.wanted = Math.min(WANTED.maxStars, state.wanted + stars);
  state.heat = 100;
  state.lastCrimeAt = state.time;
  state.lastSeenAt = state.time;
  if (label) addFeed(state, label + ' — wanted level ' + state.wanted);
}

/** Seconds since the last crime, used by the wanted decay rule. */
export function secondsSinceCrime(state) {
  return state.time - state.lastCrimeAt;
}
