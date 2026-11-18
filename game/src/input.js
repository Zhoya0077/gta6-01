// Keyboard and mouse, with edge detection. Held keys are polled each
// frame; one-shot presses are consumed exactly once, so a tap never
// fires twice and holding E never re-triggers an interaction.

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
    const was = this.clicked;
    this.clicked = false;
    return was;
  }

  // Drag deltas are consumed by the camera once per frame; leftover
  // deltas never carry over, so a slow frame cannot spin the view.
  takeLook() {
    const yaw = this.yawDelta;
    const pitch = this.pitchDelta;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return { yaw, pitch };
  }

  // WASD collapsed to a -1..1 pair, screen-relative.
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

  // Shooting reads the same click flag; combat's cooldown keeps a
  // camera drag from ever becoming a burst of fire.
  consumeShot() {
    if (!this.clicked) return false;
    this.clicked = false;
    return true;
  }
}
