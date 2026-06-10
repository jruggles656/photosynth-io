// Canvas rendering only. Reads world state; never writes to it.
// Owns all cosmetic state: camera, particles, plankton, day/night tinting.

import { THORN_POP_MASS } from '../game/rules.js';
import { drawSkinPattern } from './skins.js';

const POWERUP_STYLE = {
  speed:  { color: '#ffd24a', glyph: '⚡' },
  shield: { color: '#5fa0ff', glyph: '🛡' },
  vision: { color: '#e8fbff', glyph: '👁' },
  magnet: { color: '#ff7a5a', glyph: '🧲' },
  ghost:  { color: '#cfcfff', glyph: '👻' },
  bloom:  { color: '#ff8ad8', glyph: '🌸' },
  wilt:   { color: '#9a5ab0', glyph: '🥀' },
};

const PELLET_TINTS = ['#5fd98a', '#49c9a8', '#8be060', '#ffd87a'];

// Background colors at noon vs midnight — everything lerps between these.
const BG_DAY = [10, 26, 19];
const BG_NIGHT = [4, 10, 14];
const PARTICLE_CAP = 700;

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: world.width / 2, y: world.height / 2, zoom: 0.6 };
    this.targetView = { x: world.width / 2, y: world.height / 2, mass: 100 };
    this.zoomKick = 0;
    this.shake = 0;
    this.vision = false;
    this.particles = [];
    this.plankton = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.seedPlankton();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = this.vw * dpr;
    this.canvas.height = this.vh * dpr;
    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
  }

  seedPlankton() {
    for (let i = 0; i < 90; i++) {
      this.plankton.push({
        x: Math.random() * 4000,
        y: Math.random() * 4000,
        depth: 0.15 + Math.random() * 0.55, // parallax factor
        size: 0.6 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 6,
      });
    }
  }

  // ---- camera ----

  setView(view, dt, immediate = false) {
    if (!view) return;
    this.targetView = view;
    const k = immediate ? 1 : 1 - Math.exp(-5 * dt);
    this.camera.x += (view.x - this.camera.x) * k;
    this.camera.y += (view.y - this.camera.y) * k;
    let targetZoom = Math.max(0.32, 1 - view.mass / 700);
    if (view.zoom) targetZoom = view.zoom;
    if (this.vision) targetZoom *= 0.78;
    targetZoom += this.zoomKick;
    this.camera.zoom += (targetZoom - this.camera.zoom) * (immediate ? 1 : 1 - Math.exp(-3.5 * dt));
  }

  // ---- world events → cosmetics ----

  processEvents(events, playerOwnerId) {
    for (const e of events) {
      if (!this.inView(e.x, e.y, 200)) continue;
      switch (e.type) {
        case 'eat-pellet':
          this.burst(e.x, e.y, e.color ?? PELLET_TINTS[e.tint ?? 0], 4, 60, 0.4);
          break;
        case 'eat-blob': {
          const count = Math.min(26, Math.max(8, Math.round(e.mass / 4)));
          this.burst(e.x, e.y, e.color, count, 180, 0.9);
          if (e.eaterOwnerId === playerOwnerId) this.zoomKick = Math.min(0.1, this.zoomKick + 0.05);
          if (e.victimOwnerId === playerOwnerId) this.shake = 16;
          break;
        }
        case 'pop':
          this.burst(e.x, e.y, e.color, 22, 220, 0.8);
          if (e.ownerId === playerOwnerId) this.shake = 12;
          break;
        case 'powerup': {
          const style = POWERUP_STYLE[e.ptype] ?? { color: '#fff' };
          this.ring(e.x, e.y, style.color);
          this.burst(e.x, e.y, style.color, 10, 120, 0.6);
          break;
        }
        case 'shield-pop':
          this.ring(e.x, e.y, '#5fa0ff');
          break;
        case 'eject':
          this.burst(e.x, e.y, e.color, 3, 50, 0.3);
          break;
        case 'split':
          if (e.ownerId === playerOwnerId) this.zoomKick = Math.min(0.08, this.zoomKick + 0.03);
          break;
      }
    }
  }

  inView(x, y, margin = 0) {
    const halfW = this.vw / 2 / this.camera.zoom + margin;
    const halfH = this.vh / 2 / this.camera.zoom + margin;
    return Math.abs(x - this.camera.x) < halfW && Math.abs(y - this.camera.y) < halfH;
  }

  burst(x, y, color, count, speed, life) {
    if (this.particles.length > PARTICLE_CAP) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        kind: 'dot', x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0, ttl: life * (0.6 + Math.random() * 0.8),
        size: 1.5 + Math.random() * 3, color,
      });
    }
  }

  ring(x, y, color) {
    this.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, ttl: 0.5, size: 10, color });
  }

  mote(x, y, color) {
    if (this.particles.length > PARTICLE_CAP) return;
    this.particles.push({
      kind: 'mote', x, y,
      vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 26,
      life: 0, ttl: 1.2 + Math.random() * 1.0,
      size: 1 + Math.random() * 1.8, color,
    });
  }

  // ---- main draw ----

  draw(dt, opts = {}) {
    const { ctx, camera, world } = this;
    const now = Date.now();
    const t = now / 1000;
    const light = world.lightLevel;

    // decay cosmetic kicks
    this.zoomKick *= Math.exp(-4 * dt);
    this.shake *= Math.exp(-7 * dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // -- background: abyssal gradient that breathes with the day cycle
    const bg = lerpRgb(BG_NIGHT, BG_DAY, light);
    const deep = lerpRgb([2, 6, 8], [5, 14, 11], light);
    const grad = ctx.createRadialGradient(this.vw / 2, this.vh * 0.35, 0, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.8);
    grad.addColorStop(0, `rgb(${bg.join(',')})`);
    grad.addColorStop(1, `rgb(${deep.join(',')})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.vw, this.vh);

    this.drawPlankton(ctx, t, dt, light, 'back');
    this.drawLightShafts(ctx, t, light);

    // -- world space
    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(this.vw / 2 + shakeX, this.vh / 2 + shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const viewL = camera.x - this.vw / 2 / camera.zoom - 100;
    const viewR = camera.x + this.vw / 2 / camera.zoom + 100;
    const viewT = camera.y - this.vh / 2 / camera.zoom - 100;
    const viewB = camera.y + this.vh / 2 / camera.zoom + 100;

    this.drawZones(ctx, t, light);
    this.drawDotGrid(ctx, viewL, viewR, viewT, viewB);
    this.drawBorder(ctx, t);
    this.drawPellets(ctx, t, viewL, viewR, viewT, viewB);
    this.drawPowerUps(ctx, t);

    // Blobs sorted small-to-big so big ones cover small ones, classic agar look
    const sorted = [...world.blobs.values()].sort((a, b) => a.mass - b.mass);
    for (const b of sorted) {
      if (!this.inView(b.x, b.y, b.radius + 60)) continue;
      this.drawBlob(ctx, b, now, t, light, dt);
    }

    this.drawThorns(ctx, t);
    this.updateAndDrawParticles(ctx, dt);

    ctx.restore();

    // -- screen space: night tint, fore plankton, vignette
    if (light < 0.6) {
      ctx.fillStyle = `rgba(8,14,32,${(0.6 - light) * 0.45})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    this.drawPlankton(ctx, t, dt, light, 'front');
    const vig = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.42, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  // ---- background layers ----

  drawPlankton(ctx, t, dt, light, layer) {
    ctx.save();
    for (const p of this.plankton) {
      const isFront = p.depth > 0.55;
      if ((layer === 'front') !== isFront) continue;
      p.y -= p.speed * dt * 0.5;
      p.x += Math.sin(t * 0.3 + p.phase) * dt * 4;
      const sx = mod(p.x - this.camera.x * p.depth, this.vw + 40) - 20;
      const sy = mod(p.y - this.camera.y * p.depth, this.vh + 40) - 20;
      const tw = 0.25 + 0.45 * Math.abs(Math.sin(t * 0.8 + p.phase));
      ctx.globalAlpha = tw * (0.35 + light * 0.4) * (isFront ? 0.5 : 1);
      ctx.fillStyle = '#9fe8c0';
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * (isFront ? 1.6 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLightShafts(ctx, t, light) {
    if (light < 0.15) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const drift = Math.sin(t * 0.05 + i * 2.1) * this.vw * 0.25;
      const x = this.vw * (0.2 + i * 0.3) + drift;
      const w = this.vw * (0.10 + i * 0.04);
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(0.3);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      const a = light * (0.045 - i * 0.01);
      g.addColorStop(0, 'rgba(180,255,210,0)');
      g.addColorStop(0.5, `rgba(180,255,210,${a})`);
      g.addColorStop(1, 'rgba(180,255,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, -this.vh * 0.3, w, this.vh * 1.8);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- world layers ----

  drawZones(ctx, t, light) {
    for (const z of this.world.zones) {
      if (!this.inView(z.x, z.y, z.radius + 80)) continue;
      if (z.type === 'grove') {
        const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
        const a = 0.05 + light * 0.08;
        g.addColorStop(0, `rgba(255,216,122,${a})`);
        g.addColorStop(0.7, `rgba(180,230,120,${a * 0.5})`);
        g.addColorStop(1, 'rgba(180,230,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        // orbiting fireflies on the rim
        ctx.fillStyle = `rgba(255,225,150,${0.3 + light * 0.4})`;
        for (let i = 0; i < 10; i++) {
          const a2 = t * 0.12 + (i / 10) * Math.PI * 2 + z.x;
          const rr = z.radius * (0.92 + 0.05 * Math.sin(t * 1.3 + i * 2));
          ctx.beginPath();
          ctx.arc(z.x + Math.cos(a2) * rr, z.y + Math.sin(a2) * rr, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
        g.addColorStop(0, 'rgba(3,8,20,0.5)');
        g.addColorStop(0.8, 'rgba(3,8,20,0.3)');
        g.addColorStop(1, 'rgba(3,8,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,130,200,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (0.97 + 0.02 * Math.sin(t + z.y)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawDotGrid(ctx, l, r, top, bot) {
    const step = 150;
    ctx.fillStyle = 'rgba(125,255,176,0.05)';
    const x0 = Math.max(0, Math.floor(l / step) * step);
    const x1 = Math.min(this.world.width, r);
    const y0 = Math.max(0, Math.floor(top / step) * step);
    const y1 = Math.min(this.world.height, bot);
    for (let x = x0; x <= x1; x += step) {
      for (let y = y0; y <= y1; y += step) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  drawBorder(ctx, t) {
    const w = this.world.width;
    const h = this.world.height;
    ctx.strokeStyle = `rgba(125,255,176,${0.12 + 0.06 * Math.sin(t * 1.5)})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(125,255,176,0.04)';
    ctx.lineWidth = 22;
    ctx.strokeRect(-12, -12, w + 24, h + 24);
  }

  drawPellets(ctx, t, l, r, top, bot) {
    for (const p of this.world.pellets.values()) {
      if (p.x < l || p.x > r || p.y < top || p.y > bot) continue;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2 + p.id * 1.7);
      const sway = Math.sin(t * 1.1 + p.id) * 1.5;
      const color = p.color ?? PELLET_TINTS[p.tint];
      if (p.tint === 3) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x + sway, p.y, p.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.65 + 0.35 * pulse;
        ctx.beginPath();
        ctx.arc(p.x + sway, p.y, p.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawPowerUps(ctx, t) {
    for (const pu of this.world.powerUps.values()) {
      if (!this.inView(pu.x, pu.y, 60)) continue;
      const style = POWERUP_STYLE[pu.type] || { color: '#fff', glyph: '?' };
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 3.3 + pu.id));
      ctx.save();
      // orbiting seed-pod petals
      ctx.fillStyle = style.color;
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 5; i++) {
        const a = t * 1.2 + (i / 5) * Math.PI * 2;
        const rr = 17 + 2.5 * Math.sin(t * 2 + i);
        ctx.beginPath();
        ctx.arc(pu.x + Math.cos(a) * rr, pu.y + Math.sin(a) * rr, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 22 * pulse;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#04100c';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.glyph, pu.x, pu.y + 1);
    }
  }

  drawThorns(ctx, t) {
    for (const th of this.world.thorns.values()) {
      if (!this.inView(th.x, th.y, th.radius + 40)) continue;
      const spikes = 14;
      const rot = th.seed + t * 0.08;
      const breathe = 1 + 0.03 * Math.sin(t * 1.6 + th.seed);
      ctx.save();
      ctx.translate(th.x, th.y);
      ctx.rotate(rot);
      ctx.shadowColor = '#3fae62';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = (i % 2 === 0 ? th.radius : th.radius * 0.72) * breathe;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(20,60,35,0.92)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(110,230,140,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // inner core
      ctx.fillStyle = 'rgba(60,140,80,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, th.radius * 0.4 * breathe, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- blobs ----

  drawBlob(ctx, b, now, t, light, dt) {
    const r = b.radius;
    const ghost = b.effects.ghost && b.effects.ghost > now;
    const bloom = b.effects.bloom && b.effects.bloom > now;
    const wilt = b.effects.wilt && b.effects.wilt > now;
    const shield = b.effects.shield && b.effects.shield > now;
    const speedFx = b.effects.speed && b.effects.speed > now;
    const magnet = b.effects.magnet && b.effects.magnet > now;

    const speed = Math.hypot(b.vx, b.vy);
    const still = speed <= 1;
    const zone = this.world.zoneAt(b.x, b.y);
    const inGrove = zone?.type === 'grove';
    const inShade = zone?.type === 'shade';
    const photosynthesizing = still && !inShade && b.alive;

    // photosynthesis motes — visible "growing" state
    if (photosynthesizing && Math.random() < dt * (3 + r / 18) * (0.4 + light)) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.8;
      this.mote(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, bloom ? '#ff8ad8' : '#b8ffd4');
    }

    ctx.save();
    if (ghost) ctx.globalAlpha = 0.45;
    else if (inShade) ctx.globalAlpha = 0.62;

    // aura glow
    let glowColor = null;
    let glowSize = 0;
    if (bloom) { glowColor = '#ff8ad8'; glowSize = 42; }
    else if (wilt) { glowColor = '#9a5ab0'; glowSize = 36; }
    else if (magnet) { glowColor = '#ff7a5a'; glowSize = 26; }
    else if (inGrove) { glowColor = '#ffd87a'; glowSize = 20 + light * 14; }
    else if (photosynthesizing) { glowColor = b.color; glowSize = 8 + light * 10; }

    // membrane wobble path — calm when rooted, agitated when swimming
    const wobAmp = r * Math.min(0.075, 0.018 + speed / 2600);
    const wobSpeed = still ? 1.2 : 3.2;
    const n = 16;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r + wobAmp * Math.sin(a * 3 + t * wobSpeed + b.seed) + wobAmp * 0.6 * Math.sin(a * 5 - t * wobSpeed * 1.4 + b.seed * 2);
      pts.push([b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr]);
    }

    const bodyPath = () => {
      ctx.beginPath();
      const mid = (i, j) => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
      let [mx, my] = mid(n - 1, 0);
      ctx.moveTo(mx, my);
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const [cx2, cy2] = pts[i];
        const [ex, ey] = mid(i, next);
        ctx.quadraticCurveTo(cx2, cy2, ex, ey);
      }
      ctx.closePath();
    };

    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowSize;
    }

    // cell body — lit nucleus side, darker membrane edge
    const vlen = speed || 1;
    const lx = b.x + (b.vx / vlen) * r * 0.2;
    const ly = b.y + (b.vy / vlen) * r * 0.2;
    const body = ctx.createRadialGradient(lx, ly, r * 0.1, b.x, b.y, r);
    body.addColorStop(0, shadeColor(b.color, 0.45));
    body.addColorStop(0.65, b.color);
    body.addColorStop(1, shadeColor(b.color, -0.38));
    ctx.fillStyle = body;
    bodyPath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // skin pattern, clipped to body
    if (b.skin && b.skin !== 'plain') {
      ctx.save();
      bodyPath();
      ctx.clip();
      ctx.translate(b.x, b.y);
      drawSkinPattern(ctx, b.skin, r, t, b.seed);
      ctx.restore();
    }

    // nucleus
    ctx.fillStyle = shadeColor(b.color, 0.55);
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.arc(lx, ly, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = ghost ? 0.45 : inShade ? 0.62 : 1;

    // membrane rim
    ctx.strokeStyle = shadeColor(b.color, photosynthesizing ? 0.5 : 0.25);
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    bodyPath();
    ctx.stroke();

    // effect rings
    if (shield) {
      ctx.strokeStyle = '#5fa0ff';
      ctx.lineWidth = 4;
      ctx.globalAlpha *= 0.5 + 0.5 * Math.abs(Math.sin(t * 4));
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = ghost ? 0.45 : inShade ? 0.62 : 1;
    }
    if (speedFx) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // labels
    if (b.mass > 25) {
      ctx.fillStyle = 'rgba(4,16,12,0.85)';
      ctx.font = `600 ${Math.max(10, r * 0.36)}px "Spline Sans Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(b.mass), b.x, b.y);
    }
    if (b.name && r > 14) {
      ctx.fillStyle = b.isPlayer ? 'rgba(217,246,230,0.95)' : 'rgba(217,246,230,0.55)';
      ctx.font = `500 ${Math.max(10, Math.min(14, r * 0.26))}px "Spline Sans Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(b.name, b.x, b.y + r + 5);
    }

    ctx.restore();
  }

  // ---- particles ----

  updateAndDrawParticles(ctx, dt) {
    const drag = Math.exp(-2.5 * dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dot') {
        p.vx *= drag;
        p.vy *= drag;
      }
      const k = p.life / p.ttl;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + k * 70, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'mote') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.sin(Math.PI * k) * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- minimap ----

  drawMinimap(mapCanvas, playerPieces, vision) {
    const mctx = mapCanvas.getContext('2d');
    const dpr = this.dpr;
    const size = mapCanvas.clientWidth;
    if (mapCanvas.width !== size * dpr) {
      mapCanvas.width = size * dpr;
      mapCanvas.height = size * dpr;
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = size / this.world.width;
    mctx.clearRect(0, 0, size, size);
    mctx.fillStyle = 'rgba(4,14,10,0.72)';
    mctx.fillRect(0, 0, size, size);

    for (const z of this.world.zones) {
      mctx.fillStyle = z.type === 'grove' ? 'rgba(255,216,122,0.16)' : 'rgba(80,110,180,0.14)';
      mctx.beginPath();
      mctx.arc(z.x * s, z.y * s, z.radius * s, 0, Math.PI * 2);
      mctx.fill();
    }
    mctx.fillStyle = 'rgba(110,230,140,0.45)';
    for (const th of this.world.thorns.values()) {
      mctx.fillRect(th.x * s - 1.5, th.y * s - 1.5, 3, 3);
    }

    let totalPlayerMass = 0;
    for (const p of playerPieces) totalPlayerMass += p.mass;

    if (vision) {
      for (const b of this.world.blobs.values()) {
        if (!b.alive || b.ownerId === playerPieces[0]?.ownerId) continue;
        mctx.fillStyle = b.mass > totalPlayerMass ? 'rgba(255,110,138,0.85)' : 'rgba(159,232,192,0.6)';
        const rr = Math.max(1.2, b.radius * s);
        mctx.beginPath();
        mctx.arc(b.x * s, b.y * s, rr, 0, Math.PI * 2);
        mctx.fill();
      }
    }

    for (const p of playerPieces) {
      mctx.save();
      mctx.shadowColor = p.color;
      mctx.shadowBlur = 6;
      mctx.fillStyle = p.color;
      mctx.beginPath();
      mctx.arc(p.x * s, p.y * s, Math.max(2, p.radius * s), 0, Math.PI * 2);
      mctx.fill();
      mctx.restore();
    }

    // camera viewport
    const vw = this.vw / this.camera.zoom * s;
    const vh = this.vh / this.camera.zoom * s;
    mctx.strokeStyle = 'rgba(217,246,230,0.25)';
    mctx.lineWidth = 1;
    mctx.strokeRect(this.camera.x * s - vw / 2, this.camera.y * s - vh / 2, vw, vh);
  }
}

// ---- color helpers ----

function shadeColor(hex, amt) {
  // amt > 0 lighten toward white, amt < 0 darken toward black
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function mod(v, m) {
  return ((v % m) + m) % m;
}
