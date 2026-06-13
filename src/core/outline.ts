/**
 * organic-outline@1 — reference implementation (normative).
 *
 * Pipeline: deform prototype (seeded per-corner radii) → equal-arc-length
 * sampling → harmonic radial displacement along outward normals with
 * curvature-aware inward attenuation (fold-over guard) → global asymmetry
 * affine → closed uniform Catmull-Rom → cubic Bézier path.
 *
 * Determinism contract: all randomness flows from `seed` through per-channel
 * sub-seeds; arithmetic uses only IEEE-754 +,−,×,÷, sqrt, floor, round
 * (half-toward-+∞), abs, min/max, uint32 ops and dcos/dsin (never
 * Math.sin/cos/pow/hypot, no FMA contraction in ports). Same algorithm +
 * config + seed ⇒ bit-identical output doubles in any conforming
 * implementation. Conformance is defined over `anchors` (the double
 * coordinates), not path strings. Once released, bugs in @1 are spec — fixes
 * go to organic-outline@2.
 *
 * Known limitation (documented, not guaranteed against): cornerRadius = 0
 * gives a curvature singularity the fold-over guard cannot see (κ steps
 * 0 → ∞), so sharp corners can self-intersect at high amplitude. The
 * playground floors the radius at 2px; ports should too.
 */

import { ALGORITHM_V1, ALGORITHM_V3 } from "./config";
import { dcos, dsin, PI, TWO_PI } from "./dmath";
import { Prng, CHANNEL, channelSeed, instanceSeed } from "./prng";
import {
  evaluateFieldOnGrid,
  normalizationScale,
  radialSpectrum,
  radialWeights,
  radialWeightsV2,
  radialWeightsV3,
  strokeSpectrum,
  strokeWeights,
} from "./field";
import {
  prototypePathD,
  resolveCornerRadii,
  sampleCircle,
  sampleRoundedRect,
  type CornerRadii,
} from "./prototypes";
import type { OrganicConfig, SampledPrototype, Shape } from "./types";

export interface GenerateOptions {
  /** Override the config seed (per-instance grids). */
  seed?: number;
  /** Override params.amplitude (intensity ladder, scaling-law rows, exaggeration ghost). */
  amplitude?: number;
  /** Base stroke width in px; with strokeWidthVariation > 0 a filled band path is emitted. */
  strokeWidth?: number;
  /** Internal: suppress the sketch-outline layer (used for the sketch's own generation). */
  noSketch?: boolean;
}

export interface OutlineResult {
  /** Closed cubic Bézier path of the organic outline (analytic prototype when degenerate). */
  pathD: string;
  /** Variable-width stroke as a filled ring band (render with fill-rule="nonzero"), or null. */
  bandPathD: string | null;
  /** [min, max] rendered stroke width in px when the band is active. */
  strokeWidthRange: [number, number] | null;
  /** Max |radial displacement| actually rendered (after attenuation), px. */
  maxRadialDevPx: number;
  /** Max total deviation vs the PURE prototype (incl. corner variation + asymmetry), px. */
  maxTotalDevPx: number;
  /**
   * The displaced, asymmetry-transformed sample points, interleaved [x0,y0,
   * x1,y1, …] — the conformance surface of organic-outline@1 (Bézier control
   * points derive from these by exact arithmetic). Empty when degenerate.
   */
  anchors: Float64Array;
  /** Resolved per-corner radii (rects only). */
  cornerRadii: CornerRadii | null;
  /** True when the analytic prototype was emitted (degenerate-to-zero case). */
  degenerate: boolean;
  /** Samples used (0 when fully degenerate). */
  n: number;
  /** Floating sketch outline path (organic-outline@2 with sketchOutline set), or null. */
  sketchPathD: string | null;
  /** Sketch outline anchors, interleaved [x,y,…] post-affine — its conformance surface. */
  sketchAnchors: Float64Array | null;
  /** Sketch outline stroke width in px (widthRel × refSize), or null. */
  sketchStrokeWidthPx: number | null;
}

