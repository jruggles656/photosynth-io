// Entry point. Wires world + input + transport + renderer + sound + UI together.
// Also owns the client-side meta layer: profile, personal bests, skin unlocks.

import { World } from './game/world.js';
import { BLOB_COLORS } from './game/entities.js';
import { Renderer } from './render/renderer.js';
import { SKINS, drawSkinPattern } from './render/skins.js';
import { Input } from './input/input.js';
import { LocalTransport } from './net/local.js';
import { SoundEngine } from './audio/sound.js';

const PLAYER_OWNER_ID = 1;
const POWERUP_GLYPHS = {
  speed: '⚡', shield: '🛡', vision: '👁', magnet: '🧲',
  ghost: '👻', bloom: '🌸', wilt: '🥀',
};
const POWERUP_COLORS = {
  speed: '#ffd24a', shield: '#5fa0ff', vision: '#e8fbff', magnet: '#ff7a5a',
  ghost: '#cfcfff', bloom: '#ff8ad8', wilt: '#9a5ab0',
};

// ---- missions (Jetpack Joyride model: 3 active, tiered, always replaceable) ----

const MISSION_POOL = [
  { id: 'pellets40', tier: 'short', text: 'eat 40 pellets in one life', stat: 'pellets', target: 40, perRun: true },
  { id: 'gold3', tier: 'short', text: 'eat 3 gold pellets', stat: 'gold', target: 3 },
  { id: 'powerups4', tier: 'short', text: 'grab 4 power-ups', stat: 'powerups', target: 4 },
  { id: 'mass150', tier: 'short', text: 'reach 150 mass', stat: 'peakMass', target: 150, perRun: true },
  { id: 'kill3', tier: 'medium', text: 'consume 3 blobs in one life', stat: 'kills', target: 3, perRun: true },
  { id: 'pounce2', tier: 'medium', text: 'pounce-kill 2 blobs in one life', stat: 'pounceKills', target: 2, perRun: true },
  { id: 'night1', tier: 'medium', text: 'survive a full night', stat: 'nights', target: 1, perRun: true },
  { id: 'mass300', tier: 'medium', text: 'reach 300 mass', stat: 'peakMass', target: 300, perRun: true },
  { id: 'days3', tier: 'long', text: 'survive 3 days in one life', stat: 'days', target: 3, perRun: true },
  { id: 'apex', tier: 'long', text: 'become #1 in the garden', stat: 'apex', target: 1, perRun: true },
  { id: 'mass500', tier: 'long', text: 'reach 500 mass', stat: 'peakMass', target: 500, perRun: true },
  { id: 'kills15', tier: 'long', text: 'consume 15 blobs (lifetime)', stat: 'kills', target: 15 },
];
const MISSION_BY_ID = Object.fromEntries(MISSION_POOL.map((m) => [m.id, m]));

// ---- persistence ----

const PROFILE_KEY = 'photosynth.profile.v1';
const BEST_KEY = 'photosynth.best.v1';
const MISSIONS_KEY = 'photosynth.missions.v1';
const STARS_KEY = 'photosynth.stars.v1';

function loadJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return { ...fallback };
  }
}

const profile = loadJson(PROFILE_KEY, { name: '', color: BLOB_COLORS[0], skin: 'plain', muted: false });
let bests = loadJson(BEST_KEY, { peakMass: 0, longestSec: 0, kills: 0, games: 0 });
let stars = Number(localStorage.getItem(STARS_KEY) || 0);

const saveProfile = () => localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
const saveBests = () => localStorage.setItem(BEST_KEY, JSON.stringify(bests));
const saveStars = () => localStorage.setItem(STARS_KEY, String(stars));

function pickMission(tier, excludeIds) {
  const candidates = MISSION_POOL.filter((m) => m.tier === tier && !excludeIds.includes(m.id));
  const pool = candidates.length ? candidates : MISSION_POOL.filter((m) => m.tier === tier);
  return pool[Math.floor(Math.random() * pool.length)];
}

let missions;
try {
  missions = JSON.parse(localStorage.getItem(MISSIONS_KEY));
  if (!Array.isArray(missions) || missions.length !== 3 || missions.some((m) => !MISSION_BY_ID[m.id])) missions = null;
} catch {
  missions = null;
}
if (!missions) {
  missions = ['short', 'medium', 'long'].map((tier) => ({ id: pickMission(tier, []).id, progress: 0 }));
}
const saveMissions = () => localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
saveMissions();

