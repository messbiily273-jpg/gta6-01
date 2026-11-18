// missions — "The Tide Job", a five-chapter original story set in Solmara Bay.
// Mara Voss, a courier who owes the Harbor Kings, works off her debt one job
// at a time. Each mission is a step machine: a step has an objective, a
// waypoint, an on-enter hook and a check that advances it.
import { addFeed, showBanner, commitCrime } from './state.js';
import { CAR_MODELS } from './vehicles.js';

function near(state, x, z, r) {
  return Math.hypot(state.player.x - x, state.player.z - z) < r;
}

function setWaypoint(state, x, z, label) {
  state.waypoint = { x, z, label };
}

const MISSIONS = [
  {
    id: 'first-delivery',
    title: 'Chapter 1 — First Delivery',
    briefing: 'Mara owes the Harbor Kings $2,000. Tonight she starts paying it back: pick up a package at Pier 9 and run it to The Rusty Anchor.',
    reward: 300,
    steps: [
      {
        text: 'Pick up the package at Pier 9',
        enter(state, ctx) { const p = ctx.city.landmarks.pier; setWaypoint(state, p.x, p.z, 'Pier 9'); },
        check(state, ctx) { return near(state, ctx.city.landmarks.pier.x, ctx.city.landmarks.pier.z, 7); },
        done(state) { addFeed(state, 'Package collected.'); },
      },
      {
        text: 'Deliver the package to The Rusty Anchor',
        enter(state, ctx) { const b = ctx.city.landmarks.bar; setWaypoint(state, b.x, b.z, 'The Rusty Anchor'); },
        check(state, ctx) { return near(state, ctx.city.landmarks.bar.x, ctx.city.landmarks.bar.z, 7); },
      },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Chapter 2 — Hot Wheels',
    briefing: 'The crew needs a fast car that cannot be traced. Steal the coral convertible parked by the plaza, then shake the Bay PD.',
    reward: 400,
    steps: [
      {
        text: 'Steal the marked coral convertible',
        enter(state, ctx) {
          const plaza = ctx.city.landmarks.plaza;
          const car = ctx.spawnMissionCar(CAR_MODELS[6], plaza.x + 26, plaza.z + 6, Math.PI / 2);
          state.missionCar = car;
          setWaypoint(state, car.x, car.z, 'Coral Convertible');
        },
        check(state) { return state.player.car === state.missionCar; },
        done(state, ctx) {
          commitCrime(state, 2, 'Car stolen — the Bay PD is on you');
          showBanner(state, 'WANTED — 2 STARS', 'Lose the cops', 3);
        },
      },
      {
        text: 'Lose the cops — get your wanted level to zero',
        enter(state, ctx) { setWaypoint(state, state.player.x, state.player.z, 'Lay low'); state.waypoint = null; },
        check(state) { return state.wanted === 0; },
      },
    ],
  },
  {
    id: 'harbor-kings',
    title: 'Chapter 3 — Harbor Kings',
    briefing: 'A rival crew is moving in on the warehouse. Clear the dealers out and take back the crate they stole.',
    reward: 600,
    steps: [
      {
        text: 'Clear the dealers at the Harbor Warehouse',
        enter(state, ctx) {
          const w = ctx.city.landmarks.warehouse;
          ctx.spawnEnemies(w.x - 10, w.z - 6, 4, 70);
          setWaypoint(state, w.x, w.z, 'Harbor Warehouse');
          state.player.weapon = 'smg';
          state.player.ammo.smg = Math.max(state.player.ammo.smg, 120);
        },
        check(state) { return state.enemies.length > 0 && state.enemies.every((e) => e.state === 'down'); },
        done(state, ctx) {
          const w = ctx.city.landmarks.warehouse;
          ctx.spawnPickup(w.x + 6, w.z + 10, 'health');
          setWaypoint(state, w.x + 6, w.z + 10, 'The crate');
          addFeed(state, 'Warehouse clear — grab the crate.');
        },
      },
      {
        text: 'Grab the crate',
        enter() {},
        check(state, ctx) {
          const w = ctx.city.landmarks.warehouse;
          return near(state, w.x + 6, w.z + 10, 3);
        },
      },
    ],
  },
  {
    id: 'deadline-run',
    title: 'Chapter 4 — Deadline Run',
    briefing: 'A buyer is waiting across town and the window is closing. Hit all four checkpoints before the clock runs out.',
    reward: 500,
    steps: [
      {
        text: 'Hit checkpoint 1 of 4 — 100 seconds',
        enter(state, ctx) {
          state.missionTimer = 100;
          state.checkpoints = ctx.pickCheckpoints(4);
          state.checkpointIndex = 0;
          const c = state.checkpoints[0];
          setWaypoint(state, c.x, c.z, 'Checkpoint 1');
        },
        check(state, ctx) {
          if (state.missionTimer <= 0) return false;
          const c = state.checkpoints[state.checkpointIndex];
          if (near(state, c.x, c.z, 9)) {
            state.checkpointIndex += 1;
            if (state.checkpointIndex >= state.checkpoints.length) return true;
            const n = state.checkpoints[state.checkpointIndex];
            setWaypoint(state, n.x, n.z, 'Checkpoint ' + (state.checkpointIndex + 1));
            state.objective = 'Hit checkpoint ' + (state.checkpointIndex + 1) + ' of 4';
            addFeed(state, 'Checkpoint ' + state.checkpointIndex + ' of 4 — keep going!');
          }
          return false;
        },
      },
    ],
  },
  {
    id: 'tide-job',
    title: 'Chapter 5 — The Tide Job',
    briefing: 'The big one. Steal the armored van from the warehouse yard, outrun a four-star response, and bring it home to the hideout. Do this and the debt is gone.',
    reward: 1500,
    steps: [
      {
        text: 'Steal the armored van at the warehouse',
        enter(state, ctx) {
          const w = ctx.city.landmarks.warehouse;
          ctx.spawnEnemies(w.x - 8, w.z + 4, 3, 80);
          const van = ctx.spawnMissionCar(CAR_MODELS[4], w.x + 18, w.z + 18, -Math.PI / 2);
          van.health = 400;
          state.missionCar = van;
          setWaypoint(state, van.x, van.z, 'Armored Van');
        },
        check(state) { return state.player.car === state.missionCar; },
        done(state) {
          commitCrime(state, 4, 'Van stolen — full Bay PD response');
          showBanner(state, 'WANTED — 4 STARS', 'Bring the van to the hideout', 3);
        },
      },
      {
        text: 'Deliver the van to the Hideout Garage',
        enter(state, ctx) { const h = ctx.city.landmarks.hideout; setWaypoint(state, h.x, h.z, 'Hideout Garage'); },
        check(state, ctx) { return state.player.car === state.missionCar && near(state, ctx.city.landmarks.hideout.x, ctx.city.landmarks.hideout.z, 9); },
      },
    ],
  },
];

export function missionCount() {
  return MISSIONS.length;
}

export function missionTitle(index) {
  return MISSIONS[index] ? MISSIONS[index].title : 'Free Roam';
}

export function startMission(state, ctx, index) {
  const m = MISSIONS[index];
  if (!m) {
    state.missionIndex = MISSIONS.length;
    state.objective = 'Story complete — free roam Solmara Bay.';
    state.waypoint = null;
    state.storyComplete = true;
    return;
  }
  state.missionIndex = index;
  state.missionStep = 0;
  state.missionDone = false;
  ctx.clearMissionActors();
  showBanner(state, m.title, m.briefing, 5);
  addFeed(state, m.title);
  enterStep(state, ctx);
}

function enterStep(state, ctx) {
  const m = MISSIONS[state.missionIndex];
  if (!m) return;
  const step = m.steps[state.missionStep];
  if (!step) return;
  state.objective = step.text;
  step.enter(state, ctx);
}

function completeMission(state, ctx) {
  const m = MISSIONS[state.missionIndex];
  state.money += m.reward;
  state.stats.missionsDone += 1;
  state.waypoint = null;
  state.missionDone = true;
  ctx.clearMissionActors();
  if (state.missionIndex === MISSIONS.length - 1) {
    state.storyComplete = true;
    showBanner(state, 'THE TIDE JOB — DONE', 'Debt paid. Solmara Bay is yours. +$' + m.reward, 6);
    state.objective = 'Story complete — free roam Solmara Bay.';
    addFeed(state, 'Story complete! +$' + m.reward);
  } else {
    showBanner(state, 'MISSION COMPLETE', m.title + ' — +$' + m.reward, 4);
    addFeed(state, 'Mission complete! +$' + m.reward);
    startMission(state, ctx, state.missionIndex + 1);
  }
}

/** Advance the current mission; call every fixed step while playing. */
export function updateMission(state, ctx, dt) {
  if (state.storyComplete) return;
  const m = MISSIONS[state.missionIndex];
  if (!m) return;
  if (state.missionTimer > 0) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      // deadline run failed: restart the mission
      addFeed(state, 'Too slow — the buyer walked. Try again.');
      showBanner(state, 'MISSION FAILED', 'Out of time — restarting the job', 3);
      ctx.clearMissionActors();
      startMission(state, ctx, state.missionIndex);
      return;
    }
    const mins = Math.max(0, Math.ceil(state.missionTimer));
    state.objective = m.steps[state.missionStep].text.replace(/— \d+ seconds$/, '') + ' — ' + mins + 's left';
  }
  const step = m.steps[state.missionStep];
  if (!step) return;
  let done = false;
  try {
    done = step.check(state, ctx);
  } catch {
    done = false;
  }
  if (!done) return;
  if (step.done) step.done(state, ctx);
  state.missionStep += 1;
  if (state.missionStep >= m.steps.length) {
    completeMission(state, ctx);
  } else {
    enterStep(state, ctx);
  }
}

/** Reset the current mission after death or a bust. */
export function restartMission(state, ctx) {
  state.wanted = 0;
  state.heat = 0;
  state.player.health = 100;
  state.player.dead = false;
  state.player.bustedTimer = 0;
  startMission(state, ctx, state.missionIndex);
}
