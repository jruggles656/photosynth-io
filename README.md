# photosynth-io

A browser-based agar.io-style game with two original twists.

## The twists

**Photosynthesis economy.** Standing still slowly grows you. Moving burns mass. Small blobs can hide and grow; big blobs have to keep hunting or shrink. Every moment is a trade between safety and growth.

**Power-up pellets.** Rare glowing pellets grant 8-second buffs:

| Pellet | Effect |
|--------|--------|
| ⚡ Speed | 1.5x velocity, doubled movement tax |
| 🛡️ Shield | Survive one fatal hit |
| 👁️ Vision | See the entire map |
| 🧲 Magnet | Pellets drift toward you |
| 👻 Ghost | Phase through bigger blobs |
| 🌸 Bloom | 3x photosynthesis rate (but you glow visibly) |
| 🥀 Wilt | Enemies in radius lose mass 2x faster when moving |

Bloom and Wilt make the photosynthesis layer interactive instead of passive.

## Controls

- **Mouse** — move toward cursor
- **Spacebar** — split
- **Right-click** — eject mass

## Getting started

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

To build for production:

```bash
npm run build
npm run preview   # test the production build locally
```

## Project structure

```
src/
  main.js           Entry point, wires everything together
  game/             Portable game logic (will move to server later)
    world.js        World state and tick loop
    entities.js     Blob, Pellet, PowerUp classes
    rules.js        Eating, photosynthesis, split — pure functions
  ai/
    bot.js          Bot state machine (wander/chase/flee)
  render/
    renderer.js     Canvas drawing, camera, zoom
  input/
    input.js        Mouse + keyboard → game commands
  net/
    local.js        Local in-browser transport (websocket later)
```

The split between `game/` + `ai/` and `render/` + `input/` + `net/` is intentional: the first set is server-authoritative game logic, the second is client-only. When multiplayer ships, `game/` and `ai/` move to a Node.js server unchanged.

## Roadmap

- **Phase 1** — Player blob, food pellets, photosynthesis economy, camera follow
- **Phase 2** — AI bots (~20), eating mechanics, split (spacebar)
- **Phase 3** — Power-up pellets, leaderboard, sound, polish
- **Phase 4** — Multiplayer via Node.js + socket.io on Render/Railway

## Hosting

GitHub Pages serves the `dist/` output. Vite is configured with `base: '/photosynth-io/'` so asset paths work on the project page URL.
