// Entry point. Wires world + input + transport + renderer together.

import { World } from './game/world.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { LocalTransport } from './net/local.js';

const PLAYER_OWNER_ID = 1;
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');

const world = new World({ width: 4000, height: 4000 });
world.seedPellets(400);
world.spawnPlayer('you', PLAYER_OWNER_ID);
for (let i = 0; i < 20; i++) world.spawnBot(`bot-${i}`);

const transport = new LocalTransport(world);
const input = new Input(canvas);
const renderer = new Renderer(canvas, world);

let last = performance.now();
let gameOverShown = false;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const pieces = world.getOwnedBlobs(PLAYER_OWNER_ID);

  if (pieces.length === 0) {
    if (!gameOverShown) {
      hud.innerHTML = 'eaten · <a href="javascript:location.reload()" style="color:#9fff9f">play again</a>';
      gameOverShown = true;
    }
    world.tick(dt);
    renderer.draw();
    requestAnimationFrame(frame);
    return;
  }

  // Centroid + total mass for the player's pieces
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

  requestAnimationFrame(frame);
}

function countBots() {
  let n = 0;
  for (const b of world.blobs.values()) if (b.isBot && b.alive) n++;
  return n;
}

requestAnimationFrame(frame);
