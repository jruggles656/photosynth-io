// Entity classes. Pure data + light helpers. No DOM, no canvas.
// These will serialize across the wire when multiplayer ships.

let nextId = 1;
const newId = () => nextId++;

// Bioluminescent palette — player-selectable, bots draw from the same pool.
export const BLOB_COLORS = ['#7dffb0', '#6ee7ff', '#ff8ad8', '#ffd87a', '#b59cff', '#ff9d6e'];

const BOT_PALETTE = ['#58d68d', '#5dade2', '#af7ac5', '#f5b041', '#48c9b0', '#ec7063', '#a3e635', '#22d3ee'];

export class Blob {
  constructor({ x, y, mass, name = '', isPlayer = false, isBot = false, ownerId = null, color = null, skin = 'plain', personality = null }) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.mass = mass;
    this.name = name;
    this.isPlayer = isPlayer;
    this.isBot = isBot;
    this.ownerId = ownerId;
    this.color = color ?? (isPlayer ? '#7dffb0' : BOT_PALETTE[this.id % BOT_PALETTE.length]);
    this.skin = skin;
    this.personality = personality;
    this.targetX = x;
    this.targetY = y;
    this.effects = {}; // active power-ups: { speed: expiresAt, shield: ..., bloom: ..., etc. }
    this.wiltedUntil = 0; // set by enemy Wilt auras; checked in rules.applyPhotosynthesis
    this.thornImmune = 0; // brief immunity after popping on a thorn
    this.splitCooldown = 0;
    this.seed = Math.random() * Math.PI * 2; // per-blob animation phase (render-only use)
    this.alive = true;
  }

  get radius() {
    return Math.sqrt(this.mass) * 4;
  }
}

export class Pellet {
  constructor({ x, y, mass = 1, tint = null, color = null }) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.vx = 0;
    this.vy = 0;
    // tint 0-2 = ambient greens/teals, 3 = rare gold (worth more). Ejected mass carries its owner's color.
    this.tint = tint ?? (Math.random() < 0.05 ? 3 : Math.floor(Math.random() * 3));
    if (this.tint === 3 && mass === 1) this.mass = 3;
    this.color = color;
  }

  get radius() {
    return Math.sqrt(this.mass) * 4;
  }
}

export const POWERUP_TYPES = ['speed', 'shield', 'vision', 'magnet', 'ghost', 'bloom', 'wilt'];

export class PowerUp {
  constructor({ x, y, type }) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.type = type;
    this.mass = 2;
  }

  get radius() {
    return 8;
  }
}

// Thorn bush — the hazard. Blobs above THORN_POP_MASS that touch one burst into pieces.
// Small blobs can shelter under it.
export class Thorn {
  constructor({ x, y }) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.seed = Math.random() * Math.PI * 2;
  }

  get radius() {
    return 56;
  }
}
