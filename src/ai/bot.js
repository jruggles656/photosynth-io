// Bot brains. Lives next to game/ because it also runs server-side when MP ships.
// Input: bot blob + world. Output: writes new target onto the bot. No DOM access.

import { EAT_RATIO, THORN_POP_MASS } from '../game/rules.js';

export const BOT_NAMES = [
  'Chloro Phil', 'Moss Def', 'Fern Gully', 'Kelp Wanted', 'Vine Diesel',
  'Algae Bra', 'Spore-adic', 'Photo Finish', 'Lil Sprout', 'Twiggy',
  'Sunny D', 'Root Canal', 'Sage', 'Petal', 'Thistle', 'Willow',
  'Cedar', 'Bud', 'Leaf Erikson', 'Stoma Lisa', 'Cell-ery', 'Germinator',
  'Nettle', 'Bramble',
];

export const ELITE_NAMES = ['Blight', 'Canker', 'Wither', 'Rot', 'Gall', 'Mildew'];

// hunter — chases prey relentlessly, grabs power-ups, only flees at close range
// farmer — camps sun groves and photosynthesizes, flees early
// coward — long flight reflex, pellet diet, runs for shade when threatened
const PERSONALITIES = {
  hunter: { sight: 750, flee: 230, pelletSight: 550 },
  farmer: { sight: 550, flee: 380, pelletSight: 300 },
  coward: { sight: 650, flee: 460, pelletSight: 650 },
  elite: { sight: 850, flee: 200, pelletSight: 600 },
  elder: { sight: 400, flee: 0, pelletSight: 0 },
};

export function randomBotIdentity(rand = Math.random) {
  const roll = rand();
  const personality = roll < 0.35 ? 'hunter' : roll < 0.7 ? 'coward' : 'farmer';
  return { name: BOT_NAMES[Math.floor(rand() * BOT_NAMES.length)], personality };
}