/** Inward displacement is soft-capped at this fraction of the local curvature radius. */
const FOLD_GUARD = 0.7;

/** Spec sample counts: smallest of {512, 1024, 2048} keeping sample spacing ≤ rMin/2 (≈ 3 samples per quarter arc). */
function chooseN(perimeter: number, rMin: number): number {
  const needed = rMin > 0 ? perimeter / (rMin / 2) : 2049;
  if (needed <= 512) return 512;
  if (needed <= 1024) return 1024;
  return 2048;
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** Closed uniform Catmull-Rom through the points, as a cubic Bézier path (tangent (P_{i+1}−P_{i−1})/6). */
export function catmullRomPathD(xs: Float64Array, ys: Float64Array): string {
  const n = xs.length;
  const parts: string[] = [`M ${fmt(xs[0]!)} ${fmt(ys[0]!)}`];
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    const c1x = xs[i]! + (xs[i2]! - xs[i0]!) / 6;
    const c1y = ys[i]! + (ys[i2]! - ys[i0]!) / 6;
    const c2x = xs[i2]! - (xs[i3]! - xs[i]!) / 6;
    const c2y = ys[i2]! - (ys[i3]! - ys[i]!) / 6;
    parts.push(
      `C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(xs[i2]!)} ${fmt(ys[i2]!)}`,
    );
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Curvature-aware inward attenuation (the corner fold-over guard: 17–49% of
 * seeds self-intersect at slider extremes without it).
 *
 * Allowance = min(cap, FOLD_GUARD/κ), eroded (cyclic windowed min) then
 * smoothed (cyclic windowed mean) over ±window samples; inward displacement is
 * soft-saturated to it with s(x) = x/√√(1+x⁴) (slope 1 at 0, → 1 as x → ∞,
 * only whitelisted ops). The cap (2× the amplitude budget) makes the edge
 * regime a ≤ 1.5% attenuation, so the budget stays honest.
 *
 * The window differs by algorithm version: @1 (frozen) uses ±n/128, sized for
 * its ≤ 3% displacements. At @2 bold amplitudes the corner conflict zone
 * extends ~amplitude·refSize of arc length — with the @1 window, perpendicular
 * inward bands near small-radius rect corners cross (47/60 seeds self-
 * intersected at amplitude 0.2, r=2 in review). @2 therefore widens the
 * erosion window to cover the displacement reach.
 */
function attenuateInward(
  deltas: Float64Array,
  curvatures: Float64Array,
  capPx: number,
  window: number,
): Float64Array {
  const n = deltas.length;
  const w = window;
  const allow = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = curvatures[i]!;
    allow[i] = k > 0 ? Math.min(capPx, FOLD_GUARD / k) : capPx;
  }
  const eroded = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = allow[i]!;
    for (let j = -w; j <= w; j++) {
      const v = allow[(i + j + n) % n]!;
      if (v < m) m = v;
    }
    eroded[i] = m;
  }
  const out = new Float64Array(n);
  const span = 2 * w + 1;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -w; j <= w; j++) sum += eroded[(i + j + n) % n]!;
    const a = sum / span;
    const d = deltas[i]!;
    if (d >= 0 || a <= 0) {
      out[i] = d >= 0 ? d : 0;
    } else {
      const x = -d / a;
      const x2 = x * x;
      out[i] = -a * (x / Math.sqrt(Math.sqrt(1 + x2 * x2)));
    }
  }
  return out;
}

