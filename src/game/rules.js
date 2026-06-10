// Pure rule functions. No mutation of outside state, no side effects.
// Easy to unit-test, easy to reuse on a server.

export const PHOTO_GAIN_PER_SEC = 1.0;      // base mass/sec when stationary
export const DECAY_RATE = 0.002;            // 0.2%/s of mass, always — the leader treadmill
export const MOVE_TAX_RATE = 0.002;         // additional 0.2%/s of mass while moving
export const MOVE_COST_MIN = 0.2;           // movement is never free, even when tiny
export const MIN_MASS = 10;                 // floor — can't shrink below this
export const EAT_RATIO = 1.25;              // must be 25% bigger to eat
export const CORPSE_SCATTER_MASS = 80;      // victims above this scatter 20% of their mass as pellets

export const THORN_POP_MASS = 110;          // blobs above this burst on thorn contact
export const THORN_FEED_COUNT = 5;          // ejected pellets to make a thorn fire
export const THORN_SHOT_SPEED = 520;        // launch speed of a fired thorn

export const FRENZY_WINDOW_MS = 6000;       // kill-chain window
export const FRENZY_MAX = 4;                // frenzy 4 = ×1.75 mass from kills
export const EJECT_MIN_MASS = 30;           // can't eject below this
export const EJECT_COST = 4;                // mass lost per eject
export const EJECT_PELLET_MASS = 3;         // mass of the ejected pellet
export const EJECT_SPEED = 520;             // initial velocity of ejected mass

// Does blob A eat blob B?
export function canEat(a, b) {
  if (!a.alive || !b.alive) return false;
  if (a.effects.ghost && a.effects.ghost > Date.now()) return false;
  if (b.effects.ghost && b.effects.ghost > Date.now()) return false;
  return a.mass >= b.mass * EAT_RATIO;
}

// Circle-circle overlap helper.
export function overlaps(a, b, factor = 1) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = (a.radius + b.radius) * factor;
  return dx * dx + dy * dy < r * r;
}

// Apply photosynthesis / decay / movement tax to a blob over `dt` seconds.
// mods.zoneMul — terrain multiplier (sun grove ×2, shade ×0)
// mods.lightMul — day/night multiplier (computed by World from its clock)
//
// The economy's shape: proportional decay means photosynthesis alone has a
// natural ceiling (~mass 500-800 at noon) — past that, you must hunt or shrink.
// Small blobs barely feel decay; the leader is on a treadmill.
export function applyPhotosynthesis(blob, dt, now = Date.now(), mods = {}) {
  const { zoneMul = 1, lightMul = 1, decayMul = 1 } = mods;
  const moving = Math.hypot(blob.vx, blob.vy) > 1;
  const bloomActive = blob.effects.bloom && blob.effects.bloom > now;
  const wiltedBy = blob.wiltedUntil && blob.wiltedUntil > now;

  const decay = blob.mass * DECAY_RATE * decayMul;
  let delta;
  if (moving) {
    const tax = Math.max(MOVE_COST_MIN, blob.mass * MOVE_TAX_RATE) * (wiltedBy ? 2 : 1);
    delta = -(decay + tax) * dt;
  } else {
    const gain = PHOTO_GAIN_PER_SEC * (bloomActive ? 3 : 1) * zoneMul * lightMul;
    delta = (gain - decay) * dt;
  }

  blob.mass = Math.max(MIN_MASS, blob.mass + delta);
}

// Split a blob into two. Returns the new blob, or null if too small.
export function trySplit(blob) {
  if (blob.mass < MIN_MASS * 2) return null;
  const half = blob.mass / 2;
  blob.mass = half;
  // The renderer/world will give the new piece an initial velocity away from the parent.
  return { x: blob.x, y: blob.y, mass: half };
}