// ---- setup ----

const $ = (id) => document.getElementById(id);
const canvas = $('game');

const world = new World({ width: 4000, height: 4000 });
world.seedPellets(500);
for (let i = 0; i < 20; i++) world.spawnBot();

const transport = new LocalTransport(world);
const input = new Input(canvas);
const renderer = new Renderer(canvas, world);
const sound = new SoundEngine();
sound.muted = profile.muted;

input.bindTouch({
  joyEl: $('joy'),
  thumbEl: $('joy-thumb'),
  splitBtn: $('btn-split'),
  ejectBtn: $('btn-eject'),
});
if ('ontouchstart' in window) document.body.classList.add('touch');

// ---- state machine ----

let state = 'menu'; // 'menu' | 'playing' | 'dead'
let run = null; // current run stats
let lastEaterName = null;
let effectsKey = ''; // change-detector for effect chips
let leaderTimer = 1; // > threshold so the board paints on the first frame
let shimmerTimer = 0;
let hitStop = 0; // seconds of near-freeze remaining (kill impact)
let pelletCombo = 0;
let lastPelletAt = 0;
const massHistory = []; // [t, mass] ring for the rate readout

// ---- mission helpers ----

function missionProgress(m) {
  const def = MISSION_BY_ID[m.id];
  const runVal = run ? (run[def.stat] ?? 0) : 0;
  return def.perRun ? runVal : m.progress + runVal;
}

function checkMissions() {
  if (!run) return;
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    const def = MISSION_BY_ID[m.id];
    if (missionProgress(m) >= def.target) {
      stars++;
      saveStars();
      toast(`✦ mission complete · ${def.text}`);
      sound.powerup();
      const next = pickMission(def.tier, missions.map((x) => x.id));
      missions[i] = { id: next.id, progress: 0 };
      saveMissions();
    }
  }
}

function renderMissionList(el) {
  el.innerHTML = missions
    .map((m) => {
      const def = MISSION_BY_ID[m.id];
      const prog = Math.min(def.target, Math.floor(missionProgress(m)));
      const close = prog > 0 && prog >= def.target * 0.6;
      return `<div class="mission-row${close ? ' close' : ''}"><span>${def.text}</span><span class="mission-prog">${prog}/${def.target}</span></div>`;
    })
    .join('');
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  input.enabled = next === 'playing';
}

// ---- start screen ----

function buildColorRow() {
  const row = $('color-row');
  row.innerHTML = '';
  for (const c of BLOB_COLORS) {
    const btn = document.createElement('button');
    btn.className = 'swatch' + (c === profile.color ? ' selected' : '');
    btn.style.color = c;
    btn.innerHTML = `<span class="dot" style="background:${c}"></span>`;
    btn.addEventListener('click', () => {
      profile.color = c;
      saveProfile();
      buildColorRow();
      buildSkinRow();
    });
    row.appendChild(btn);
  }
}

function buildSkinRow() {
  const row = $('skin-row');
  row.innerHTML = '';
  for (const skin of SKINS) {
    const unlocked = bests.peakMass >= skin.unlock;
    const btn = document.createElement('button');
    btn.className = 'skin-btn' + (skin.id === profile.skin ? ' selected' : '') + (unlocked ? '' : ' locked');
    const thumb = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    thumb.width = 40 * dpr;
    thumb.height = 40 * dpr;
    thumb.style.width = '40px';
    thumb.style.height = '40px';
    const tctx = thumb.getContext('2d');
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.translate(20, 20);
    const g = tctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
    g.addColorStop(0, '#ffffff55');
    g.addColorStop(0.4, profile.color);
    g.addColorStop(1, '#00000055');
    tctx.fillStyle = profile.color;
    tctx.beginPath();
    tctx.arc(0, 0, 16, 0, Math.PI * 2);
    tctx.fill();
    tctx.fillStyle = g;
    tctx.fill();
    tctx.save();
    tctx.beginPath();
    tctx.arc(0, 0, 16, 0, Math.PI * 2);
    tctx.clip();
    drawSkinPattern(tctx, skin.id, 16, 1.5, 2.1);
    tctx.restore();
    btn.appendChild(thumb);
    const label = document.createElement('span');
    label.textContent = skin.name;
    btn.appendChild(label);
    if (!unlocked) {
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.textContent = `🔒 ${skin.unlock}`;
      btn.appendChild(lock);
    } else {
      btn.addEventListener('click', () => {
        profile.skin = skin.id;
        saveProfile();
        buildSkinRow();
      });
    }
    row.appendChild(btn);
  }
}

