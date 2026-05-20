// Pure rule functions. No mutation of outside state, no side effects.
// Easy to unit-test, easy to reuse on a server.

export const PHOTO_GAIN_PER_SEC = 1.0;      // mass/sec when stationary
export const MOVE_COST_PER_SEC = 0.2;       // mass/sec when moving
export const MIN_MASS = 10;                 // floor — can't shrink below this
export const EAT_RATIO = 1.25;              // must be 25% bigger to eat

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

// Apply photosynthesis / movement tax to a blob over `dt` seconds.
export function applyPhotosynthesis(blob, dt, now = Date.now()) {
  const moving = Math.hypot(blob.vx, blob.vy) > 1;
  const bloomActive = blob.effects.bloom && blob.effects.bloom > now;
  const wiltedBy = blob.wiltedUntil && blob.wiltedUntil > now;

  let delta;
  if (moving) {
    const tax = MOVE_COST_PER_SEC * (wiltedBy ? 2 : 1);
    delta = -tax * dt;
  } else {
    const gain = PHOTO_GAIN_PER_SEC * (bloomActive ? 3 : 1);
    delta = gain * dt;
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
