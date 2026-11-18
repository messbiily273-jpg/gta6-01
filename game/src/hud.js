// hud — the DOM overlay (money, health, wanted stars, objective, speed,
// prompts, banners, feed) and the 2D canvas minimap. No images: stars and
// icons are text and canvas shapes.
import { CITY } from './config.js';

export function buildHud() {
  const root = document.getElementById('hud');
  const el = {};
  const ids = ['money', 'clock', 'objective', 'stars', 'healthfill', 'healthtxt', 'speed', 'carname', 'prompt', 'banner', 'bannertitle', 'bannersub', 'feed', 'crosshair', 'hitmark', 'vignette', 'minimap', 'missionlabel'];
  for (const id of ids) el[id] = document.getElementById(id);
  el.minimapCtx = el.minimap.getContext('2d');
  return { root, el };
}

function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function updateHud(hud, state, city) {
  const el = hud.el;
  const p = state.player;
  el.money.textContent = fmtMoney(state.money);
  el.clock.textContent = fmtClock(state.clockMinutes);
  el.missionlabel.textContent = state.storyComplete ? 'FREE ROAM' : 'MISSION ' + (state.missionIndex + 1) + ' / 5';
  el.objective.textContent = state.objective;
  // wanted stars
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
  el.stars.textContent = stars;
  el.stars.style.color = state.wanted >= 4 ? '#ff5340' : state.wanted >= 2 ? '#ffb02e' : '#e8e4da';
  // health
  const hp = Math.max(0, Math.round(p.health));
  el.healthfill.style.width = hp + '%';
  el.healthfill.style.background = hp > 50 ? '#37c8a5' : hp > 25 ? '#ffb02e' : '#ff5340';
  el.healthtxt.textContent = hp + ' HP  ·  ' + (p.weapon === 'fists' ? 'Fists' : p.weapon.toUpperCase() + ' ' + (p.ammo[p.weapon] ?? 0));
  // driving
  if (p.car) {
    const kmh = Math.abs(Math.round(p.car.speed * 3.6));
    el.speed.textContent = kmh;
    el.carname.textContent = p.car.model.name;
    el.speed.style.display = 'block';
    el.carname.style.display = 'block';
  } else {
    el.speed.style.display = 'none';
    el.carname.style.display = 'none';
  }
  // prompt
  el.prompt.textContent = state.message || '';
  // banner
  if (state.banner && state.time < state.banner.until) {
    el.banner.style.opacity = '1';
    el.bannertitle.textContent = state.banner.title;
    el.bannersub.textContent = state.banner.sub;
  } else {
    el.banner.style.opacity = '0';
  }
  // feed
  el.feed.innerHTML = state.feed.map((f) => '<div>' + f.replace(/</g, '&lt;') + '</div>').join('');
  // hurt vignette
  el.vignette.style.opacity = String(Math.min(0.85, p.hurtFlash * 1.4 + (p.health < 30 ? 0.35 : 0)));
  // crosshair only on foot with a gun
  el.crosshair.style.display = p.onFoot && p.weapon !== 'fists' ? 'block' : 'none';
  drawMinimap(hud, state, city);
}

function drawMinimap(hud, state, city) {
  const ctx = hud.el.minimapCtx;
  const size = 190;
  const half = CITY.half + 10;
  const scale = size / (half * 2);
  const px = (x) => (x + half) * scale;
  const pz = (z) => (z + half) * scale;
  ctx.clearRect(0, 0, size, size);
  // sea + sand
  ctx.fillStyle = '#1e7fa8';
  ctx.fillRect(0, pz(CITY.half), size, size - pz(CITY.half));
  ctx.fillStyle = '#e8cf9a';
  ctx.fillRect(0, pz(CITY.half), size, pz(CITY.half + 40) - pz(CITY.half));
  // city ground
  ctx.fillStyle = '#23242a';
  ctx.fillRect(0, 0, size, pz(CITY.half));
  // roads
  ctx.strokeStyle = '#55565e';
  ctx.lineWidth = 5;
  for (const rx of city.roadsX) {
    ctx.beginPath();
    ctx.moveTo(px(rx), 0);
    ctx.lineTo(px(rx), pz(CITY.half));
    ctx.stroke();
  }
  for (const rz of city.roadsZ) {
    ctx.beginPath();
    ctx.moveTo(0, pz(rz));
    ctx.lineTo(size, pz(rz));
    ctx.stroke();
  }
  // buildings
  ctx.fillStyle = '#3a3b42';
  for (const c of city.colliders) {
    ctx.fillRect(px(c.minX), pz(c.minZ), (c.maxX - c.minX) * scale, (c.maxZ - c.minZ) * scale);
  }
  const p = state.player;
  // waypoint
  if (state.waypoint) {
    const wx = px(state.waypoint.x);
    const wy = pz(state.waypoint.z);
    ctx.fillStyle = '#ffc21c';
    ctx.beginPath();
    ctx.moveTo(wx, wy - 7);
    ctx.lineTo(wx + 6, wy + 5);
    ctx.lineTo(wx - 6, wy + 5);
    ctx.closePath();
    ctx.fill();
  }
  // traffic dots
  ctx.fillStyle = '#c8c8c8';
  for (const car of state.cars) {
    if (car.police) continue;
    ctx.fillRect(px(car.x) - 1.5, pz(car.z) - 1.5, 3, 3);
  }
  // police
  ctx.fillStyle = '#4a86ff';
  for (const car of state.cars) {
    if (!car.police) continue;
    ctx.beginPath();
    ctx.arc(px(car.x), pz(car.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // enemies
  ctx.fillStyle = '#ff5340';
  for (const e of state.enemies) {
    if (e.state === 'down') continue;
    ctx.beginPath();
    ctx.arc(px(e.x), pz(e.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // player arrow
  const yaw = p.onFoot ? p.yaw : (p.car ? p.car.yaw : 0);
  ctx.save();
  ctx.translate(px(p.x), pz(p.z));
  ctx.rotate(-yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