function refreshBestLine() {
  const mins = Math.floor(bests.longestSec / 60);
  const secs = Math.floor(bests.longestSec % 60).toString().padStart(2, '0');
  $('best-line').textContent = bests.games
    ? `best mass ${Math.round(bests.peakMass)} · longest ${mins}:${secs} · ✦ ${stars}`
    : 'first bloom — good luck out there';
}

$('name-input').value = profile.name;
buildColorRow();
buildSkinRow();
refreshBestLine();
renderMissionList($('missions-start'));

// ---- run lifecycle ----

function startGame() {
  profile.name = $('name-input').value.trim() || 'unnamed';
  saveProfile();
  sound.init();
  sound.setMuted(profile.muted);

  world.spawnPlayer({ name: profile.name, ownerId: PLAYER_OWNER_ID, color: profile.color, skin: profile.skin });
  run = {
    startedAt: performance.now(),
    startDay: world.day,
    peakMass: 20,
    kills: 0,
    pellets: 0,
    gold: 0,
    powerups: 0,
    pounceKills: 0,
    nights: 0,
    days: 0,
    apex: 0,
    nightSeen: false,
    lastSplitAt: 0,
  };
  lastEaterName = null;
  massHistory.length = 0;
  effectsKey = '';
  leaderTimer = 1;
  pelletCombo = 0;
  hitStop = 0;
  $('effects').innerHTML = '';
  setState('playing');
}

function endGame() {
  const survived = (performance.now() - run.startedAt) / 1000;
  const mins = Math.floor(survived / 60);
  const secs = Math.floor(survived % 60).toString().padStart(2, '0');

  const newBestMass = run.peakMass > bests.peakMass;
  const newBestTime = survived > bests.longestSec;
  const unlockedBefore = SKINS.filter((s) => bests.peakMass >= s.unlock).length;

  bests.peakMass = Math.max(bests.peakMass, run.peakMass);
  bests.longestSec = Math.max(bests.longestSec, survived);
  bests.kills += run.kills;
  bests.games += 1;
  saveBests();

  const unlockedAfter = SKINS.filter((s) => bests.peakMass >= s.unlock);
  const newSkins = unlockedAfter.length - unlockedBefore;

  $('death-by').innerHTML = lastEaterName
    ? `by <b>${escapeHtml(lastEaterName)}</b>`
    : 'returned to the soil';
  $('stat-time').textContent = `${mins}:${secs}`;
  $('stat-time').classList.toggle('gold', newBestTime);
  $('stat-peak').textContent = Math.round(run.peakMass);
  $('stat-peak').classList.toggle('gold', newBestMass);
  $('stat-kills').textContent = run.kills;
  $('stat-days').textContent = run.days + 1;
  $('new-best').style.display = newBestMass || newBestTime ? 'block' : 'none';

  // Mission near-misses are the one-more-run trigger — render with run stats
  // still live, then bank lifetime progress.
  renderMissionList($('missions-death'));
  for (const m of missions) {
    const def = MISSION_BY_ID[m.id];
    if (!def.perRun) m.progress += run[def.stat] ?? 0;
  }
  saveMissions();
  const unlockNote = $('unlock-note');
  if (newSkins > 0) {
    const names = unlockedAfter.slice(-newSkins).map((s) => s.name).join(', ');
    unlockNote.textContent = `new membrane unlocked: ${names}`;
    unlockNote.style.display = 'block';
  } else {
    unlockNote.style.display = 'none';
  }

  sound.death();
  setState('dead');
  run = null;
  refreshBestLine();
  buildSkinRow();
  renderMissionList($('missions-start'));
}

