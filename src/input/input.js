// Input → commands. Client-only. Translates raw events into intent.
// Commands are tiny serializable objects so they can later be sent over the wire.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.commands = [];

    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.commands.push({ type: 'split' });
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.commands.push({ type: 'eject' });
    });
  }

  // Convert current mouse position into a world-space target relative to the camera.
  targetFor(centerX, centerY, camera, canvas) {
    const dx = (this.mouseX - canvas.width / 2) / camera.zoom;
    const dy = (this.mouseY - canvas.height / 2) / camera.zoom;
    return { x: centerX + dx, y: centerY + dy };
  }

  drainCommands() {
    const out = this.commands;
    this.commands = [];
    return out;
  }
}
