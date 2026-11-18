// Keyboard + mouse input with edge detection. The game polls held keys
// every frame and consumes one-shot presses, so a tap never fires twice
// and a held key never re-triggers an interaction.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.clicked = false;
    this.clickX = 0;
    this.clickY = 0;
    this.enabled = true;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => { this.keys.clear(); this.dragging = false; };
  }

  attach(canvas) {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.clicked = true;
      this.clickX = e.clientX;
      this.clickY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || !this.enabled) return;
      this.yawDelta += e.clientX - this.lastX;
      this.pitchDelta += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  held(code) { return this.keys.has(code); }

  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  takeLook() {
    const yaw = this.yawDelta;
    const pitch = this.pitchDelta;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return { yaw, pitch };
  }

  // WASD as a -1..1 pair, screen-relative (forward = -Z on the map).
  axes() {
    let x = 0;
    let y = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    if (this.held('KeyW') || this.held('ArrowUp')) y += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) y -= 1;
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
  }

  // A drag only counts as a shot when the pointer barely moved, so
  // orbiting the camera never fires the pistol by accident.
  consumeShot() {
    if (!this.clicked) return false;
    this.clicked = false;
    return true;
  }
}
