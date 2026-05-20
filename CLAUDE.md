# CLAUDE.md

## What This Is

A browser-based agar.io-style game with two original mechanics: a photosynthesis economy (still = grow, move = burn) and power-up pellets that interact with that economy (Bloom boosts growth, Wilt drains nearby movers).

Vanilla JS + HTML5 Canvas, Vite for tooling, deploys to GitHub Pages.

## Project Structure

```
src/
  main.js           Entry point
  game/             Portable, server-ready logic
    world.js        World state + tick()
    entities.js     Blob, Pellet, PowerUp
    rules.js        Pure functions: eating, photosynthesis, split
  ai/bot.js         Bot brains (will move to server with game/)
  render/renderer.js  Canvas drawing only
  input/input.js    Mouse + keyboard
  net/local.js      Transport stub — replace with socket.io for MP
```

**Important architectural rule:** `game/` and `ai/` must stay free of DOM/canvas/window references. They get serialized state in, return new state out. This is what makes the multiplayer migration mechanical instead of a rewrite.

## Development

```bash
npm install          # first time only
npm run dev          # dev server with HMR
npm run build        # production build → dist/
npm run preview      # test the prod build locally
```

## Rules

- Security: never commit API keys, tokens, Tailscale IPs (100.x.x.x). Private IPs (10.x, 192.168.x) are fine.
- Don't put DOM/canvas references inside `src/game/` or `src/ai/`. If you need a render hook, expose it through `src/render/` instead.
- Keep `src/game/rules.js` as pure functions — they're the easiest part to unit-test and the most critical to get right.
- When adding a new entity type or power-up, update `entities.js`, `rules.js`, and `renderer.js` together so the game stays consistent.
