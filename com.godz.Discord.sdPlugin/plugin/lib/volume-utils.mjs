// Discord volume transform utilities
// Discord uses a non-linear (power-law) volume scale internally.
// These functions convert between Discord's internal scale and linear percentages.

const k = 0.000273923889073752;
const p = 2.77801691046729;
const A = 71.2252947598792;
const B = -0.0545762819370812;
const C = 0.00347204937032372;
const EPS = 1e-9;

// Linear percentage (0-200) → Discord internal value
export function transformForward(x) {
  if (x <= EPS) return 0;
  if (x < 100) return k * Math.pow(x, p);
  if (Math.abs(x - 100) < EPS) return 100;
  if (x < 200) return A + B * x + C * x * x;
  return 199.526231496887;
}

// Discord internal value → linear percentage (0-200)
export function transformInverse(y) {
  if (y <= EPS) return 0;
  if (y < k * Math.pow(100, p)) return Math.pow(y / k, 1 / p);
  if (Math.abs(y - 100) < EPS) return 100;
  if (y < 199.526231496887) {
    const disc = B * B - 4 * C * (A - y);
    if (disc <= 0) return 100;
    const sqrtDisc = Math.sqrt(disc);
    const r1 = (-B + sqrtDisc) / (2 * C);
    const r2 = (-B - sqrtDisc) / (2 * C);
    const valid = [r1, r2].find((r) => r > 100 && r < 200);
    if (valid) return valid;
    return 100;
  }
  return 200;
}

// Adjust a Discord internal volume value by a linear step
// Returns new Discord internal value
export function adjustVolume(currentRaw, step) {
  currentRaw = Math.min(Math.max(0, currentRaw), 200);
  const linear = transformInverse(currentRaw) + step;
  return transformForward(linear);
}

// Get the display percentage (0-200) from a Discord internal value
export function toPercent(raw) {
  return Math.round(transformInverse(raw));
}
