# CLAUDE.md

## What This Is

A browser-based agar.io-style game with a photosynthesis economy (still = grow, move = burn) layered with a day/night cycle, terrain zones (sun groves ×2 photo / shade = stealth + no photo), thorn hazards that pop big blobs, power-up pellets, bot personalities, skins, missions, and synthesized audio.

Key tuning facts (researched against agar.io's actual numbers — see git history):
- Movement: cursor-distance throttle + velocity smoothing (inertia); maxSpeed = 660/radius^0.449 (agar's curve). No discrete stop state.
- Economy: 0.2%/s proportional decay on everything + proportional move tax — photosynthesis alone caps out ~500-800 mass; the leader must hunt. Big victims scatter 20% of mass as pellets (corpse economy → bot feeding frenzies).
- Bots: 180-400ms reaction time, rooted blobs read as flora (ambush hunting), hunters split-pounce at 2.8x advantage and see 30% further at night.
- Missions: Jetpack Joyride model — 3 active (short/medium/long tiers), pool in main.js, persisted with stars in localStorage.
- Run arc: dawn escalation in world.tick (day 2 elites stalk the player, day 3 the Elder spawns; eat its last piece = win → 'won' state + Overgrowth tiers via world modifiers). Frenzy kill-chains (×1.25/step), thorn artillery (5 ejected pellets → fired thorn), legacy gold (death seeds next spawn).
- Daily garden: mulberry32-seeded world generation (zones/thorns/pellets/bot identities) keyed to the date; in-run randomness stays unseeded. Free play passes seed null.
- PWA: public/manifest.webmanifest + icon.svg + PNGs (regenerate via qlmanage/sips if the SVG changes).

Vanilla JS + HTML5 Canvas, Vite for tooling, deploys to GitHub Pages. Aesthetic: bioluminescent abyssal garden — Fraunces (display) + Spline Sans Mono (UI), palette in `:root` CSS vars in index.html.

## Project Structure

```
src/
  main.js           Entry: state machine (menu/playing/dead), profile + bests
                    (localStorage), HUD/leaderboard/skin picker, sound wiring
  game/             Portable, server-ready logic — NO DOM/canvas/window refs
    world.js        World state + tick(); zones, day/night clock, thorns,
                    eject, pellet physics; emits world.events each tick
    entities.js     Blob, Pellet, PowerUp, Thorn
    rules.js        Pure functions: eating, photosynthesis (takes zone/light
                    multipliers), split, eject + balance constants
  ai/bot.js         Personalities (hunter/farmer/coward), name pool, shade
                    stealth, thorn avoidance (server-ready, no DOM)
  render/
    renderer.js     All cosmetics: cell bodies (wobble/gradient/nucleus),
                    zones, particles, plankton, light shafts, day/night tint,
                    camera (lerp + zoom kick + shake), minimap
    skins.js        Membrane patterns + unlock thresholds (best mass)
  audio/sound.js    Web Audio synth: SFX + ambient drone, no asset files
  input/input.js    Mouse + keyboard + touch joystick → command objects
  net/local.js      Transport stub — replace with socket.io for MP
```

## Key Architecture Facts

- **`game/` and `ai/` must stay free of DOM/canvas/window references.** They get state in, return state out. This makes the multiplayer migration mechanical.
- **`world.events`** is the bridge: each `tick()` clears and refills it with serializable events (`eat-pellet`, `eat-blob`, `powerup`, `pop`, `split`, `eject`, `merge`, `shield-pop`). The renderer consumes them for particles/camera kicks, main.js for sounds/stats. In multiplayer these become the server broadcast.
- Bots have unique string `ownerId`s (`b1`, `b2`…) so thorn-popped pieces merge back and don't eat each other.
- All persistence is two localStorage keys: `photosynth.profile.v1`, `photosynth.best.v1`.
- `window.__world` is exposed in dev only (`import.meta.env.DEV`) for console debugging.

## Development

```bash
npm install          # first time only
npm run dev          # dev server with HMR
npm run build        # production build → dist/
npm run preview      # test the prod build locally
```

Note: requestAnimationFrame suspends when the tab is hidden — the game intentionally pauses in background tabs.

## Rules

- Security: never commit API keys, tokens, Tailscale IPs (100.x.x.x). Private IPs (10.x, 192.168.x) are fine.
- Don't put DOM/canvas references inside `src/game/` or `src/ai/`. If you need a render hook, emit a `world.events` entry instead.
- Keep `src/game/rules.js` as pure functions — they're the easiest part to unit-test and the most critical to get right.
- When adding a new entity type or power-up, update `entities.js`, `rules.js`, and `renderer.js` together so the game stays consistent.
- Balance constants live at the top of `rules.js` and `world.js` — tune there, not inline.
