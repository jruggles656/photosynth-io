// Authoritative world state. Runs in the browser today; runs on a Node server later.
// Keep this file free of any DOM / canvas / window references.

import { Blob, Pellet } from './entities.js';
import { applyPhotosynthesis } from './rules.js';

export class World {
  constructor({ width = 4000, height = 4000 } = {}) {
    this.width = width;
    this.height = height;
    this.blobs = new Map();
    this.pellets = new Map();
    this.powerUps = new Map();
    this.tickCount = 0;
  }

  spawnPlayer(name) {
    const b = new Blob({
      x: this.width / 2,
      y: this.height / 2,
      mass: 20,
      name,
      isPlayer: true,
    });
    this.blobs.set(b.id, b);
    return b;
  }

  seedPellets(count) {
    for (let i = 0; i < count; i++) {
      const p = new Pellet({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
      });
      this.pellets.set(p.id, p);
    }
  }

  // Advance the world by `dt` seconds. Called from a requestAnimationFrame loop today.
  tick(dt) {
    this.tickCount++;
    for (const blob of this.blobs.values()) {
      applyPhotosynthesis(blob, dt);
      // Movement, eating, power-up pickup, etc. — to be filled in Phase 1/2/3.
    }
  }
}
