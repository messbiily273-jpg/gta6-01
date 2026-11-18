// wanted — the heat system: stars rise with crime, police cars and foot
// officers spawn to match them, and the level falls once the player stays
// clean and out of sight.
import { WANTED } from './config.js';
import { spawnPoliceCar, stepPolice } from './vehicles.js';
import { spawnCop, stepCop } from './people.js';
import { addFeed } from './state.js';

/** Keep the police presence in line with the wanted level. */
export function updateWanted(state, ctx, dt) {
  const p = state.player;
  // decay: no crime for a while and no police nearby -> stars fall
  if (state.wanted > 0 && state.time - state.lastCrimeAt > WANTED.decayDelay) {
    const nearestPolice = nearestPoliceDist(state);
    if (nearestPolice > 55) {
      state.heat -= (dt / WANTED.decayInterval) * 100;
      if (state.heat <= 0) {
        state.wanted -= 1;
        state.heat = state.wanted > 0 ? 100 : 0;
        if (state.wanted === 0) {
          addFeed(state, 'You lost the cops.');
          clearPolice(state, ctx);
        } else {
          addFeed(state, 'Wanted level down to ' + state.wanted);
        }
      }
    } else {
      state.lastSeenAt = state.time;
    }
  }
  if (state.wanted === 0) return;

  // police cars: one per star, up to 5
  const wantCars = Math.min(state.wanted, 5);
  const haveCars = state.cars.filter((c) => c.police).length;
  if (haveCars < wantCars && state.time - (state.lastPoliceSpawn || 0) > 2.5) {
    state.lastPoliceSpawn = state.time;
    const car = spawnPoliceCar(ctx.scene, ctx.city, state.rng, p.x, p.z, ctx.nextCarId());
    state.cars.push(car);
  }
  // foot officers from 3 stars up
  if (state.wanted >= 3) {
    const wantCops = state.wanted - 2;
    const haveCops = state.cops.length;
    if (haveCops < wantCops && state.time - (state.lastCopSpawn || 0) > 4) {
      state.lastCopSpawn = state.time;
      const angle = state.rng() * Math.PI * 2;
      const cop = spawnCop(ctx.scene, p.x + Math.sin(angle) * 22, p.z + Math.cos(angle) * 22, state.rng, ctx.nextCopId());
      state.cops.push(cop);
    }
  }
  // step the chase
  for (const car of state.cars) {
    if (car.police) stepPolice(car, ctx.city, p.x, p.z, dt);
  }
  for (const cop of state.cops) {
    const busted = stepCop(cop, ctx.city, p.x, p.z, dt);
    if (busted && p.onFoot) {
      state.phase = 'busted';
      addFeed(state, 'Busted by the Bay PD.');
    }
  }
}

function nearestPoliceDist(state) {
  let best = Infinity;
  const p = state.player;
  for (const car of state.cars) {
    if (!car.police) continue;
    best = Math.min(best, Math.hypot(car.x - p.x, car.z - p.z));
  }
  for (const cop of state.cops) {
    best = Math.min(best, Math.hypot(cop.x - p.x, cop.z - p.z));
  }
  return best;
}

function clearPolice(state, ctx) {
  for (const car of state.cars) {
    if (car.police) ctx.scene.remove(car.mesh);
  }
  state.cars = state.cars.filter((c) => !c.police);
  for (const cop of state.cops) ctx.scene.remove(cop.mesh);
  state.cops = [];
}
