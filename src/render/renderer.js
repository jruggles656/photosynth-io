// Canvas rendering only. Reads world state; never writes to it.

const POWERUP_STYLE = {
  speed:  { color: '#ffd24a', glyph: '⚡' },
  shield: { color: '#5fa0ff', glyph: '🛡' },
  vision: { color: '#ffffff', glyph: '👁' },
  magnet: { color: '#ff7a5a', glyph: '🧲' },
  ghost:  { color: '#cfcfff', glyph: '👻' },
  bloom:  { color: '#ff7adf', glyph: '🌸' },
  wilt:   { color: '#7a4a8a', glyph: '🥀' },
};

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

    // Power-ups (glowing)
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 300));
    for (const pu of world.powerUps.values()) {
      const style = POWERUP_STYLE[pu.type] || { color: '#fff', glyph: '?' };
      ctx.save();
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 20 * pulse;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#0a0f0a';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.glyph, pu.x, pu.y);
    }

    // Blobs (sorted small-to-big so big ones cover small ones, classic agar look)
    const now = Date.now();
    const sorted = [...world.blobs.values()].sort((a, b) => a.mass - b.mass);
    for (const b of sorted) {
      this.drawBlob(b, now);
    }

    ctx.restore();
  }

  drawBlob(b, now) {
    const ctx = this.ctx;
    const ghost = b.effects.ghost && b.effects.ghost > now;
    const bloom = b.effects.bloom && b.effects.bloom > now;
    const wilt = b.effects.wilt && b.effects.wilt > now;
    const shield = b.effects.shield && b.effects.shield > now;
    const speed = b.effects.speed && b.effects.speed > now;
    const magnet = b.effects.magnet && b.effects.magnet > now;
    const vision = b.effects.vision && b.effects.vision > now;

    ctx.save();
    if (ghost) ctx.globalAlpha = 0.45;

    // Aura halos
    if (bloom) {
      ctx.shadowColor = '#ff7adf';
      ctx.shadowBlur = 40;
    } else if (wilt) {
      ctx.shadowColor = '#7a4a8a';
      ctx.shadowBlur = 35;
    } else if (magnet) {
      ctx.shadowColor = '#ff7a5a';
      ctx.shadowBlur = 25;
    }

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (shield) {
      ctx.strokeStyle = '#5fa0ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (speed) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (vision && b.isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (b.mass > 25) {
      ctx.fillStyle = '#0a0f0a';
      ctx.font = `${Math.max(10, b.radius * 0.4)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(b.mass), b.x, b.y);
    }
    ctx.restore();
  }
}
