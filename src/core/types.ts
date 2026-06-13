/** Shared types of the organic-outline generator and its config schema. */

/** The seven spec parameters (seed lives next to params in the config). */
export interface OrganicParams {
  /** Max deviation from the prototype, relative to refSize. */
  amplitude: number;
  /** Undulation wavelength, relative to perimeter. */
  wavelength: number;
  /** Blend weight of higher-frequency octaves (0–1). */
  detail: number;
  /** Global low-order deformation, 1 → ~2% anisotropy (0–1). */
  asymmetry: number;
  /** ± relative variation among the four corner radii (rects only). */
  cornerRadiusVariation: number;
  /** Relative stroke-width variation along the path (stroke mode only). */
  strokeWidthVariation: number;
}

export type SeedPolicy = "fixed" | "per-instance";

/**
 * The floating sketch outline (schema v0.2, organic-outline@2 only): a thin
 * outline generated independently (derived seed) so it loosely mismatches the
 * fill — the signature element of the bold-organic reference.
 * All lengths are refSize-relative (dimensionless, like every spec param).
 */
export interface SketchOutline {
  /** Outline seed = instanceSeed(seed, seedShift) — reroll the mismatch without touching the fill. */
  seedShift: number;
  /** Scale about the shape center (1 = same size). */
  scale: number;
  /** Translation [dx, dy] in refSize units. */
  offset: [number, number];
  /** Outline amplitude = params.amplitude × this. */
  amplitudeScale: number;
  /** Stroke width in refSize units. */
  widthRel: number;
}

/** Config schema — parameters only, no baked coordinates. v0.1 ⇔ organic-outline@1 (frozen), v0.2 ⇔ organic-outline@2 (adds the bold regime + sketchOutline). */
export interface OrganicConfig {
  spec: "organic-line";
  specVersion: "0.1" | "0.2" | "0.3";
  /** Algorithm name + version, part of the spec, e.g. "organic-outline@2". */
  algorithm: string;
  params: OrganicParams;
  seed: number;
  seedPolicy: SeedPolicy;
  clamps: { maxAmplitudePx: number | null };
  /** v0.2 only; null/absent = no sketch outline. */
  sketchOutline?: SketchOutline | null;
}

/** Geometric prototypes supported in v1. */
export type Shape =
  | { kind: "roundedRect"; width: number; height: number; cornerRadius: number }
  | { kind: "circle"; diameter: number };

/** A sample on the prototype outline: position + outward unit normal + curvature. */
export interface SamplePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** Unsigned curvature of the prototype at this sample (0 on lines, 1/r on arcs). */
  curvature: number;
}

export interface SampledPrototype {
  points: SamplePoint[];
  perimeter: number;
  /** Reference size: min(width, height) for rects, diameter for circles. */
  refSize: number;
}
