// Bot brains. Lives next to game/ because it also runs server-side when MP ships.
// Input: bot blob + world. Output: writes new target onto the bot. No DOM access.

import { EAT_RATIO } from '../game/rules.js';

const SIGHT = 600;
const FLEE_TRIGGER = 380;

export function decideBotMove(bot, world) {
  let nearestThreat = null;
  let threatDist2 = Infinity;
  let nearestPrey = null;
  let preyDist2 = Infinity;

  for (const other of world.blobs.values()) {
    if (other.id === bot.id || !other.alive) continue;
    if (other.ownerId !== null && other.ownerId === bot.ownerId) continue;
    const d2 = (other.x - bot.x) ** 2 + (other.y - bot.y) ** 2;
    if (d2 > SIGHT * SIGHT) continue;

    if (other.mass >= bot.mass * EAT_RATIO) {
      if (d2 < threatDist2) {
        nearestThreat = other;
        threatDist2 = d2;
      }
    } else if (bot.mass >= other.mass * EAT_RATIO) {
      if (d2 < preyDist2) {
        nearestPrey = other;
        preyDist2 = d2;
      }
    }
  }

  // FLEE
  if (nearestThreat && Math.sqrt(threatDist2) < FLEE_TRIGGER) {
    const dx = bot.x - nearestThreat.x;
    const dy = bot.y - nearestThreat.y;
    const len = Math.hypot(dx, dy) || 1;
    bot.targetX = clamp(bot.x + (dx / len) * 500, 50, world.width - 50);
    bot.targetY = clamp(bot.y + (dy / len) * 500, 50, world.height - 50);
    return;
  }

  // CHASE
  if (nearestPrey) {
    bot.targetX = nearestPrey.x;
    bot.targetY = nearestPrey.y;
    return;
  }

  // PELLET HUNT — scan a sample for cheapness
  let nearestPellet = null;
  let pelletDist2 = Infinity;
  for (const p of world.pellets.values()) {
    const d2 = (p.x - bot.x) ** 2 + (p.y - bot.y) ** 2;
    if (d2 < pelletDist2) {
      nearestPellet = p;
      pelletDist2 = d2;
    }
  }
  if (nearestPellet && pelletDist2 < SIGHT * SIGHT) {
    bot.targetX = nearestPellet.x;
    bot.targetY = nearestPellet.y;
    return;
  }

  // WANDER — pick a new point if we got close to the last one
  if ((bot.targetX - bot.x) ** 2 + (bot.targetY - bot.y) ** 2 < 50 * 50) {
    bot.targetX = Math.random() * world.width;
    bot.targetY = Math.random() * world.height;
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
