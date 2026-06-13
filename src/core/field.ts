/**
 * Periodic displacement fields of organic-outline@1.
 *
 * Construction (fixed seeded spectrum + smooth spectral envelope):
 *
 *   D_raw(t) = Σ_{k=1..KMAX} w(k) · (gc_k·cos(2πkt) + gs_k·sin(2πkt)),  t ∈ [0,1)
 *
 * - The Gaussian coefficients gc_k, gs_k are drawn ONCE for every integer
 *   harmonic (fixed draw count per channel): no parameter change ever
 *   re-randomizes the shape, every slider is continuous, and the field is a
 *   stationary Gaussian periodic process (uniform random phase + Rayleigh
 *   amplitude per harmonic) — broadband, organic, seamlessly closed.
 * - wavelength/detail act purely through the envelope w(k): wavelength sets
 *   the base harmonic k0 = 1/wavelength ∈ [KMIN, 20]; detail blends in a 1/f
 *   high-frequency tail (the natural-tremor spectrum).
 * - The field is normalized so max|D| = 1 on a fixed grid, which makes
 *   `amplitude` an honest max-deviation budget.
 *
 * This replaces the PRD's simplex-on-a-circle (whose un-normalized loop max
 * varies 0.40–1.00 across seeds, breaking the amplitude budget) and an
 * earlier octave/crossfade draft (gear-like collapse + mid-fade amplitude
 * dips) — see the PRD decision log.
 *
 * Spec constants, frozen in organic-outline@1:
 * - KMIN = 3: k < 2 is translation-like, k = 2 is pure ovalization, which is
 *   `asymmetry`'s exclusive job — the radial channel must never fight it.
 * - KMAX = 64; NORM_GRID = 1024 = 16·KMAX. The 512/1024 render grids are
 *   bit-identical subsets of the norm grid, so the budget is exact on
 *   rendered samples; see normalizationScale() for the 2048-grid bound.
 * - Gaussians via Irwin–Hall: g = (u1+u2+u3+u4 − 2)·√3 — only +,−,× and an
 *   exactly-rounded sqrt, hence bit-reproducible.
 */

import { dcos, dsin, TWO_PI } from "./dmath";
import { Prng } from "./prng";

export const KMIN = 3;
export const KMAX = 64;
export const NORM_GRID = 1024;
/** Base harmonic range: k0 = 1/wavelength clamped to [KMIN, K0MAX]. */
export const K0MAX = 20;

/** Stroke-width field: fixed low-frequency "pen pressure" band (bump at k = 2). */
export const STROKE_KMAX = 8;

const SQRT3 = Math.sqrt(3);

export interface Spectrum {
  /** Indexed by harmonic k; index 0 unused. */
  gc: Float64Array;
  gs: Float64Array;
}

function drawSpectrum(seed: number, kmax: number): Spectrum {
  const rng = new Prng(seed);
  const gc = new Float64Array(kmax + 1);
  const gs = new Float64Array(kmax + 1);
  for (let k = 1; k <= kmax; k++) {
    gc[k] = (rng.next() + rng.next() + rng.next() + rng.next() - 2) * SQRT3;
    gs[k] = (rng.next() + rng.next() + rng.next() + rng.next() - 2) * SQRT3;
  }
  return { gc, gs };
}

/** Radial-channel spectrum: all KMAX harmonics drawn unconditionally. */
export function radialSpectrum(channelSeedValue: number): Spectrum {
  return drawSpectrum(channelSeedValue, KMAX);
}

/** Stroke-channel spectrum: STROKE_KMAX harmonics drawn unconditionally. */
export function strokeSpectrum(channelSeedValue: number): Spectrum {
  return drawSpectrum(channelSeedValue, STROKE_KMAX);
}

/**
 * Radial spectral envelope w(k; wavelength, detail).
 * Lorentzian bump of half-width k0/2 centered at k0 (bandwidth proportional
 * to k0 → broadband at every wavelength), plus a detail-weighted 1/f tail:
 * tail(ρ) = ρ³ below k0, 1/ρ above (ρ = k/k0). Zero below kmin.
 *
 * kmin is the ONLY formula difference between algorithm versions:
 * - organic-outline@1 (frozen): kmin = 3 — k=2 ovalization is reserved for
 *   `asymmetry` in the subtle regime.
 * - organic-outline@2: kmin = 2 — bean/kidney shapes of the bold reference
 *   ARE k=2-dominant deformation; wavelength extends to 0.5 (k0 = 2).
 * - organic-outline@3: kmin = 1 — the extreme/blob regime: a single off-center
 *   lobe (egg/pear) is k=1; wavelength extends to 1.0 (k0 = 1).
 */
