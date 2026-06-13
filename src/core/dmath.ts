/**
 * Deterministic trigonometry for the organic-outline algorithm.
 *
 * The "algorithm as spec" contract requires that the same algorithm version +
 * config + seed reproduce the identical outline in ANY conforming
 * implementation (JS engine, Swift, Kotlin, Rust, ...). IEEE-754 double
 * +, -, *, / and floor are exactly specified everywhere, but Math.sin/Math.cos
 * are not bit-reproducible across engines or languages. The generator
 * therefore uses these fixed approximations exclusively; ports must
 * reimplement them verbatim.
 */

// Spec constants: π and its multiples, frozen as the nearest binary64 values
// (identical to Math.PI / every mainstream language's f64 π, but declared
// normative so ports transcribe them rather than trusting their stdlib).
export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/**
 * cos(x), deterministic.
 *
 * Range-reduce to r ∈ [-π, π] via r = x - 2π·floor(x/2π + 0.5), then evaluate
 * the Maclaurin series of cos truncated at degree 22 with Horner's method.
 * Max abs error ≈ 1.4e-12 on the reduced interval — far below visual
 * relevance, and every step is an exactly-rounded IEEE-754 operation.
 */
export function dcos(x: number): number {
  const r = x - TWO_PI * Math.floor(x / TWO_PI + 0.5);
  const z = r * r;
  let acc = -1 / 1124000727777607680000; // -1/22!
  acc = 1 / 2432902008176640000 + z * acc; //  1/20!
  acc = -1 / 6402373705728000 + z * acc; // -1/18!
  acc = 1 / 20922789888000 + z * acc; //  1/16!
  acc = -1 / 87178291200 + z * acc; // -1/14!
  acc = 1 / 479001600 + z * acc; //  1/12!
  acc = -1 / 3628800 + z * acc; // -1/10!
  acc = 1 / 40320 + z * acc; //  1/8!
  acc = -1 / 720 + z * acc; // -1/6!
  acc = 1 / 24 + z * acc; //  1/4!
  acc = -1 / 2 + z * acc; // -1/2!
  return 1 + z * acc;
}

/** sin(x), deterministic: sin(x) = cos(x - π/2). */
export function dsin(x: number): number {
  return dcos(x - HALF_PI);
}
