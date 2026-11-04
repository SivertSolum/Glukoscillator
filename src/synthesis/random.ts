// Seeded randomness
// Lets glucose-driven randomize be reproducible: the same days (+ variation)
// always produce the same "signature" sound.

/** A function returning a float in [0, 1), like Math.random */
export type RandomSource = () => number;

/**
 * FNV-1a 32-bit hash of a string → unsigned 32-bit seed
 */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG — small, fast, good enough for sound design
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded RNG for a set of oscillator days plus a variation number.
 * Order matters (osc 1/2/3 positions affect per-oscillator mapping).
 * variation 0 = the days' signature sound; other values = mutations.
 */
export function createDaySignatureRandom(dates: (string | null)[], variation: number = 0): RandomSource {
  const key = dates.map(d => d ?? '-').join('|') + `#${variation}`;
  return createSeededRandom(hashString(key));
}
