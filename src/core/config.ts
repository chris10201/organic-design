/**
 * Config schema: serialization, validation, defaults. The config is the spec
 * carrier — parameters only, no baked coordinates.
 *
 * Two algorithm versions coexist:
 * - v0.1 ⇔ organic-outline@1 — FROZEN. The subtle regime shipped as
 *   specs/button.organic.json / circle.organic.json; must reproduce
 *   bit-identically forever.
 * - v0.2 ⇔ organic-outline@2 — the bold regime (2026-06-13 reference):
 *   amplitude up to 0.4, wavelength up to 0.5 (k0 ≥ 2, bean/kidney energy),
 *   plus the optional floating sketchOutline layer.
 * - v0.3 ⇔ organic-outline@3 — the extreme/blob regime: identical to @2 except
 *   the envelope floor drops to k0 = 1, so wavelength extends to 1.0 (single
 *   off-center egg/pear lobe). @2 stays frozen; reached by pushing wavelength
 *   past @2's 0.5 cap or via the 極限預設.
 */

import type {
  OrganicConfig,
  OrganicParams,
  SeedPolicy,
  SketchOutline,
} from "./types";

export const ALGORITHM_V1 = "organic-outline@1";
export const ALGORITHM_V2 = "organic-outline@2";
export const ALGORITHM_V3 = "organic-outline@3";
export const SPEC = "organic-line";

export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export type ParamRanges = Record<keyof OrganicParams, ParamRange>;

/** Parameter Set v1 ranges (organic-outline@1, frozen). */
export const PARAM_RANGES_V1: ParamRanges = {
  amplitude: { min: 0, max: 0.03, step: 0.0005 },
  // Max 1/3 (base harmonic k0 ≥ 3): in the subtle regime, k=2 ovalization is
  // `asymmetry`'s exclusive job — the PRD's 0.5 was revised in tuning.
  wavelength: { min: 0.05, max: 1 / 3, step: 0.005 },
  detail: { min: 0, max: 1, step: 0.01 },
  asymmetry: { min: 0, max: 1, step: 0.01 },
  cornerRadiusVariation: { min: 0, max: 0.3, step: 0.005 },
  strokeWidthVariation: { min: 0, max: 0.2, step: 0.005 },
};

/** Parameter Set v2 ranges: superset of v1, spanning subtle → bold. */
export const PARAM_RANGES_V2: ParamRanges = {
  ...PARAM_RANGES_V1,
  amplitude: { min: 0, max: 0.4, step: 0.0005 },
  // k0 down to 2: bean/kidney shapes ARE k=2-dominant deformation; in the
  // bold regime the asymmetry-collision concern of v1 no longer applies.
  wavelength: { min: 0.05, max: 0.5, step: 0.005 },
  // Widened past v1's 0.3 cap so the bold/extreme center (0.3) sits mid-slider
  // with headroom; the generator clamps corner radii to the CSS overlap rule,
  // so larger variation only sharpens the asymmetry, never folds the shape.
  cornerRadiusVariation: { min: 0, max: 0.6, step: 0.005 },
};

/** Parameter Set v3 ranges: superset of v2 — the extreme/blob regime. */
export const PARAM_RANGES_V3: ParamRanges = {
  ...PARAM_RANGES_V2,
  // k0 down to 1: the lowest harmonic is a single off-center lobe (egg/pear);
  // wavelength extends to 1.0 (k0 = 1/wavelength = 1, the floor). Above 1.0 the
  // floor would pin k0 = 1 with no further effect, so 1.0 is the honest cap.
  wavelength: { min: 0.05, max: 1, step: 0.005 },
};

export function rangesFor(algorithm: string): ParamRanges {
  if (algorithm === ALGORITHM_V1) return PARAM_RANGES_V1;
  if (algorithm === ALGORITHM_V3) return PARAM_RANGES_V3;
  return PARAM_RANGES_V2;
}

/** Boundary of the perceptual regimes on the amplitude axis (v1 spec max). */
export const SUBTLE_AMPLITUDE_MAX = 0.03;

export const SKETCH_RANGES = {
  seedShift: { min: 1, max: 999, step: 1 },
  scale: { min: 0.9, max: 1.3, step: 0.01 },
  offset: { min: -0.2, max: 0.2, step: 0.005 },
  amplitudeScale: { min: 0, max: 2, step: 0.05 },
  widthRel: { min: 0.005, max: 0.06, step: 0.001 },
} as const;

export function defaultSketchOutline(): SketchOutline {
  // Matches the center-point config below: a calm, near-1 outline that loosely
  // shadows the fill (amplitudeScale 0.7, the reference's calmer-than-fill look).
  return {
    seedShift: 1,
    scale: 1.02,
    offset: [-0.045, -0.02],
    amplitudeScale: 0.7,
    widthRel: 0.012,
  };
}

/**
 * The center point: the tuned @3 (extreme/blob) config the playground opens on.
 * Sliders adjust around it; double-clicking a param label resets to these
 * values. Pinned reference the user chose as the home base — not a frozen spec.
 */
