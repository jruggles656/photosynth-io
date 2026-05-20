// Canvas rendering only. Reads world state; never writes to it.

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: world.width / 2, y: world.height / 2, zoom: 1 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  followPlayer(view) {
    if (!view) return;
    this.camera.x = view.x;
    this.camera.y = view.y;
    this.camera.zoom = Math.max(0.35, 1 - view.mass / 600);
  }

  draw() {
    const { ctx, canvas, camera, world } = this;
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Grid for spatial reference
    ctx.strokeStyle = '#15301a';
    ctx.lineWidth = 1;
    const step = 100;
    for (let x = 0; x <= world.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.height);
      ctx.stroke();
    }
    for (let y = 0; y <= world.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y);
      ctx.stroke();
    }

    // Pellets
    ctx.fillStyle = '#6ad06a';
    for (const p of world.pellets.values()) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blobs (sorted small-to-big so big ones cover small ones, classic agar look)
    const sorted = [...world.blobs.values()].sort((a, b) => a.mass - b.mass);
    for (const b of sorted) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      if (b.mass > 30) {
        ctx.fillStyle = '#0a0f0a';
        ctx.font = `${Math.max(10, b.radius * 0.4)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(b.mass), b.x, b.y);
      }
    }

    ctx.restore();
  }
}
