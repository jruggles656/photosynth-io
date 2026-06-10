// Authoritative world state. Runs in the browser today; runs on a Node server later.
// Keep this file free of any DOM / canvas / window references.

import { Blob, Pellet, PowerUp, Thorn, POWERUP_TYPES } from './entities.js';
import {
  applyPhotosynthesis, canEat, overlaps, MIN_MASS, CORPSE_SCATTER_MASS,
  THORN_POP_MASS, EJECT_MIN_MASS, EJECT_COST, EJECT_PELLET_MASS, EJECT_SPEED,
} from './rules.js';
import { decideBotMove, randomBotIdentity } from '../ai/bot.js';

// Speed: agar.io's curve — maxSpeed ∝ radius^-0.449 (≈ mass^-0.22). Doubling
// mass costs ~14% speed, so growing feels gradual instead of crippling.
const SPEED_K = 660; // maxSpeed = SPEED_K / radius^0.449 → ~180 px/s at mass 20
const SPEED_RADIUS_EXP = 0.449;
const SPLIT_LAUNCH = 750; // impulse on split pieces — the pounce
const POP_SCATTER = 420; // impulse on thorn-pop pieces
const SPLIT_COOLDOWN_MS = 8000;
const POWERUP_DURATION_MS = 8000;
const POWERUP_SPAWN_INTERVAL_MS = 6000;
const POWERUP_CAP = 8;
const MAGNET_RADIUS = 220;
const WILT_RADIUS = 260;

const DAY_LENGTH_SEC = 180; // full day/night cycle

export class World {
  constructor({ width = 4000, height = 4000 } = {}) {
    this.width = width;
    this.height = height;
    this.blobs = new Map();
    this.pellets = new Map();
    this.powerUps = new Map();
    this.thorns = new Map();
    this.zones = [];
    this.tickCount = 0;
    this.time = 0; // accumulated seconds; drives the day/night cycle (starts at noon)
    this.lightLevel = 1; // 0 = midnight, 1 = noon; recomputed each tick
    this.events = []; // tick events for the client (particles, sound, stats); cleared each tick
    this.nextBotOwner = 1;
    this.nextPowerUpAt = Date.now() + 2000;

    this.generateZones();
    this.seedThorns(9);
  }

  // Fresh run: new map layout, new bots at starting sizes, clock back to noon.
  // Mutates in place so renderer/transport references stay valid.
  reset({ pellets = 500, bots = 20 } = {}) {
    this.blobs.clear();
    this.pellets.clear();
    this.powerUps.clear();
    this.thorns.clear();
    this.zones = [];
    this.events = [];
    this.tickCount = 0;
    this.time = 0;
    this.lightLevel = 1;
    this.nextPowerUpAt = Date.now() + 2000;
    this.generateZones();
    this.seedThorns(9);
    this.seedPellets(pellets);
    for (let i = 0; i < bots; i++) this.spawnBot();
  }

  // ---- map generation ----

