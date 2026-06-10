// Cosmetic skins. Pure canvas drawing — unlocks are checked client-side against
// the stored personal-best mass. Server never needs to know patterns exist.

export const SKINS = [
  { id: 'plain',   name: 'Plain',   unlock: 0 },
  { id: 'spots',   name: 'Spores',  unlock: 80 },
  { id: 'rings',   name: 'Ripple',  unlock: 150 },
  { id: 'stripes', name: 'Tendril', unlock: 250 },
  { id: 'aurora',  name: 'Aurora',  unlock: 400 },
];

export function isUnlocked(skinId, bestMass) {
  const s = SKINS.find((s) => s.id === skinId);
  return s ? bestMass >= s.unlock : false;
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
