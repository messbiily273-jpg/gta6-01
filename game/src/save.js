// save — localStorage persistence for money, mission progress and the
// player's spot in the city. Best-effort: a private window just skips it.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: state.money,
      missionIndex: state.missionIndex,
      storyComplete: state.storyComplete,
      stats: state.stats,
      player: {
        x: state.player.x,
        z: state.player.z,
        health: state.player.health,
        weapon: state.player.weapon,
        ammo: state.player.ammo,
      },
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage off */ }
}
