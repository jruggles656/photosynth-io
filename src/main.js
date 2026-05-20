// Entry point. Wires world + input + transport + renderer together.

import { World } from './game/world.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { LocalTransport } from './net/local.js';

const canvas = document.getElementById('game');

const world = new World({ width: 4000, height: 4000 });
world.seedPellets(400);
const player = world.spawnPlayer('you');

const transport = new LocalTransport(world);
const input = new Input(canvas);
const renderer = new Renderer(canvas, world);

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const target = input.targetFor(player, renderer.camera, canvas);
  transport.sendCommand(player.id, { type: 'setTarget', x: target.x, y: target.y });
  input.drainCommands(); // split/eject handled in Phase 2

  world.tick(dt);
  renderer.followPlayer(player);
  renderer.draw();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const hud = document.getElementById('hud');
function updateHud() {
  hud.textContent = `photosynth-io · mass ${player.mass.toFixed(0)} · pellets ${world.pellets.size}`;
  requestAnimationFrame(updateHud);
}
updateHud();
