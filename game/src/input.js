// input — keyboard state, mouse look (pointer lock on click, drag fallback),
// and edge-triggered action flags the loop consumes once per frame.
export const ACTION = {
  CONFIRM: 1,
  PAUSE: 2,
  INTERACT: 4,
  WEAPON_NEXT: 8,
  MUTE: 16,
};

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, down: false, clicked: false };
  let actions = 0;
  let locked = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') actions |= ACTION.CONFIRM;
    if (e.code === 'Escape' || e.code === 'KeyP') actions |= ACTION.PAUSE;
    if (e.code === 'KeyE') actions |= ACTION.INTERACT;
    if (e.code === 'KeyQ') actions |= ACTION.WEAPON_NEXT;
    if (e.code === 'KeyM') actions |= ACTION.MUTE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      if (!locked && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
      }
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }
  function onMouseMove(e) {
    if (locked) {
      mouse.dx += e.movementX;
      mouse.dy += e.movementY;
    } else if (mouse.down) {
      mouse.dx += e.movementX;
      mouse.dy += e.movementY;
    }
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    keys,
    mouse,
    isLocked() { return locked; },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeMouse() {
      const dx = mouse.dx;
      const dy = mouse.dy;
      mouse.dx = 0;
      mouse.dy = 0;
      return { dx, dy };
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    /** -1..1 forward/back, -1..1 left/right, from WASD + arrows. */
    moveAxes() {
      let f = 0;
      let s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      return { f, s };
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    jump() {
      return keys.has('Space');
    },
  };
}
