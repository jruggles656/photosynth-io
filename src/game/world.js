// Authoritative world state. Runs in the browser today; runs on a Node server later.
// Keep this file free of any DOM / canvas / window references.

import { Blob, Pellet } from './entities.js';
import { applyPhotosynthesis, canEat, overlaps } from './rules.js';

const BASE_SPEED = 220; // px/sec for a tiny blob; scales down with size

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
    const now = Date.now();

    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      this.moveBlob(blob, dt);
      applyPhotosynthesis(blob, dt, now);
    }

    this.handleEating();
    this.refillPellets();
  }

  moveBlob(blob, dt) {
    const dx = blob.targetX - blob.x;
    const dy = blob.targetY - blob.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      blob.vx = 0;
      blob.vy = 0;
      return;
    }
    const speed = BASE_SPEED / Math.sqrt(blob.mass / 10);
    const speedMul = blob.effects.speed && blob.effects.speed > Date.now() ? 1.5 : 1;
    const step = Math.min(dist, speed * speedMul * dt);
    blob.vx = (dx / dist) * speed * speedMul;
    blob.vy = (dy / dist) * speed * speedMul;
    blob.x += (dx / dist) * step;
    blob.y += (dy / dist) * step;
    blob.x = Math.max(blob.radius, Math.min(this.width - blob.radius, blob.x));
    blob.y = Math.max(blob.radius, Math.min(this.height - blob.radius, blob.y));
  }

  handleEating() {
    // Blobs eat pellets
    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      for (const [pid, pellet] of this.pellets) {
        if (overlaps(blob, pellet, 0.9)) {
          blob.mass += pellet.mass;
          this.pellets.delete(pid);
        }
      }
    }
    // Blobs eat blobs
    const blobs = [...this.blobs.values()].filter((b) => b.alive);
    for (let i = 0; i < blobs.length; i++) {
      for (let j = 0; j < blobs.length; j++) {
        if (i === j) continue;
        const a = blobs[i];
        const b = blobs[j];
        if (!a.alive || !b.alive) continue;
        if (canEat(a, b) && overlaps(a, b, 0.6)) {
          a.mass += b.mass;
          b.alive = false;
          this.blobs.delete(b.id);
        }
      }
    }
  }

  refillPellets(target = 400) {
    while (this.pellets.size < target) {
      const p = new Pellet({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
      });
      this.pellets.set(p.id, p);
    }
  }
}
