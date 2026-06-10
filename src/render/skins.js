// Cosmetic skins. Pure canvas drawing — unlocks are checked client-side against
// the stored personal-best mass. Server never needs to know patterns exist.

export const SKINS = [
  { id: 'plain',   name: 'Plain',   unlock: 0 },
  { id: 'spots',   name: 'Spores',  unlock: 80 },
  { id: 'rings',   name: 'Ripple',  unlock: 150 },
  { id: 'stripes', name: 'Tendril', unlock: 250 },
  { id: 'aurora',  name: 'Aurora',  unlock: 400 },
  // Condition skins — earned by feats, not mass
  { id: 'crown',   name: 'Crown',   flag: 'crownKill', hint: 'eat the #1' },
  { id: 'verdant', name: 'Verdant', flag: 'elderWin',  hint: 'eat the Elder' },
];

// Mass-milestone skins check personal-best mass; condition skins check a
// boolean feat flag stored on the bests record.
export function skinUnlocked(skin, bests) {
  if (skin.flag) return !!bests[skin.flag];
  return (bests.peakMass ?? 0) >= skin.unlock;
}

// Draw a skin pattern. Assumes ctx is translated to the blob center and
// already clipped to the body circle of radius r. `seed` gives each blob a
// stable random phase; `t` is seconds for animated skins.
export function drawSkinPattern(ctx, skinId, r, t, seed) {
  switch (skinId) {
    case 'spots': {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < 7; i++) {
        const a = seed + i * 2.39996; // golden angle scatter
        const dist = r * (0.25 + 0.55 * frac(Math.sin(seed + i * 13.7) * 43758.5));
        const size = r * (0.08 + 0.07 * frac(Math.cos(seed + i * 7.3) * 12543.1));
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, size, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'rings': {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      const pulse = (t * 0.4 + seed) % 1;
      for (const base of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (base + 0.06 * Math.sin(t * 2 + seed + base * 9)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1 - pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'stripes': {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(2, r * 0.13);
      ctx.save();
      ctx.rotate(seed + t * 0.15);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(0, r * i * 0.55, r * 0.9, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'crown': {
      // golden zigzag diadem orbiting the membrane
      ctx.save();
      ctx.rotate(t * 0.2 + seed);
      ctx.strokeStyle = 'rgba(255,216,122,0.55)';
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath();
      const points = 7;
      for (let i = 0; i <= points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 0.62 : r * 0.82;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,216,122,0.4)';
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'verdant': {
      // leaf veins radiating from the core — the Elder's mark
      ctx.save();
      ctx.rotate(seed + t * 0.1);
      ctx.strokeStyle = 'rgba(190,255,190,0.3)';
      ctx.lineWidth = Math.max(1, r * 0.035);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a + 0.45) * r * 0.55,
          Math.sin(a + 0.45) * r * 0.55,
          Math.cos(a) * r * 0.92,
          Math.sin(a) * r * 0.92
        );
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,216,122,0.18)');
      g.addColorStop(1, 'rgba(255,216,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
      break;
    }
    case 'aurora': {
      ctx.save();
      ctx.rotate(seed + t * 0.5);
      const g1 = ctx.createRadialGradient(-r * 0.4, 0, 0, -r * 0.4, 0, r * 1.2);
      g1.addColorStop(0, 'rgba(110,231,255,0.35)');
      g1.addColorStop(1, 'rgba(110,231,255,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.rotate(2.1);
      const g2 = ctx.createRadialGradient(r * 0.4, 0, 0, r * 0.4, 0, r * 1.2);
      g2.addColorStop(0, 'rgba(255,138,216,0.3)');
      g2.addColorStop(1, 'rgba(255,138,216,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
      break;
    }
  }
}

function frac(n) {
  return n - Math.floor(n);
}