export function decideBotMove(bot, world) {
  // Reaction time: bots commit to a decision for 180-400ms. Lunges and
  // jukes can land inside that window — instant per-frame reactions can't be beaten.
  if (bot.nextThink === undefined) bot.nextThink = 0;
  if (world.time < bot.nextThink) return;
  bot.nextThink = world.time + 0.18 + Math.random() * 0.22;

  const P = PERSONALITIES[bot.personality] ?? PERSONALITIES.coward;
  // Hunters see further in the dark — nights are dangerous.
  const sight = bot.personality === 'hunter' && world.lightLevel < 0.35 ? P.sight * 1.3 : P.sight;

  // The Elder never hunts and never flees — it drifts between groves,
  // consuming whatever drifts into its path. A landmark, not a chaser.
  if (bot.personality === 'elder') {
    const groves = world.zones.filter((z) => z.type === 'grove');
    if (groves.length) {
      if (bot.groveIdx === undefined) bot.groveIdx = 0;
      const grove = groves[bot.groveIdx % groves.length];
      if (Math.hypot(grove.x - bot.x, grove.y - bot.y) < 120) bot.groveIdx++;
      bot.targetX = grove.x;
      bot.targetY = grove.y;
    }
    avoidThorns(bot, world);
    return;
  }

  let nearestThreat = null;
  let threatDist2 = Infinity;
  let nearestPrey = null;
  let preyDist2 = Infinity;

  for (const other of world.blobs.values()) {
    if (other.id === bot.id || !other.alive) continue;
    if (other.ownerId !== null && other.ownerId === bot.ownerId) continue;
    const d2 = (other.x - bot.x) ** 2 + (other.y - bot.y) ** 2;
    if (d2 > sight * sight) continue;

    // Shade stealth: blobs sitting in shade are invisible beyond close range.
    if (d2 > 150 * 150) {
      const zone = world.zoneAt(other.x, other.y);
      if (zone && zone.type === 'shade') continue;
    }

    if (other.mass >= bot.mass * EAT_RATIO) {
      // A rooted blob reads as flora — bots only fear it at point-blank range.
      // This is what makes ambush hunting (root, wait, pounce) work.
      const rooted = Math.hypot(other.vx, other.vy) < 1;
      const pointBlank = (other.radius + bot.radius + 40) ** 2;
      if (rooted && d2 > pointBlank) continue;
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
  if (nearestThreat && Math.sqrt(threatDist2) < P.flee) {
    // Cowards bolt for the nearest shade pool if one is reachable.
    if (bot.personality === 'coward') {
      const shade = nearestZone(bot, world, 'shade', 800);
      if (shade) {
        bot.targetX = shade.x;
        bot.targetY = shade.y;
        avoidThorns(bot, world);
        return;
      }
    }
    const dx = bot.x - nearestThreat.x;
    const dy = bot.y - nearestThreat.y;
    const len = Math.hypot(dx, dy) || 1;
    bot.targetX = clamp(bot.x + (dx / len) * 500, 50, world.width - 50);
    bot.targetY = clamp(bot.y + (dy / len) * 500, 50, world.height - 50);
    avoidThorns(bot, world);
    return;
  }

  // STALK — elites hunt the player specifically, ignoring easier meals.
  if (bot.personality === 'elite') {
    let target = null;
    let d2best = Infinity;
    for (const o of world.blobs.values()) {
      if (!o.alive || !o.isPlayer) continue;
      const d2 = (o.x - bot.x) ** 2 + (o.y - bot.y) ** 2;
      if (d2 > P.sight * P.sight * 2.25) continue; // they smell the player from far off
      if (d2 > 150 * 150 && world.zoneAt(o.x, o.y)?.type === 'shade') continue;
      if (bot.mass < o.mass * EAT_RATIO) continue;
      if (d2 < d2best) {
        target = o;
        d2best = d2;
      }
    }
    if (target) {
      bot.targetX = target.x;
      bot.targetY = target.y;
      if (bot.mass > target.mass * 2.8 && bot.mass >= 64 && d2best < 340 * 340 && Math.random() < 0.4) {
        bot.wantsSplit = true;
      }
      avoidThorns(bot, world);
      return;
    }
  }

  // FARM — farmers head for a sun grove and sit still in it.
  if (bot.personality === 'farmer') {
    const grove = nearestZone(bot, world, 'grove', Infinity);
    if (grove) {
      const dist = Math.hypot(grove.x - bot.x, grove.y - bot.y);
      if (dist < grove.radius * 0.6) {
        // Inside: graze a very close pellet, otherwise root in place and grow.
        const pellet = nearestPellet(bot, world, 200);
        if (pellet) {
          bot.targetX = pellet.x;
          bot.targetY = pellet.y;
        } else {
          bot.targetX = bot.x;
          bot.targetY = bot.y;
        }
        return;
      }
      bot.targetX = grove.x + (Math.random() - 0.5) * grove.radius * 0.5;
      bot.targetY = grove.y + (Math.random() - 0.5) * grove.radius * 0.5;
      avoidThorns(bot, world);
      return;
    }
  }

  // CHASE
  if (nearestPrey) {
    bot.targetX = nearestPrey.x;
    bot.targetY = nearestPrey.y;
    // Split-pounce when the math is overwhelming — the genre's jump-scare.
    if (
      bot.mass > nearestPrey.mass * 2.8 &&
      bot.mass >= 64 &&
      preyDist2 < 340 * 340 &&
      Math.random() < 0.4
    ) {
      bot.wantsSplit = true;
    }
    avoidThorns(bot, world);
    return;
  }

  // Hunters detour for power-ups.
  if (bot.personality === 'hunter') {
    let nearestPU = null;
    let puDist2 = Infinity;
    for (const pu of world.powerUps.values()) {
      const d2 = (pu.x - bot.x) ** 2 + (pu.y - bot.y) ** 2;
      if (d2 < puDist2) {
        nearestPU = pu;
        puDist2 = d2;
      }
    }
    if (nearestPU && puDist2 < 500 * 500) {
      bot.targetX = nearestPU.x;
      bot.targetY = nearestPU.y;
      avoidThorns(bot, world);
      return;
    }
  }

  // PELLET HUNT
  const pellet = nearestPellet(bot, world, P.pelletSight);
  if (pellet) {
    bot.targetX = pellet.x;
    bot.targetY = pellet.y;
    avoidThorns(bot, world);
    return;
  }

  // WANDER — pick a new point if we got close to the last one
  if ((bot.targetX - bot.x) ** 2 + (bot.targetY - bot.y) ** 2 < 50 * 50) {
    bot.targetX = Math.random() * world.width;
    bot.targetY = Math.random() * world.height;
  }
  avoidThorns(bot, world);
}

function nearestZone(bot, world, type, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const z of world.zones) {
    if (z.type !== type) continue;
    const d = Math.hypot(z.x - bot.x, z.y - bot.y);
    if (d < bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}

function nearestPellet(bot, world, sight) {
  let best = null;
  let bestD2 = sight * sight;
  for (const p of world.pellets.values()) {
    const d2 = (p.x - bot.x) ** 2 + (p.y - bot.y) ** 2;
    if (d2 < bestD2) {
      best = p;
      bestD2 = d2;
    }
  }
  return best;
}

// Big bots steer clear of thorns so they don't pop themselves.
function avoidThorns(bot, world) {
  if (bot.mass <= THORN_POP_MASS) return;
  for (const t of world.thorns.values()) {
    const dx = bot.x - t.x;
    const dy = bot.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < t.radius + bot.radius + 60) {
      const len = d || 1;
      bot.targetX = clamp(bot.x + (dx / len) * 320, 50, world.width - 50);
      bot.targetY = clamp(bot.y + (dy / len) * 320, 50, world.height - 50);
      return;
    }
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
