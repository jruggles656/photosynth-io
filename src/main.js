// Entry point. Wires world + input + transport + renderer together.

import { World } from './game/world.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { LocalTransport } from './net/local.js';

const PLAYER_OWNER_ID = 1;
const POWERUP_GLYPHS = {
  speed: '⚡', shield: '🛡', vision: '👁', magnet: '🧲',
  ghost: '👻', bloom: '🌸', wilt: '🥀',
};

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const effectsEl = document.getElementById('effects');
const leadersEl = document.getElementById('leaders');

const world = new World({ width: 4000, height: 4000 });
world.seedPellets(400);
world.spawnPlayer('you', PLAYER_OWNER_ID);
for (let i = 0; i < 20; i++) world.spawnBot(`bot-${i}`);

const transport = new LocalTransport(world);
const input = new Input(canvas);
const renderer = new Renderer(canvas, world);

let last = performance.now();
let gameOverShown = false;
let leaderTimer = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const pieces = world.getOwnedBlobs(PLAYER_OWNER_ID);

  if (pieces.length === 0) {
    if (!gameOverShown) {
      hud.innerHTML = 'eaten · <a href="javascript:location.reload()" style="color:#9fff9f;pointer-events:auto;">play again</a>';
      hud.style.pointerEvents = 'auto';
      effectsEl.innerHTML = '';
      gameOverShown = true;
    }
    world.tick(dt);
    renderer.draw();
    requestAnimationFrame(frame);
    return;
  }

  let cx = 0, cy = 0, totalMass = 0;
  for (const p of pieces) {
    cx += p.x;
    cy += p.y;
    totalMass += p.mass;
  }
  cx /= pieces.length;
  cy /= pieces.length;

  const target = input.targetFor(cx, cy, renderer.camera, canvas);
  transport.sendCommand(PLAYER_OWNER_ID, { type: 'setTarget', x: target.x, y: target.y });

  for (const cmd of input.drainCommands()) {
    transport.sendCommand(PLAYER_OWNER_ID, cmd);
  }

  world.tick(dt);
  renderer.followPlayer({ x: cx, y: cy, mass: totalMass });
  renderer.draw();

  hud.textContent = `mass ${totalMass.toFixed(0)} · pieces ${pieces.length} · bots ${countBots()}`;

  // Active effects chips (use the first piece as representative — they share effects across the owner if picked up)
  renderEffects(pieces[0], now);

  // Leaderboard refresh ~5x/sec
  leaderTimer += dt;
  if (leaderTimer > 0.2) {
    leaderTimer = 0;
    renderLeaderboard(pieces);
  }

  requestAnimationFrame(frame);
}

function countBots() {
  let n = 0;
  for (const b of world.blobs.values()) if (b.isBot && b.alive) n++;
  return n;
}

function renderEffects(blob, now) {
  const active = [];
  for (const [type, expires] of Object.entries(blob.effects)) {
    if (expires > now) {
      const remaining = Math.ceil((expires - now) / 1000);
      active.push(`<span class="effect-chip">${POWERUP_GLYPHS[type] || '?'} ${type} ${remaining}s</span>`);
    }
  }
  effectsEl.innerHTML = active.join('');
}

function renderLeaderboard(playerPieces) {
  // Aggregate by ownerId (player) and by single bot id
  const entries = [];
  const byOwner = new Map();
  for (const b of world.blobs.values()) {
    if (!b.alive) continue;
    if (b.ownerId !== null) {
      byOwner.set(b.ownerId, (byOwner.get(b.ownerId) ?? 0) + b.mass);
    } else {
      entries.push({ name: b.name || `bot ${b.id}`, mass: b.mass, mine: false });
    }
  }
  for (const [owner, mass] of byOwner) {
    entries.push({ name: owner === PLAYER_OWNER_ID ? 'you' : `p${owner}`, mass, mine: owner === PLAYER_OWNER_ID });
  }
  entries.sort((a, b) => b.mass - a.mass);
  const top = entries.slice(0, 10);
  leadersEl.innerHTML = top
    .map((e) => `<li class="${e.mine ? 'you' : ''}">${escape(e.name)} · ${Math.round(e.mass)}</li>`)
    .join('');
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

requestAnimationFrame(frame);
