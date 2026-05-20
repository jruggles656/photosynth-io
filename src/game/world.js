// Authoritative world state. Runs in the browser today; runs on a Node server later.
// Keep this file free of any DOM / canvas / window references.

import { Blob, Pellet, PowerUp, POWERUP_TYPES } from './entities.js';
import { applyPhotosynthesis, canEat, overlaps, MIN_MASS } from './rules.js';
import { decideBotMove } from '../ai/bot.js';

const BASE_SPEED = 220; // px/sec for a tiny blob; scales down with size
const SPLIT_COOLDOWN_MS = 8000;
const POWERUP_DURATION_MS = 8000;
const POWERUP_SPAWN_INTERVAL_MS = 6000;
const POWERUP_CAP = 8;
const MAGNET_RADIUS = 220;
const WILT_RADIUS = 260;

export class World {
  constructor({ width = 4000, height = 4000 } = {}) {
    this.width = width;
    this.height = height;
    this.blobs = new Map();
    this.pellets = new Map();
    this.powerUps = new Map();
    this.tickCount = 0;
    this.nextPowerUpAt = Date.now() + 2000;
  }

  spawnPlayer(name, ownerId = 1) {
    const b = new Blob({
      x: this.width / 2,
      y: this.height / 2,
      mass: 20,
      name,
      isPlayer: true,
      ownerId,
    });
    this.blobs.set(b.id, b);
    return b;
  }

  spawnBot(name) {
    const b = new Blob({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      mass: 15 + Math.random() * 25,
      name,
      isBot: true,
    });
    this.blobs.set(b.id, b);
    return b;
  }

  getOwnedBlobs(ownerId) {
    const out = [];
    for (const b of this.blobs.values()) {
      if (b.alive && b.ownerId === ownerId) out.push(b);
    }
    return out;
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

    // Bot brains decide targets first
    for (const blob of this.blobs.values()) {
      if (blob.isBot && blob.alive) decideBotMove(blob, this);
    }

    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      this.moveBlob(blob, dt);
      applyPhotosynthesis(blob, dt, now);
    }

    this.handleEating();
    this.handlePowerUpPickups(now);
    this.applyAuras(now);
    this.applyMagnet(dt, now);
    this.mergeOwnedPieces();
    this.respawnDeadBots();
    this.refillPellets();
    this.maybeSpawnPowerUp(now);
  }

  maybeSpawnPowerUp(now) {
    if (now < this.nextPowerUpAt) return;
    if (this.powerUps.size >= POWERUP_CAP) {
      this.nextPowerUpAt = now + POWERUP_SPAWN_INTERVAL_MS;
      return;
    }
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const p = new PowerUp({
      x: 100 + Math.random() * (this.width - 200),
      y: 100 + Math.random() * (this.height - 200),
      type,
    });
    this.powerUps.set(p.id, p);
    this.nextPowerUpAt = now + POWERUP_SPAWN_INTERVAL_MS;
  }

  handlePowerUpPickups(now) {
    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      for (const [pid, pu] of this.powerUps) {
        if (overlaps(blob, pu, 1.1)) {
          blob.effects[pu.type] = now + POWERUP_DURATION_MS;
          this.powerUps.delete(pid);
        }
      }
    }
  }

  applyAuras(now) {
    // Wilt auras: enemies in radius get wiltedUntil set, doubling their move tax.
    const wilters = [];
    for (const b of this.blobs.values()) {
      if (b.alive && b.effects.wilt && b.effects.wilt > now) wilters.push(b);
    }
    if (wilters.length === 0) return;
    for (const victim of this.blobs.values()) {
      if (!victim.alive) continue;
      for (const w of wilters) {
        if (w.id === victim.id) continue;
        if (victim.ownerId !== null && victim.ownerId === w.ownerId) continue;
        const dx = w.x - victim.x;
        const dy = w.y - victim.y;
        if (dx * dx + dy * dy < WILT_RADIUS * WILT_RADIUS) {
          victim.wiltedUntil = now + 200;
          break;
        }
      }
    }
  }

  applyMagnet(dt, now) {
    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      if (!blob.effects.magnet || blob.effects.magnet <= now) continue;
      for (const p of this.pellets.values()) {
        const dx = blob.x - p.x;
        const dy = blob.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > MAGNET_RADIUS * MAGNET_RADIUS || d2 < 4) continue;
        const len = Math.sqrt(d2);
        const pull = 200 * dt;
        p.x += (dx / len) * pull;
        p.y += (dy / len) * pull;
      }
    }
  }

  executeCommand(ownerId, command) {
    const owned = this.getOwnedBlobs(ownerId);
    if (command.type === 'setTarget') {
      for (const b of owned) {
        b.targetX = command.x;
        b.targetY = command.y;
      }
    } else if (command.type === 'split') {
      const now = Date.now();
      for (const b of [...owned]) {
        if (b.mass < MIN_MASS * 2) continue;
        b.mass /= 2;
        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        const len = Math.hypot(dx, dy) || 1;
        const piece = new Blob({
          x: b.x + (dx / len) * b.radius,
          y: b.y + (dy / len) * b.radius,
          mass: b.mass,
          name: b.name,
          isPlayer: b.isPlayer,
          isBot: b.isBot,
          ownerId: b.ownerId,
          color: b.color,
        });
        piece.targetX = b.targetX;
        piece.targetY = b.targetY;
        piece.splitCooldown = now + SPLIT_COOLDOWN_MS;
        b.splitCooldown = now + SPLIT_COOLDOWN_MS;
        this.blobs.set(piece.id, piece);
      }
    }
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
    // Blobs eat blobs (skip same-owner pieces — those merge instead)
    const blobs = [...this.blobs.values()].filter((b) => b.alive);
    for (let i = 0; i < blobs.length; i++) {
      for (let j = 0; j < blobs.length; j++) {
        if (i === j) continue;
        const a = blobs[i];
        const b = blobs[j];
        if (!a.alive || !b.alive) continue;
        if (a.ownerId !== null && a.ownerId === b.ownerId) continue;
        if (canEat(a, b) && overlaps(a, b, 0.6)) {
          // Shield blocks one fatal hit, then pops.
          if (b.effects.shield && b.effects.shield > Date.now()) {
            delete b.effects.shield;
            continue;
          }
          a.mass += b.mass;
          b.alive = false;
          this.blobs.delete(b.id);
        }
      }
    }
  }

  mergeOwnedPieces() {
    const byOwner = new Map();
    for (const b of this.blobs.values()) {
      if (!b.alive || b.ownerId === null) continue;
      if (!byOwner.has(b.ownerId)) byOwner.set(b.ownerId, []);
      byOwner.get(b.ownerId).push(b);
    }
    const now = Date.now();
    for (const pieces of byOwner.values()) {
      if (pieces.length < 2) continue;
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const a = pieces[i];
          const b = pieces[j];
          if (!a.alive || !b.alive) continue;
          if (a.splitCooldown > now || b.splitCooldown > now) continue;
          if (overlaps(a, b, 0.5)) {
            a.mass += b.mass;
            b.alive = false;
            this.blobs.delete(b.id);
          }
        }
      }
    }
  }

  respawnDeadBots(targetCount = 20) {
    let botCount = 0;
    for (const b of this.blobs.values()) {
      if (b.isBot && b.alive) botCount++;
    }
    while (botCount < targetCount) {
      this.spawnBot(`bot-${this.tickCount}-${botCount}`);
      botCount++;
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
