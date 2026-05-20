// Entity classes. Pure data + light helpers. No DOM, no canvas.
// These will serialize across the wire when multiplayer ships.

let nextId = 1;
const newId = () => nextId++;

const BOT_PALETTE = ['#5fa05f', '#a05fa0', '#a0a05f', '#5fa0a0', '#c08050', '#8050c0', '#50c080', '#c05080'];

export class Blob {
  constructor({ x, y, mass, name = '', isPlayer = false, isBot = false, ownerId = null, color = null }) {
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
    this.color = color ?? (isPlayer ? '#9fff9f' : BOT_PALETTE[this.id % BOT_PALETTE.length]);
    this.targetX = x;
    this.targetY = y;
    this.effects = {}; // active power-ups: { speed: expiresAt, shield: ..., bloom: ..., etc. }
    this.wiltedUntil = 0; // set by enemy Wilt auras; checked in rules.applyPhotosynthesis
    this.splitCooldown = 0;
    this.alive = true;
  }

  get radius() {
    return Math.sqrt(this.mass) * 4;
  }
}

export class Pellet {
  constructor({ x, y, mass = 1 }) {
    this.id = newId();
    this.x = x;
    this.y = y;
    this.mass = mass;
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
