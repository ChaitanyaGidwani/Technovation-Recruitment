// Deterministic 8-bit avatar generator. Same seed -> same face, so a
// candidate's ticket avatar is stable across sessions.

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [
  "#39ff14",
  "#00f0ff",
  "#ff00d4",
  "#ffe600",
  "#ff2e63",
  "#a020f0",
  "#ff8c00",
];

export interface AvatarData {
  grid: boolean[][]; // 8 rows x 8 cols, mirrored horizontally
  color: string;
  bg: string;
}

/**
 * Builds a symmetric 8x8 pixel face from a seed string.
 */
export function generateAvatar(seed: string): AvatarData {
  const rng = mulberry32(hashSeed(seed || "player"));
  const color = PALETTE[Math.floor(rng() * PALETTE.length)];
  const size = 8;
  const half = size / 2;
  const grid: boolean[][] = [];

  for (let y = 0; y < size; y++) {
    const row: boolean[] = new Array(size).fill(false);
    for (let x = 0; x < half; x++) {
      // Keep a border margin empty for a cleaner "face" silhouette.
      const edge = y === 0 || y === size - 1;
      const on = edge ? rng() > 0.75 : rng() > 0.5;
      row[x] = on;
      row[size - 1 - x] = on; // mirror
    }
    grid.push(row);
  }

  return { grid, color, bg: "#05130a" };
}