$('play-btn').addEventListener('click', startGame);
$('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});
$('respawn-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => setState('menu'));

const muteBtn = $('mute-btn');
function applyMute() {
  muteBtn.textContent = profile.muted ? '✕' : '♪';
  muteBtn.style.opacity = profile.muted ? 0.5 : 1;
  sound.setMuted(profile.muted);
}
muteBtn.addEventListener('click', () => {
  profile.muted = !profile.muted;
  saveProfile();
  applyMute();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && state === 'playing') {
    profile.muted = !profile.muted;
    saveProfile();
    applyMute();
  }
});
applyMute();

// ---- per-frame event handling (stats + sound) ----

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'eat-pellet':
        if (e.ownerId === PLAYER_OWNER_ID) {
          run.pellets++;
          const tnow = performance.now();
          pelletCombo = tnow - lastPelletAt < 1000 ? pelletCombo + 1 : 0;
          lastPelletAt = tnow;
          if (e.tint === 3) {
            run.gold++;
            sound.goldEat();
          } else {
            sound.eat(pelletCombo);
          }
        }
        break;
      case 'eat-blob':
        if (e.eaterOwnerId === PLAYER_OWNER_ID) {
          run.kills++;
          if (performance.now() - run.lastSplitAt < 1200) run.pounceKills++;
          hitStop = Math.min(0.12, 0.04 + e.mass / 2500);
          sound.kill();
        }
        if (e.victimOwnerId === PLAYER_OWNER_ID) {
          lastEaterName = e.eaterName || null;
          sound.kill();
        }
        break;
      case 'powerup':
        if (e.ownerId === PLAYER_OWNER_ID) {
          run.powerups++;
          sound.powerup();
        }
        break;
      case 'split':
        if (e.ownerId === PLAYER_OWNER_ID) {
          run.lastSplitAt = performance.now();
          sound.split();
        }
        break;
      case 'eject':
        if (e.ownerId === PLAYER_OWNER_ID) sound.eject();
        break;
      case 'pop':
        if (e.ownerId === PLAYER_OWNER_ID) sound.pop();
        break;
      case 'merge':
        if (e.ownerId === PLAYER_OWNER_ID) sound.merge();
        break;
      case 'shield-pop':
        if (e.ownerId === PLAYER_OWNER_ID) sound.shieldPop();
        break;
    }
  }
}

// ---- HUD ----

function updateHud(pieces, totalMass, now) {
  $('mass-num').textContent = Math.round(totalMass);

  // growth rate over the last ~0.7s
  massHistory.push([now, totalMass]);
  while (massHistory.length > 2 && now - massHistory[0][0] > 700) massHistory.shift();
  const rateEl = $('mass-rate');
  if (massHistory.length > 1) {
    const [t0, m0] = massHistory[0];
    const dtSec = (now - t0) / 1000;
    const rate = dtSec > 0.2 ? (totalMass - m0) / dtSec : 0;
    if (rate > 0.05) {
      rateEl.textContent = `▲ ${rate.toFixed(1)}/s`;
      rateEl.className = 'up';
    } else if (rate < -0.05) {
      rateEl.textContent = `▼ ${Math.abs(rate).toFixed(1)}/s`;
      rateEl.className = 'down';
    } else {
      rateEl.textContent = '';
    }
  }

  $('pieces-sub').textContent = pieces.length > 1 ? `mass · ${pieces.length} pieces` : 'mass';

  // zone chip
  const zone = world.zoneAt(renderer.camera.x, renderer.camera.y);
  const zoneChip = $('zone-chip');
  if (zone?.type === 'grove') {
    zoneChip.textContent = '☀ sun grove · photo ×2';
    zoneChip.className = 'chip grove';
    zoneChip.style.display = 'inline-block';
  } else if (zone?.type === 'shade') {
    zoneChip.textContent = '☁ shade · hidden · no photo';
    zoneChip.className = 'chip shade';
    zoneChip.style.display = 'inline-block';
  } else {
    zoneChip.style.display = 'none';
  }

  // day/night pill
  const light = world.lightLevel;
  const mul = 0.4 + 1.2 * light;
  $('day-pill').firstElementChild.textContent = light > 0.5 ? '☀' : '☾';
  $('day-text').textContent = `day ${world.day - run.startDay + 1} · photosynthesis ×${mul.toFixed(1)}`;

  // run-arc stats: completed days and full nights survived
  run.days = world.day - run.startDay;
  if (light < 0.1) run.nightSeen = true;
  if (run.nightSeen && light > 0.5) {
    run.nights++;
    run.nightSeen = false;
  }
}