function radialWeightsWithFloor(
  wavelength: number,
  detail: number,
  kmin: number,
): Float64Array {
  const w = new Float64Array(KMAX + 1);
  const k0 = Math.min(K0MAX, Math.max(kmin, 1 / wavelength));
  for (let k = kmin; k <= KMAX; k++) {
    const rho = k / k0;
    const d = 2 * (rho - 1);
    const bump = 1 / (1 + d * d);
    const tail = rho < 1 ? rho * rho * rho : 1 / rho;
    w[k] = bump + detail * tail;
  }
  return w;
}

/** organic-outline@1 envelope (frozen). */
export function radialWeights(
  wavelength: number,
  detail: number,
): Float64Array {
  return radialWeightsWithFloor(wavelength, detail, KMIN);
}

/** organic-outline@2 envelope: identical form, k floor lowered to KMIN_V2. */
export const KMIN_V2 = 2;

export function radialWeightsV2(
  wavelength: number,
  detail: number,
): Float64Array {
  return radialWeightsWithFloor(wavelength, detail, KMIN_V2);
}

/** organic-outline@3 envelope: floor lowered to KMIN_V3 — k=1 (egg/pear blob) energy. */
export const KMIN_V3 = 1;

export function radialWeightsV3(
  wavelength: number,
  detail: number,
): Float64Array {
  return radialWeightsWithFloor(wavelength, detail, KMIN_V3);
}

/** Fixed pen-pressure envelope of the stroke-width field (1–2 slow cycles dominate). */
export function strokeWeights(): Float64Array {
  const w = new Float64Array(STROKE_KMAX + 1);
  for (let k = 1; k <= STROKE_KMAX; k++) {
    const d = (k - 2) / 1.5;
    w[k] = 1 / (1 + d * d);
  }
  return w;
}

/**
 * Trig tables cos/sin(2πk·i/n), cached per (kmax, n). Identical values to
 * direct dcos/dsin evaluation — a pure speedup, not a spec deviation.
 */
const tableCache = new Map<string, { cos: Float64Array; sin: Float64Array }>();

function trigTable(
  kmax: number,
  n: number,
): { cos: Float64Array; sin: Float64Array } {
  const key = kmax + "/" + n;
  let t = tableCache.get(key);
  if (!t) {
    const cos = new Float64Array((kmax + 1) * n);
    const sin = new Float64Array((kmax + 1) * n);
    for (let k = 1; k <= kmax; k++) {
      const base = k * n;
      for (let i = 0; i < n; i++) {
        const ang = TWO_PI * k * (i / n);
        cos[base + i] = dcos(ang);
        sin[base + i] = dsin(ang);
      }
    }
    t = { cos, sin };
    tableCache.set(key, t);
  }
  return t;
}

/**
 * Evaluate the field on the uniform grid t_i = i/n.
 * Accumulation is in ascending k per point — part of the spec (float
 * summation order changes bits).
 */
export function evaluateFieldOnGrid(
  spectrum: Spectrum,
  weights: Float64Array,
  n: number,
): Float64Array {
  const kmax = weights.length - 1;
  const { cos, sin } = trigTable(kmax, n);
  const out = new Float64Array(n);
  for (let k = 1; k <= kmax; k++) {
    const wk = weights[k]!;
    if (wk === 0) continue;
    const a = wk * spectrum.gc[k]!;
    const b = wk * spectrum.gs[k]!;
    const base = k * n;
    for (let i = 0; i < n; i++) {
      out[i] = out[i]! + a * cos[base + i]! + b * sin[base + i]!;
    }
  }
  return out;
}

/**
 * 1 / max|D_raw| measured on the fixed NORM_GRID (0 for a null field).
 * Render grids of 512/1024 points are bit-identical subsets of this grid, so
 * the rendered max never exceeds the budget there. The 2048 grid samples
 * between grid points and can overshoot: ≈ 0.6% for realistic spectra, with
 * an adversarial worst case of 1/cos(π/16) − 1 ≈ 1.96% if all energy sits at
 * k = KMAX. Frozen behavior of organic-outline@1 (documented, not patched).
 */
export function normalizationScale(
  spectrum: Spectrum,
  weights: Float64Array,
): number {
  const vals = evaluateFieldOnGrid(spectrum, weights, NORM_GRID);
  let m = 0;
  for (let i = 0; i < vals.length; i++) {
    const a = Math.abs(vals[i]!);
    if (a > m) m = a;
  }
  return m < 1e-12 ? 0 : 1 / m;
}