export function defaultConfig(): OrganicConfig {
  return {
    spec: SPEC,
    specVersion: "0.3",
    algorithm: ALGORITHM_V3,
    params: {
      amplitude: 0.1449616,
      wavelength: 0.6380364656795914,
      detail: 0,
      asymmetry: 0,
      cornerRadiusVariation: 0.3,
      strokeWidthVariation: 0,
    },
    seed: 1357022654,
    seedPolicy: "fixed",
    clamps: { maxAmplitudePx: null },
    sketchOutline: defaultSketchOutline(),
  };
}

export function serializeConfig(config: OrganicConfig): string {
  const out: Record<string, unknown> = {
    spec: config.spec,
    specVersion: config.specVersion,
    algorithm: config.algorithm,
    params: config.params,
    seed: config.seed,
    seedPolicy: config.seedPolicy,
    clamps: config.clamps,
  };
  if (config.specVersion !== "0.1")
    out["sketchOutline"] = config.sketchOutline ?? null;
  return JSON.stringify(out, null, 2) + "\n";
}

function clampTo(range: ParamRange, v: number): number {
  return Math.min(range.max, Math.max(range.min, v));
}

function parseSketch(raw: unknown): SketchOutline | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object")
    throw new Error('"sketchOutline" must be an object or null.');
  const o = raw as Record<string, unknown>;
  const num = (key: string): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error(`sketchOutline.${key} must be a finite number.`);
    return v;
  };
  const offsetRaw = o["offset"];
  if (
    !Array.isArray(offsetRaw) ||
    offsetRaw.length !== 2 ||
    offsetRaw.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    throw new Error("sketchOutline.offset must be [number, number].");
  }
  const r = SKETCH_RANGES;
  return {
    seedShift: Math.round(clampTo(r.seedShift, num("seedShift"))),
    scale: clampTo(r.scale, num("scale")),
    offset: [
      clampTo(r.offset, offsetRaw[0] as number),
      clampTo(r.offset, offsetRaw[1] as number),
    ],
    amplitudeScale: clampTo(r.amplitudeScale, num("amplitudeScale")),
    widthRel: clampTo(r.widthRel, num("widthRel")),
  };
}

/** Lenient sketch sanitizer for persisted/hashed state (invalid → null). */
export function sanitizeSketchOutline(raw: unknown): SketchOutline | null {
  try {
    return parseSketch(raw);
  } catch {
    return null;
  }
}

/** Parse + validate an imported config (v0.1 or v0.2). Throws with a readable message on any violation. */
export function parseConfig(json: string): OrganicConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null)
    throw new Error("Config must be a JSON object.");
  const o = raw as Record<string, unknown>;

  if (o["spec"] !== SPEC) throw new Error(`"spec" must be "${SPEC}".`);
  const specVersion = o["specVersion"];
  if (specVersion !== "0.1" && specVersion !== "0.2" && specVersion !== "0.3")
    throw new Error(
      `Unsupported specVersion "${String(specVersion)}" (expected "0.1", "0.2", or "0.3").`,
    );
  const expectedAlgorithm =
    specVersion === "0.1"
      ? ALGORITHM_V1
      : specVersion === "0.2"
        ? ALGORITHM_V2
        : ALGORITHM_V3;
  if (o["algorithm"] !== expectedAlgorithm)
    throw new Error(
      `specVersion ${specVersion} requires algorithm "${expectedAlgorithm}" (got "${String(o["algorithm"])}").`,
    );

  const ranges = rangesFor(expectedAlgorithm);
  const p = o["params"];
  if (typeof p !== "object" || p === null)
    throw new Error('"params" must be an object.');
  const params = {} as OrganicParams;
  for (const key of Object.keys(ranges) as Array<keyof OrganicParams>) {
    const v = (p as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error(`params.${key} must be a finite number.`);
    params[key] = clampTo(ranges[key], v);
  }

  const seed = o["seed"];
  if (typeof seed !== "number" || !Number.isInteger(seed))
    throw new Error('"seed" must be an integer.');

  const seedPolicy = o["seedPolicy"];
  if (seedPolicy !== "fixed" && seedPolicy !== "per-instance") {
    throw new Error('"seedPolicy" must be "fixed" or "per-instance".');
  }

  let maxAmplitudePx: number | null = null;
  const clamps = o["clamps"];
  if (clamps !== undefined) {
    if (typeof clamps !== "object" || clamps === null)
      throw new Error('"clamps" must be an object.');
    const m = (clamps as Record<string, unknown>)["maxAmplitudePx"];
    if (m !== null && m !== undefined) {
      if (typeof m !== "number" || !Number.isFinite(m) || m < 0)
        throw new Error(
          "clamps.maxAmplitudePx must be null or a non-negative number.",
        );
      maxAmplitudePx = m;
    }
  }

  if (specVersion === "0.1" && o["sketchOutline"] != null)
    throw new Error("sketchOutline requires specVersion 0.2 or 0.3.");
  const sketchOutline =
    specVersion === "0.1" ? null : parseSketch(o["sketchOutline"]);

  return {
    spec: SPEC,
    specVersion,
    algorithm: expectedAlgorithm,
    params,
    seed: seed >>> 0,
    seedPolicy: seedPolicy as SeedPolicy,
    clamps: { maxAmplitudePx },
    sketchOutline,
  };
}