  generateZones() {
    const place = (type, radius) => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = radius + 120 + Math.random() * (this.width - 2 * radius - 240);
        const y = radius + 120 + Math.random() * (this.height - 2 * radius - 240);
        const crowded = this.zones.some((z) => Math.hypot(z.x - x, z.y - y) < (z.radius + radius) * 0.9);
        if (!crowded) {
          this.zones.push({ type, x, y, radius });
          return;
        }
      }
      this.zones.push({ type, x: Math.random() * this.width, y: Math.random() * this.height, radius });
    };
    for (let i = 0; i < 3; i++) place('grove', 320 + Math.random() * 100);
    for (let i = 0; i < 2; i++) place('shade', 280 + Math.random() * 80);
  }

  seedThorns(count) {
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = 220 + Math.random() * (this.width - 440);
        y = 220 + Math.random() * (this.height - 440);
      } while (Math.hypot(x - this.width / 2, y - this.height / 2) < 450);
      const t = new Thorn({ x, y });
      this.thorns.set(t.id, t);
    }
  }

  // Day number, starting at 1. One full cycle = DAY_LENGTH_SEC.
  get day() {
    return Math.floor(this.time / DAY_LENGTH_SEC) + 1;
  }

  // Scatter pellets where a big blob died — the comeback fund.
  scatterCorpse(blob) {
    const scatterMass = blob.mass * 0.2;
    const count = Math.min(10, Math.max(3, Math.floor(scatterMass / 4)));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const p = new Pellet({
        x: Math.max(4, Math.min(this.width - 4, blob.x)),
        y: Math.max(4, Math.min(this.height - 4, blob.y)),
        mass: scatterMass / count,
        tint: 0,
        color: blob.color,
      });
      p.vx = Math.cos(angle) * (120 + Math.random() * 220);
      p.vy = Math.sin(angle) * (120 + Math.random() * 220);
      this.pellets.set(p.id, p);
    }
  }

  // Returns the zone containing (x, y), or null.
  zoneAt(x, y) {
    for (const z of this.zones) {
      const dx = x - z.x;
      const dy = y - z.y;
      if (dx * dx + dy * dy < z.radius * z.radius) return z;
    }
    return null;
  }

  // ---- spawning ----

  spawnPlayer({ name = 'you', ownerId = 1, color = '#7dffb0', skin = 'plain' } = {}) {
    const spot = this.findSafeSpawn(20);
    const b = new Blob({
      x: spot.x,
      y: spot.y,
      mass: 20,
      name,
      isPlayer: true,
      ownerId,
      color,
      skin,
    });
    b.effects.ghost = Date.now() + 3000; // spawn protection
    this.blobs.set(b.id, b);
    return b;
  }

  findSafeSpawn(mass) {
    const margin = 250;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = margin + Math.random() * (this.width - margin * 2);
      const y = margin + Math.random() * (this.height - margin * 2);
      let safe = true;
      for (const b of this.blobs.values()) {
        if (!b.alive) continue;
        if (b.mass > mass * 1.2 && Math.hypot(b.x - x, b.y - y) < 500) {
          safe = false;
          break;
        }
      }
      if (safe) return { x, y };
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  spawnBot(name = null, personality = null) {
    let identity = randomBotIdentity();
    // prefer a name not already swimming around
    for (let attempt = 0; attempt < 6; attempt++) {
      const taken = [...this.blobs.values()].some((b) => b.alive && b.name === identity.name);
      if (!taken) break;
      identity = randomBotIdentity();
    }
    const b = new Blob({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      mass: 15 + Math.random() * 25,
      name: name ?? identity.name,
      isBot: true,
      ownerId: `b${this.nextBotOwner++}`,
      personality: personality ?? identity.personality,
    });
    b.effects.ghost = Date.now() + 3000; // spawn protection
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

  // ---- tick ----

  // Advance the world by `dt` seconds. Called from a requestAnimationFrame loop today.
  tick(dt) {
    this.tickCount++;
    this.time += dt;
    this.events = [];
    const now = Date.now();

    // Day/night: cosine clock starting at noon. lightLevel 0..1 → photosynthesis 0.4x..1.6x.
    this.lightLevel = 0.5 + 0.5 * Math.cos((2 * Math.PI * this.time) / DAY_LENGTH_SEC);
    const lightMul = 0.4 + 1.2 * this.lightLevel;

    // Bot brains decide targets first
    for (const blob of this.blobs.values()) {
      if (blob.isBot && blob.alive) decideBotMove(blob, this);
    }
    // Bots split-pounce too (deferred so the blobs map isn't mutated mid-decide)
    for (const blob of [...this.blobs.values()]) {
      if (!blob.wantsSplit) continue;
      blob.wantsSplit = false;
      if (this.getOwnedBlobs(blob.ownerId).length < 3) {
        this.executeCommand(blob.ownerId, { type: 'split' });
      }
    }

    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      this.moveBlob(blob, dt);
      const zone = this.zoneAt(blob.x, blob.y);
      const zoneMul = zone ? (zone.type === 'grove' ? 2 : 0) : 1;
      applyPhotosynthesis(blob, dt, now, { zoneMul, lightMul });
    }

    this.movePellets(dt);
    this.handleThorns(now);
    this.handleEating(now);
    this.handlePowerUpPickups(now);
    this.applyAuras(now);
    this.applyMagnet(dt, now);
    this.mergeOwnedPieces();
    this.respawnDeadBots();
    this.refillPellets();
    this.maybeSpawnPowerUp(now);
  }

  pushEvent(e) {
    if (this.events.length < 220) this.events.push(e);
  }

  movePellets(dt) {
    const decay = Math.exp(-3.2 * dt);
    for (const p of this.pellets.values()) {
      if (p.vx === 0 && p.vy === 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= decay;
      p.vy *= decay;
      if (Math.abs(p.vx) < 2 && Math.abs(p.vy) < 2) {
        p.vx = 0;
        p.vy = 0;
      }
      p.x = Math.max(4, Math.min(this.width - 4, p.x));
      p.y = Math.max(4, Math.min(this.height - 4, p.y));
    }
  }

  handleThorns(now) {
    for (const blob of this.blobs.values()) {
      if (!blob.alive || blob.mass <= THORN_POP_MASS || now < blob.thornImmune) continue;
      for (const thorn of this.thorns.values()) {
        if (overlaps(blob, thorn, 0.75)) {
          this.popBlob(blob, thorn, now);
          break;
        }
      }
    }
  }

  // Burst a blob into pieces (thorn contact). Loses 15% mass; pieces scatter outward.
  popBlob(blob, thorn, now) {
    const pieces = Math.max(2, Math.min(5, Math.floor(blob.mass / 35)));
    const keep = blob.mass * 0.85;
    const each = keep / pieces;
    blob.mass = each;
    blob.splitCooldown = now + SPLIT_COOLDOWN_MS;
    blob.thornImmune = now + 1500;
    this.pushEvent({ type: 'pop', x: blob.x, y: blob.y, color: blob.color, ownerId: blob.ownerId, mass: keep });
    for (let i = 1; i < pieces; i++) {
      const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.6;
      const dist = thorn.radius + Math.sqrt(each) * 4 + 30;
      const piece = new Blob({
        x: Math.max(10, Math.min(this.width - 10, thorn.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(this.height - 10, thorn.y + Math.sin(angle) * dist)),
        mass: each,
        name: blob.name,
        isPlayer: blob.isPlayer,
        isBot: blob.isBot,
        ownerId: blob.ownerId,
        color: blob.color,
        skin: blob.skin,
        personality: blob.personality,
      });
      piece.targetX = thorn.x + Math.cos(angle) * (dist + 300);
      piece.targetY = thorn.y + Math.sin(angle) * (dist + 300);
      piece.ix = Math.cos(angle) * POP_SCATTER;
      piece.iy = Math.sin(angle) * POP_SCATTER;
      piece.splitCooldown = now + SPLIT_COOLDOWN_MS;
      piece.thornImmune = now + 1500;
      this.blobs.set(piece.id, piece);
    }
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
          this.pushEvent({ type: 'powerup', x: pu.x, y: pu.y, ptype: pu.type, ownerId: blob.ownerId });
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
      let split = false;
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
          skin: b.skin,
          personality: b.personality,
        });
        piece.targetX = b.targetX;
        piece.targetY = b.targetY;
        piece.ix = (dx / len) * SPLIT_LAUNCH; // pounce toward the cursor
        piece.iy = (dy / len) * SPLIT_LAUNCH;
        piece.splitCooldown = now + SPLIT_COOLDOWN_MS;
        b.splitCooldown = now + SPLIT_COOLDOWN_MS;
        this.blobs.set(piece.id, piece);
        split = true;
      }
      if (split && owned[0]) {
        this.pushEvent({ type: 'split', x: owned[0].x, y: owned[0].y, ownerId });
      }
    } else if (command.type === 'eject') {
      for (const b of owned) {
        if (b.mass < EJECT_MIN_MASS) continue;
        b.mass -= EJECT_COST;
        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const p = new Pellet({
          x: b.x + nx * (b.radius + 8),
          y: b.y + ny * (b.radius + 8),
          mass: EJECT_PELLET_MASS,
          tint: 0,
          color: b.color,
        });
        p.vx = nx * EJECT_SPEED;
        p.vy = ny * EJECT_SPEED;
        this.pellets.set(p.id, p);
        this.pushEvent({ type: 'eject', x: p.x, y: p.y, color: b.color, ownerId });
      }
    }
  }

  moveBlob(blob, dt) {
    const dx = blob.targetX - blob.x;
    const dy = blob.targetY - blob.y;
    const dist = Math.hypot(dx, dy);

    // Cursor distance is the throttle (agar.io's "liquid" feel): full speed
    // outside the band, easing continuously to zero at the cursor. There is
    // no discrete stopped state — parking the cursor on yourself IS the stop.
    const band = Math.max(40, blob.radius * 1.4);
    const throttle = Math.min(1, dist / band);
    const speedMul = blob.effects.speed && blob.effects.speed > Date.now() ? 1.5 : 1;
    const maxSpeed = (SPEED_K / Math.pow(blob.radius, SPEED_RADIUS_EXP)) * speedMul;
    const desiredSpeed = maxSpeed * throttle;
    const desiredVx = dist > 0.5 ? (dx / dist) * desiredSpeed : 0;
    const desiredVy = dist > 0.5 ? (dy / dist) * desiredSpeed : 0;

    // Velocity smoothing: big blobs take longer to redirect — reads as weight.
    const tau = 0.07 + 0.06 * Math.min(1, blob.radius / 80);
    const k = 1 - Math.exp(-dt / tau);
    blob.mvx += (desiredVx - blob.mvx) * k;
    blob.mvy += (desiredVy - blob.mvy) * k;
    if (throttle === 0 || (Math.abs(blob.mvx) < 0.8 && Math.abs(blob.mvy) < 0.8)) {
      if (Math.abs(blob.mvx) < 0.8) blob.mvx = 0;
      if (Math.abs(blob.mvy) < 0.8) blob.mvy = 0;
    }

    // Launch impulse decays independently of steering — lets split pieces lunge.
    const decay = Math.exp(-2.8 * dt);
    blob.ix *= decay;
    blob.iy *= decay;
    if (Math.abs(blob.ix) < 5 && Math.abs(blob.iy) < 5) {
      blob.ix = 0;
      blob.iy = 0;
    }
    blob.vx = blob.mvx + blob.ix;
    blob.vy = blob.mvy + blob.iy;
    blob.x += blob.vx * dt;
    blob.y += blob.vy * dt;
    blob.x = Math.max(blob.radius, Math.min(this.width - blob.radius, blob.x));
    blob.y = Math.max(blob.radius, Math.min(this.height - blob.radius, blob.y));
  }

  handleEating(now) {
    // Blobs eat pellets
    for (const blob of this.blobs.values()) {
      if (!blob.alive) continue;
      for (const [pid, pellet] of this.pellets) {
        if (overlaps(blob, pellet, 1.0)) {
          blob.mass += pellet.mass;
          this.pellets.delete(pid);
          this.pushEvent({
            type: 'eat-pellet',
            x: pellet.x,
            y: pellet.y,
            tint: pellet.tint,
            color: pellet.color,
            mass: pellet.mass,
            eaterId: blob.id,
            ownerId: blob.ownerId,
          });
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
        if (canEat(a, b) && overlaps(a, b, 0.7)) {
          // Shield blocks one fatal hit, then pops.
          if (b.effects.shield && b.effects.shield > now) {
            delete b.effects.shield;
            this.pushEvent({ type: 'shield-pop', x: b.x, y: b.y, ownerId: b.ownerId });
            continue;
          }
          // Corpse economy: big victims scatter 20% of their mass as pellets —
          // a comeback fund that pulls scavengers (and drama) to the kill site.
          let gained = b.mass;
          if (b.mass > CORPSE_SCATTER_MASS) {
            gained = b.mass * 0.8;
            this.scatterCorpse(b);
          }
          a.mass += gained;
          b.alive = false;
          this.blobs.delete(b.id);
          this.pushEvent({
            type: 'eat-blob',
            x: b.x,
            y: b.y,
            color: b.color,
            mass: b.mass,
            eaterId: a.id,
            eaterOwnerId: a.ownerId,
            eaterName: a.name,
            victimOwnerId: b.ownerId,
            victimName: b.name,
          });
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
            this.pushEvent({ type: 'merge', x: a.x, y: a.y, ownerId: a.ownerId });
          }
        }
      }
    }
  }

  respawnDeadBots(targetCount = 20) {
    const owners = new Set();
    for (const b of this.blobs.values()) {
      if (b.isBot && b.alive) owners.add(b.ownerId);
    }
    while (owners.size < targetCount) {
      const bot = this.spawnBot();
      owners.add(bot.ownerId);
    }
  }

  refillPellets(target = 500) {
    while (this.pellets.size < target) {
      const p = new Pellet({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
      });
      this.pellets.set(p.id, p);
    }
  }
}
