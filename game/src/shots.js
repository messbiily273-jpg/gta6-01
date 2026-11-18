// shots — the staged screenshot scenes behind ?shot=1..4 (with &seed=N).
// Each one sets the world to a fixed, seeded situation, plays the real rules
// forward for a fixed number of steps with a scripted input, and returns the
// screen to draw — so the frame is what real play looks like and the same
// seed always gives the same frame.
import { STEP } from './config.js';
import { spawnPoliceCar } from './vehicles.js';
import { enterCar } from './player.js';
import { commitCrime, showBanner, addFeed } from './state.js';
import { startMission } from './missions.js';
import { playerShoot } from './combat.js';

const IDLE = { axes: { f: 0, s: 0 }, sprint: false, jump: false, throttle: 0, steer: 0, fire: false, interact: false };

function simulate(G, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) G.stepWorld(STEP, input);
}

/** Set `G` to the named scene and return the screen to draw over it. */
export function stageShot(name, G) {
  const state = G.state;
  const city = G.city;
  const plaza = city.landmarks.plaza;
  const hotel = city.landmarks.hotel;

  if (name === 'drive') {
    // Chapter 2: Mara in the stolen coral convertible, two stars, Bay PD behind.
    startMission(state, G.ctx, 1);
    const car = state.missionCar;
    enterCar(state, car);
    // put the car ON a road, driving south, so it can actually run
    const roadX = city.roadsX[3];
    car.x = roadX;
    car.z = plaza.z - 40;
    car.yaw = 0;
    car.speed = 26;
    state.player.x = car.x;
    state.player.z = car.z;
    state.wanted = 2;
    state.heat = 100;
    state.lastCrimeAt = state.time;
    // police start well back on the same road so they chase without blocking the camera
    const cop1 = spawnPoliceCar(G.scene, city, state.rng, roadX - 3, plaza.z - 88, G.ctx.nextCarId());
    const cop2 = spawnPoliceCar(G.scene, city, state.rng, roadX + 3, plaza.z - 104, G.ctx.nextCarId());
    cop1.yaw = 0;
    cop2.yaw = 0;
    state.cars.push(cop1, cop2);
    state.phase = 'play';
    simulate(G, 3.5, { ...IDLE, throttle: 1, steer: 0 });
    return 'play';
  }

  if (name === 'combat') {
    // Chapter 3: the warehouse shootout, SMG out, Harbor Kings ahead.
    startMission(state, G.ctx, 2);
    const w = city.landmarks.warehouse;
    state.player.x = w.x + 2;
    state.player.z = w.z + 16;
    state.player.yaw = Math.PI;
    state.player.health = 82;
    state.camera.yaw = Math.PI;
    state.camera.pitch = 0.22;
    state.wanted = 1;
    state.heat = 100;
    state.lastCrimeAt = state.time;
    state.phase = 'play';
    // one aimed shot for the tracer + hit marker
    const e0 = state.enemies[0];
    if (e0) {
      const origin = { x: state.player.x, y: 1.5, z: state.player.z };
      const dx = e0.x - origin.x;
      const dz = e0.z - origin.z;
      const d = Math.hypot(dx, dz) || 1;
      playerShoot(state, origin, { x: dx / d, y: 0, z: dz / d });
    }
    simulate(G, 2.5, { ...IDLE, fire: false });
    return 'play';
  }

  if (name === 'pier') {
    // The payoff: Mara on the sand at Pier 9, facing the pier and the sea.
    const pier = city.landmarks.pier;
    state.player.x = pier.x;
    state.player.z = pier.z - 16;
    state.player.yaw = 0;
    state.camera.yaw = 0;
    state.camera.pitch = 0.25;
    state.money = 2450;
    state.wanted = 0;
    state.heat = 0;
    state.objective = 'Story complete — free roam Solmara Bay.';
    state.storyComplete = true;
    state.missionIndex = 5;
    showBanner(state, 'MISSION COMPLETE', 'Chapter 5 — The Tide Job  ·  +$1,500', 60);
    addFeed(state, 'Story complete! +$1,500');
    state.phase = 'play';
    simulate(G, 2, IDLE);
    return 'play';
  }

  // default: 'start' — the title screen over the plaza and the Grand Solmara.
  G.shotCam = {
    pos: [plaza.x - 55, 46, plaza.z + 95],
    look: [hotel.x, 26, hotel.z],
  };
  state.phase = 'title';
  simulate(G, 6, IDLE);
  return 'title';
}