/** Generate the organic outline (and optional stroke band) for a shape + config. */
export function generateOutline(
  shape: Shape,
  config: OrganicConfig,
  opts: GenerateOptions = {},
): OutlineResult {
  const params = config.params;
  const seed = opts.seed ?? config.seed;
  const amplitude = opts.amplitude ?? params.amplitude;
  const isRect = shape.kind === "roundedRect";

  const isPure =
    amplitude === 0 &&
    params.asymmetry === 0 &&
    (!isRect || params.cornerRadiusVariation === 0);
  const wantBand =
    opts.strokeWidth !== undefined &&
    opts.strokeWidth > 0 &&
    params.strokeWidthVariation > 0;

  // Resolve the instance prototype (per-corner radii are part of the instance).
  let radii: CornerRadii | null = null;
  let perimeter: number;
  let rMin: number;
  if (isRect) {
    const base = Math.min(
      shape.cornerRadius,
      shape.width / 2,
      shape.height / 2,
    );
    const rng = new Prng(channelSeed(seed, CHANNEL.corners));
    const u0 = rng.signed();
    const u1 = rng.signed();
    const u2 = rng.signed();
    const u3 = rng.signed();
    const v = params.cornerRadiusVariation;
    radii = resolveCornerRadii(shape.width, shape.height, [
      Math.max(0, base * (1 + v * u0)),
      Math.max(0, base * (1 + v * u1)),
      Math.max(0, base * (1 + v * u2)),
      Math.max(0, base * (1 + v * u3)),
    ]);
    const radiiSum = radii[0] + radii[1] + radii[2] + radii[3];
    perimeter =
      2 * (shape.width + shape.height) - 2 * radiiSum + (TWO_PI / 4) * radiiSum;
    rMin = Math.min(radii[0], radii[1], radii[2], radii[3]);
  } else {
    perimeter = PI * shape.diameter;
    rMin = shape.diameter / 2;
  }

  if (isPure && !wantBand) {
    const sketch = generateSketch(shape, config, opts);
    return {
      pathD: prototypePathD(shape, radii ?? undefined),
      bandPathD: null,
      strokeWidthRange: null,
      maxRadialDevPx: 0,
      maxTotalDevPx: 0,
      anchors: new Float64Array(0),
      cornerRadii: radii,
      degenerate: true,
      n: 0,
      sketchPathD: sketch?.d ?? null,
      sketchAnchors: sketch?.anchors ?? null,
      sketchStrokeWidthPx: sketch?.widthPx ?? null,
    };
  }

  const n = chooseN(perimeter, rMin);
  const sampled: SampledPrototype = isRect
    ? sampleRoundedRect(shape.width, shape.height, radii!, n)
    : sampleCircle(shape.diameter, n);
  const refSize = sampled.refSize;

  // Radial displacement field.
  let ampEff = amplitude;
  if (config.clamps.maxAmplitudePx !== null && refSize > 0) {
    ampEff = Math.min(ampEff, config.clamps.maxAmplitudePx / refSize);
  }
  let deltas: Float64Array = new Float64Array(n);
  let maxRadialDevPx = 0;
  if (ampEff > 0) {
    const spectrum = radialSpectrum(channelSeed(seed, CHANNEL.radial));
    const weights =
      config.algorithm === ALGORITHM_V1
        ? radialWeights(params.wavelength, params.detail)
        : config.algorithm === ALGORITHM_V3
          ? radialWeightsV3(params.wavelength, params.detail)
          : radialWeightsV2(params.wavelength, params.detail);
    const scale = ampEff * refSize * normalizationScale(spectrum, weights);
    const field = evaluateFieldOnGrid(spectrum, weights, n);
    for (let i = 0; i < n; i++) deltas[i] = scale * field[i]!;
    const curvatures = new Float64Array(n);
    for (let i = 0; i < n; i++) curvatures[i] = sampled.points[i]!.curvature;
    // Guard erosion window: @1 frozen at ±n/128; @2 widens it to the inward
    // displacement's arc-length reach (×1.5 margin) so perpendicular edge
    // bands can no longer cross near small corners at bold amplitudes.
    const baseWindow = Math.max(1, Math.round(n / 128));
    const window =
      config.algorithm === ALGORITHM_V1
        ? baseWindow
        : Math.max(
            baseWindow,
            Math.ceil((1.5 * ampEff * refSize * n) / perimeter),
          );
    deltas = attenuateInward(deltas, curvatures, 2 * ampEff * refSize, window);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(deltas[i]!);
      if (a > maxRadialDevPx) maxRadialDevPx = a;
    }
  }

  // Displace, then apply the global asymmetry affine (symmetric matrix
  // R(ψ)·diag(1+ε, 1−ε)·R(−ψ) about the shape center).
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = sampled.points[i]!;
    xs[i] = p.x + deltas[i]! * p.nx;
    ys[i] = p.y + deltas[i]! * p.ny;
  }
  if (params.asymmetry > 0) {
    const rng = new Prng(channelSeed(seed, CHANNEL.asym));
    const psi = TWO_PI * rng.next();
    const eps = 0.02 * params.asymmetry;
    const c = dcos(psi);
    const s = dsin(psi);
    const m00 = c * c * (1 + eps) + s * s * (1 - eps);
    const m01 = 2 * eps * c * s;
    const m11 = s * s * (1 + eps) + c * c * (1 - eps);
    for (let i = 0; i < n; i++) {
      const x = xs[i]!;
      const y = ys[i]!;
      xs[i] = m00 * x + m01 * y;
      ys[i] = m01 * x + m11 * y;
    }
  }

  // Total deviation vs the pure prototype: distance from each displaced point
  // to the pure sampled polyline within a ±n/32 index window. Same-index
  // point distance would overstate by ~2× under corner variation (tangential
  // slippage of the arc-length correspondence). Readout only — not spec output.
  let maxTotalDevPx = maxRadialDevPx;
  if (params.asymmetry > 0 || (isRect && params.cornerRadiusVariation > 0)) {
    const pure: SampledPrototype = isRect
      ? (() => {
          const base = Math.min(
            shape.cornerRadius,
            shape.width / 2,
            shape.height / 2,
          );
          return sampleRoundedRect(
            shape.width,
            shape.height,
            [base, base, base, base],
            n,
          );
        })()
      : sampled;
    const w = Math.max(2, Math.round(n / 32));
    maxTotalDevPx = 0;
    for (let i = 0; i < n; i++) {
      const px = xs[i]!;
      const py = ys[i]!;
      let best = Infinity;
      for (let j = i - w; j < i + w; j++) {
        const a = pure.points[(j + n) % n]!;
        const b = pure.points[(j + 1 + n) % n]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len2 = ex * ex + ey * ey;
        let t = len2 > 0 ? ((px - a.x) * ex + (py - a.y) * ey) / len2 : 0;
        t = Math.min(1, Math.max(0, t));
        const dx = px - (a.x + ex * t);
        const dy = py - (a.y + ey * t);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      const d = Math.sqrt(best);
      if (d > maxTotalDevPx) maxTotalDevPx = d;
    }
  }

  const pathD = isPure
    ? prototypePathD(shape, radii ?? undefined)
    : catmullRomPathD(xs, ys);

  // Variable-width stroke band: offset the displaced midline by ±w(t)/2 along
  // its own (central-difference) normals — prototype normals would inject up
  // to ~12% spurious width modulation.
  let bandPathD: string | null = null;
  let strokeWidthRange: [number, number] | null = null;
  if (wantBand) {
    const baseW = opts.strokeWidth!;
    const spectrum = strokeSpectrum(channelSeed(seed, CHANNEL.stroke));
    const weights = strokeWeights();
    const scale = normalizationScale(spectrum, weights);
    const field = evaluateFieldOnGrid(spectrum, weights, n);
    const swv = params.strokeWidthVariation;
    let wMin = Infinity;
    let wMax = -Infinity;
    const outerX = new Float64Array(n);
    const outerY = new Float64Array(n);
    const innerX = new Float64Array(n);
    const innerY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const width = baseW * Math.max(0.2, 1 + swv * scale * field[i]!);
      if (width < wMin) wMin = width;
      if (width > wMax) wMax = width;
      const tx = xs[(i + 1) % n]! - xs[(i - 1 + n) % n]!;
      const ty = ys[(i + 1) % n]! - ys[(i - 1 + n) % n]!;
      const len = Math.sqrt(tx * tx + ty * ty);
      const p = sampled.points[i]!;
      const nx = len > 1e-12 ? ty / len : p.nx;
      const ny = len > 1e-12 ? -tx / len : p.ny;
      const h = width / 2;
      outerX[i] = xs[i]! + nx * h;
      outerY[i] = ys[i]! + ny * h;
      innerX[i] = xs[i]! - nx * h;
      innerY[i] = ys[i]! - ny * h;
    }
    // Ring band: outer loop + reversed inner loop, filled with nonzero rule.
    const revX = new Float64Array(n);
    const revY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      revX[i] = innerX[n - 1 - i]!;
      revY[i] = innerY[n - 1 - i]!;
    }
    bandPathD = `${catmullRomPathD(outerX, outerY)} ${catmullRomPathD(revX, revY)}`;
    strokeWidthRange = [wMin, wMax];
  }

  const anchors = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    anchors[2 * i] = xs[i]!;
    anchors[2 * i + 1] = ys[i]!;
  }

  const sketch = generateSketch(shape, config, opts);

  return {
    pathD,
    bandPathD,
    strokeWidthRange,
    maxRadialDevPx,
    maxTotalDevPx,
    anchors,
    cornerRadii: radii,
    degenerate: isPure,
    n,
    sketchPathD: sketch?.d ?? null,
    sketchAnchors: sketch?.anchors ?? null,
    sketchStrokeWidthPx: sketch?.widthPx ?? null,
  };
}

