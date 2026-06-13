/**
 * Seeded PRNG for the organic-outline algorithm (splitmix32 family).
 *
 * Uses only uint32 integer operations (imul, xor, shift) — every conforming
 * implementation reproduces the identical stream. No third-party library:
 * the algorithm is part of the spec and must never change underneath us.
 */

/** One splitmix32/murmur3-style finalizer: maps a uint32 to a well-mixed uint32. */
export function mix32(h: number): number {
  h = h | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Sequential splitmix32 stream. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next uint32. */
  nextU32(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    return mix32(this.state);
  }

  /** Next float in [0, 1). Division by 2^32 is exact in IEEE-754. */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Next float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Next float in [-1, 1). */
  signed(): number {
    return this.next() * 2 - 1;
  }
}

/**
 * Channel salts (ASCII tags). Each randomness consumer derives its own
 * sub-seed so that, e.g., changing strokeWidthVariation can never
 * re-randomize the outline shape: channels are independent by construction.
 */
export const CHANNEL = {
  radial: 0x52414446, // "RADF" — radial displacement field
  stroke: 0x5354524b, // "STRK" — stroke width field
  corners: 0x434f524e, // "CORN" — per-corner radius variation
  asym: 0x4153594d, // "ASYM" — global asymmetry direction
} as const;

/** Derive a channel sub-seed from the config seed. */
export function channelSeed(seed: number, salt: number): number {
  return mix32(((seed >>> 0) ^ salt) >>> 0);
}

/**
 * Derive the seed of instance `index` under seedPolicy "per-instance".
 * Part of the spec: the instance grid must be reproducible too.
 */
export function instanceSeed(seed: number, index: number): number {
  return mix32(((seed >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0);
}
