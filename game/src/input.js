// Keyboard + mouse input for Solmarina. Tracks held keys, edge-triggered
// presses (consumed once per frame), mouse drag deltas for the orbit
// camera, and pointer lock when the player clicks into the game.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    dragging: false,
    locked: false,
    wheel: 0,
    clicked: false, // left mouse button pressed this frame (for shooting)
  };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'turnLeft',
    KeyD: 'right', ArrowRight: 'turnRight',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'jump',
    KeyE: 'interact',
    KeyF: 'punch',
    KeyP: 'pause',
    Escape: 'escape',
    KeyM: 'mute',
  };

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (action) {
      if (!input.keys.has(action)) input.pressed.add(action);
      input.keys.add(action);
      if (e.code === 'Space') e.preventDefault();
    }
    // Block browser shortcuts that would steal the game.
    if (e.code === 'Tab') e.preventDefault();
  }

  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) input.keys.delete(action);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    input.mouseDown = true;
    input.dragging = true;
    input.clicked = true;
    input.lastX = e.clientX;
    input.lastY = e.clientY;
  }

  function onMouseUp(e) {
    if (e.button !== 0) return;
    input.mouseDown = false;
    input.dragging = false;
  }

  function onMouseMove(e) {
    if (input.locked) {
      input.mouseDX += e.movementX || 0;
      input.mouseDY += e.movementY || 0;
      return;
    }
    if (input.dragging && input.lastX !== undefined) {
      input.mouseDX += e.clientX - input.lastX;
      input.mouseDY += e.clientY - input.lastY;
      input.lastX = e.clientX;
      input.lastY = e.clientY;
    }
  }

  function onWheel(e) {
    input.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }

  function onLockChange() {
    input.locked = document.pointerLockElement === canvas;
  }

  function onBlur() {
    input.keys.clear();
    input.pressed.clear();
    input.mouseDown = false;
    input.dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.requestLock = function requestLock() {
    try {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    } catch (err) {
      // Pointer lock is optional: drag-to-orbit always works.
    }
  };

  input.releaseLock = function releaseLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (err) { /* already unlocked */ }
  };

  // True only on the frame the key went down.
  input.wasPressed = function wasPressed(action) {
    return input.pressed.has(action);
  };

  // Call at the end of each frame: edges and deltas live for one frame.
  input.endFrame = function endFrame() {
    input.pressed.clear();
    input.mouseDX = 0;
    input.mouseDY = 0;
    input.wheel = 0;
    input.clicked = false;
  };

  return input;
}