// Effect chips rebuild only when the active set changes; CSS animates the drain bar.
function updateEffectChips(blob, nowMs) {
  const active = Object.entries(blob.effects).filter(([, exp]) => exp > nowMs);
  const key = active.map(([t, exp]) => `${t}:${Math.round(exp / 500)}`).join('|');
  if (key === effectsKey) return;
  effectsKey = key;
  $('effects').innerHTML = active
    .map(([type, exp]) => {
      const remaining = Math.max(0, (exp - nowMs) / 1000);
      const color = POWERUP_COLORS[type] || '#fff';
      return `<span class="chip" style="color:${color}">${POWERUP_GLYPHS[type] || '?'} ${type}<span class="bar" style="animation-duration:${remaining.toFixed(2)}s"></span></span>`;
    })
    .join('');
}

function updateLeaderboard() {
  const byOwner = new Map();
  for (const b of world.blobs.values()) {
    if (!b.alive || b.ownerId === null) continue;
    const entry = byOwner.get(b.ownerId) ?? { name: b.name, mass: 0, mine: b.ownerId === PLAYER_OWNER_ID };
    entry.mass += b.mass;
    byOwner.set(b.ownerId, entry);
  }
  const entries = [...byOwner.values()].sort((a, b) => b.mass - a.mass).slice(0, 8);
  if (run && entries[0]?.mine) run.apex = 1;
  $('leaders').innerHTML = entries
    .map((e, i) => `<li class="${e.mine ? 'you' : ''}"><span><span class="rank">${i + 1}</span>${escapeHtml(e.name)}</span><span>${Math.round(e.mass)}</span></li>`)
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- main loop ----

let last = performance.now();

function frame(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Hit-stop: world near-freezes for a beat on kills; particles/camera keep moving.
  let dt = rawDt;
  if (hitStop > 0) {
    hitStop -= rawDt;
    dt = rawDt * 0.08;
  }

  if (state === 'playing') {
    const pieces = world.getOwnedBlobs(PLAYER_OWNER_ID);

    if (pieces.length === 0) {
      world.tick(dt);
      renderer.processEvents(world.events, PLAYER_OWNER_ID);
      renderer.draw(dt);
      endGame();
      requestAnimationFrame(frame);
      return;
    }

    let cx = 0, cy = 0, totalMass = 0;
    for (const p of pieces) {
      cx += p.x;
      cy += p.y;
      totalMass += p.mass;
    }
    cx /= pieces.length;
    cy /= pieces.length;
    run.peakMass = Math.max(run.peakMass, totalMass);

    const target = input.targetFor(cx, cy, renderer.camera);
    transport.sendCommand(PLAYER_OWNER_ID, { type: 'setTarget', x: target.x, y: target.y });
    for (const cmd of input.drainCommands()) {
      transport.sendCommand(PLAYER_OWNER_ID, cmd);
    }

    world.tick(dt);
    handleEvents(world.events);
    renderer.processEvents(world.events, PLAYER_OWNER_ID);

    const nowMs = Date.now();
    renderer.vision = pieces.some((p) => p.effects.vision && p.effects.vision > nowMs);
    renderer.setView({ x: cx, y: cy, mass: totalMass }, rawDt);
    renderer.draw(rawDt);
    renderer.drawMinimap($('minimap'), pieces, renderer.vision);

    updateHud(pieces, totalMass, now);
    updateEffectChips(pieces[0], nowMs);
    checkMissions();

    // soft shimmer while actually growing
    const still = pieces.every((p) => Math.hypot(p.vx, p.vy) <= 1);
    const inShade = world.zoneAt(cx, cy)?.type === 'shade';
    shimmerTimer += dt;
    if (still && !inShade && shimmerTimer > 1.6) {
      shimmerTimer = 0;
      sound.shimmer();
    }

    leaderTimer += dt;
    if (leaderTimer > 0.25) {
      leaderTimer = 0;
      updateLeaderboard();
    }
  } else {
    // menu / death: the garden keeps living behind the overlay — follow the apex blob
    world.tick(dt);
    renderer.processEvents(world.events, PLAYER_OWNER_ID);
    let apex = null;
    for (const b of world.blobs.values()) {
      if (b.alive && (!apex || b.mass > apex.mass)) apex = b;
    }
    if (apex) renderer.setView({ x: apex.x, y: apex.y, mass: 400, zoom: 0.5 }, dt * 0.5);
    renderer.draw(dt);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

if (import.meta.env.DEV) window.__world = world;