/**
 * The floating sketch outline (organic-outline@2): an independent generation
 * with seed instanceSeed(seed, seedShift) and amplitude × amplitudeScale,
 * then the affine p′ = p·scale + offset·refSize about the shape center.
 * The fill↔outline mismatch is the point — corner radii and field both
 * re-randomize under the derived seed.
 */
function generateSketch(
  shape: Shape,
  config: OrganicConfig,
  opts: GenerateOptions,
): { d: string; widthPx: number; anchors: Float64Array } | null {
  const sk = config.sketchOutline;
  if (!sk || opts.noSketch || config.algorithm === ALGORITHM_V1) return null;

  const baseSeed = opts.seed ?? config.seed;
  const inner = generateOutline(shape, config, {
    seed: instanceSeed(baseSeed, sk.seedShift),
    amplitude: (opts.amplitude ?? config.params.amplitude) * sk.amplitudeScale,
    noSketch: true,
  });

  const isRect = shape.kind === "roundedRect";
  const refSize = isRect ? Math.min(shape.width, shape.height) : shape.diameter;

  let pts = inner.anchors;
  if (pts.length === 0) {
    // Degenerate inner outline (all shape params zero): sample the prototype
    // so the affine still applies to a spline path.
    const sampled: SampledPrototype = isRect
      ? sampleRoundedRect(
          shape.width,
          shape.height,
          inner.cornerRadii ?? [0, 0, 0, 0],
          512,
        )
      : sampleCircle(shape.diameter, 512);
    pts = new Float64Array(2 * sampled.points.length);
    for (let i = 0; i < sampled.points.length; i++) {
      pts[2 * i] = sampled.points[i]!.x;
      pts[2 * i + 1] = sampled.points[i]!.y;
    }
  }

  const m = pts.length / 2;
  const ox = sk.offset[0] * refSize;
  const oy = sk.offset[1] * refSize;
  const xs = new Float64Array(m);
  const ys = new Float64Array(m);
  const anchors = new Float64Array(2 * m);
  for (let i = 0; i < m; i++) {
    xs[i] = pts[2 * i]! * sk.scale + ox;
    ys[i] = pts[2 * i + 1]! * sk.scale + oy;
    anchors[2 * i] = xs[i]!;
    anchors[2 * i + 1] = ys[i]!;
  }
  return {
    d: catmullRomPathD(xs, ys),
    widthPx: sk.widthRel * refSize,
    anchors,
  };
}
