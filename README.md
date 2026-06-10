# photosynth-io

A browser-based agar.io-style game set in a bioluminescent abyssal garden. Be still. Grow. Consume.

## The core twist

**Photosynthesis economy.** Standing still slowly grows you. Moving burns mass. Small blobs can hide and grow; big blobs have to keep hunting or shrink. Every moment is a trade between safety and growth.

**The leader is on a treadmill.** Everything decays at 0.2% of its mass per second (the agar.io rate) and the movement tax is proportional too — tiny blobs barely feel it, but photosynthesis alone caps out around 500–800 mass. Past that you hunt or you shrink. Big victims scatter 20% of their mass as pellets when eaten, pulling scavengers into feeding frenzies at every kill site.

The economy is shaped by three more layers:

- **Day/night cycle** — a ~3-minute cosine clock scales photosynthesis from ×0.4 (midnight) to ×1.6 (noon). Farm at noon, hunt in the dark.
- **Sun groves** — golden pools where photosynthesis runs ×2, but everyone can see you glowing.
- **Shade pools** — no photosynthesis, but you're invisible to anything beyond close range.

## Hazards & power-ups

**Thorn bushes** dot the map. Blobs above 110 mass that touch one burst into pieces (and lose 15%). Small blobs can shelter under them.

**Power-up pellets** grant 8-second buffs:

| Pellet | Effect |
|--------|--------|
| ⚡ Speed | 1.5x velocity, doubled movement tax |
| 🛡️ Shield | Survive one fatal hit |
| 👁️ Vision | Reveals every blob on the minimap, wider camera |
| 🧲 Magnet | Pellets drift toward you |
| 👻 Ghost | Phase through bigger blobs |
| 🌸 Bloom | 3x photosynthesis rate (but you glow visibly) |
| 🥀 Wilt | Enemies in radius lose mass 2x faster when moving |

Bloom and Wilt make the photosynthesis layer interactive instead of passive.

## The garden's residents

20 named bots with three personalities:

- **Hunters** chase prey relentlessly and detour for power-ups.
- **Farmers** camp sun groves and photosynthesize, fleeing early.
- **Cowards** live on pellets and bolt for shade when threatened.

Bots have reaction time, and a rooted blob reads as flora — nothing flees
from a plant until it's close enough to touch. The hunting loop: root near
food, grow while you wait, then pounce. Splitting launches the new piece
toward your cursor, so a well-timed split is how you actually catch things.

Rare gold pellets are worth 3x. Eject mass to bait, feed, or shed weight before a thorn.

## Controls

Movement is liquid, agar.io-style: cursor distance is the throttle. Far cursor = full speed, near cursor = creep, cursor on yourself = ease to a stop and photosynthesize. Blobs have inertia — big ones turn slowly.

- **Mouse** — swim toward cursor (park the cursor on yourself to root)
- **Spacebar** — split
- **W / right-click** — eject mass
- **Hold S** — root in place and grow
- **M** — mute
- **Touch** — floating joystick (left side) + split/eject buttons; release to root

## Meta

- **Missions** — three active at a time (short/medium/long), Jetpack Joyride-style: "survive a full night", "pounce-kill 2 blobs", "become #1". Completing one earns a star and slots in a new mission; near-misses show on the death screen.
- **Skins** — five membrane patterns unlock at personal-best mass milestones (80/150/250/400)
- **Personal bests** — peak mass, longest life, and lives are stored locally
- **Death report** — survival time, peak mass, kills, pellets, and who ate you
- All audio is synthesized with the Web Audio API — no sound files

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
  main.js           Entry point: state machine (menu/playing/dead), profile,
                    bests, HUD, leaderboard, skin picker
  game/             Portable game logic (will move to server later)
    world.js        World state, tick loop, zones, day/night, thorns, events
    entities.js     Blob, Pellet, PowerUp, Thorn classes
    rules.js        Eating, photosynthesis, split, eject — pure functions
  ai/
    bot.js          Bot personalities (hunter/farmer/coward) + name pool
  render/
    renderer.js     Canvas drawing: cells, zones, particles, plankton,
                    light shafts, camera (lerp/shake/kick), minimap
    skins.js        Membrane patterns + unlock thresholds
  audio/
    sound.js        Synthesized SFX + ambient drone (Web Audio)
  input/
    input.js        Mouse, keyboard, and touch joystick → game commands
  net/
    local.js        Local in-browser transport (websocket later)
```

The split between `game/` + `ai/` and everything else is intentional: the first set is server-authoritative logic with no DOM access. Each `world.tick()` emits an event list (eats, kills, pops, pickups) that the client consumes for particles, sound, and stats — exactly what a server would broadcast. When multiplayer ships, `game/` and `ai/` move to a Node.js server unchanged.

## Roadmap

- **Phase 1** — Player blob, food pellets, photosynthesis economy, camera follow ✅
- **Phase 2** — AI bots (~20), eating mechanics, split (spacebar) ✅
- **Phase 3** — Power-up pellets, leaderboard, sound, polish ✅
- **Phase 3.5** — Zones, day/night, thorns, personalities, skins, mobile, juice ✅
- **Phase 4** — Multiplayer via Node.js + socket.io on Render/Railway

## Hosting

GitHub Pages serves the `dist/` output. Vite is configured with `base: '/photosynth-io/'` so asset paths work on the project page URL.
