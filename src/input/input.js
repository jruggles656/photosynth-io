// Input → commands. Client-only. Translates raw events into intent.
// Commands are tiny serializable objects so they can later be sent over the wire.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.commands = [];
    this.brake = false; // hold S to root in place and photosynthesize
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.enabled = true; // false while menus are up

    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.commands.push({ type: 'split' });
      } else if (e.code === 'KeyW') {
        this.commands.push({ type: 'eject' });
      } else if (e.code === 'KeyS') {
        this.brake = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyS') this.brake = false;
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.enabled) this.commands.push({ type: 'eject' });
    });
  }

  // Floating joystick: touch anywhere on the left 60% of the screen anchors a stick.
  // Release = stop = photosynthesize, which fits the game's core loop.
  bindTouch({ joyEl, thumbEl, splitBtn, ejectBtn }) {
    const MAX = 56;
    let touchId = null;
    let anchorX = 0;
    let anchorY = 0;

    const onMove = (touch) => {
      let dx = touch.clientX - anchorX;
      let dy = touch.clientY - anchorY;
      const len = Math.hypot(dx, dy);
      if (len > MAX) {
        dx = (dx / len) * MAX;
        dy = (dy / len) * MAX;
      }
      this.joystick.dx = dx / MAX;
      this.joystick.dy = dy / MAX;
      thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled || touchId !== null) return;
      const touch = e.changedTouches[0];
      if (touch.clientX > window.innerWidth * 0.62) return;
      e.preventDefault();
      touchId = touch.identifier;
      anchorX = touch.clientX;
      anchorY = touch.clientY;
      this.joystick.active = true;
      joyEl.style.display = 'block';
      joyEl.style.left = `${anchorX}px`;
      joyEl.style.top = `${anchorY}px`;
      onMove(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          e.preventDefault();
          onMove(touch);
        }
      }
    }, { passive: false });

    const end = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          touchId = null;
          this.joystick.active = false;
          this.joystick.dx = 0;
          this.joystick.dy = 0;
          joyEl.style.display = 'none';
          thumbEl.style.transform = 'translate(0,0)';
        }
      }
    };
    this.canvas.addEventListener('touchend', end);
    this.canvas.addEventListener('touchcancel', end);

    splitBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.enabled) this.commands.push({ type: 'split' });
    }, { passive: false });
    ejectBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.enabled) this.commands.push({ type: 'eject' });
    }, { passive: false });
  }

  // Convert current input into a world-space target relative to the camera.
  targetFor(centerX, centerY, camera) {
    if (this.brake) return { x: centerX, y: centerY };
    if (this.joystick.active) {
      const mag = Math.hypot(this.joystick.dx, this.joystick.dy);
      if (mag < 0.12) return { x: centerX, y: centerY };
      return {
        x: centerX + this.joystick.dx * 420,
        y: centerY + this.joystick.dy * 420,
      };
    }
    const dx = (this.mouseX - window.innerWidth / 2) / camera.zoom;
    const dy = (this.mouseY - window.innerHeight / 2) / camera.zoom;
    return { x: centerX + dx, y: centerY + dy };
  }

  drainCommands() {
    const out = this.commands;
    this.commands = [];
    return out;
  }
}
