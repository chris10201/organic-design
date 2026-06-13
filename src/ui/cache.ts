/** Memoized generation: d-string cache keyed by every input that changes output. */

import {
  generateOutline,
  type GenerateOptions,
  type OutlineResult,
} from "../core/outline";
import type { OrganicConfig, Shape } from "../core/types";

const cache = new Map<string, OutlineResult>();
const MAX_ENTRIES = 2000;

export function outline(
  shape: Shape,
  config: OrganicConfig,
  opts: GenerateOptions = {},
): OutlineResult {
  const p = config.params;
  const key = [
    config.algorithm,
    shape.kind === "circle"
      ? `c${shape.diameter}`
      : `r${shape.width},${shape.height},${shape.cornerRadius}`,
    opts.seed ?? config.seed,
    opts.amplitude ?? p.amplitude,
    p.wavelength,
    p.detail,
    p.asymmetry,
    p.cornerRadiusVariation,
    p.strokeWidthVariation,
    opts.strokeWidth ?? "",
    config.clamps.maxAmplitudePx ?? "",
    config.sketchOutline
      ? [
          config.sketchOutline.seedShift,
          config.sketchOutline.scale,
          config.sketchOutline.offset[0],
          config.sketchOutline.offset[1],
          config.sketchOutline.amplitudeScale,
          config.sketchOutline.widthRel,
        ].join(",")
      : "",
  ].join("|");
  let result = cache.get(key);
  if (!result) {
    result = generateOutline(shape, config, opts);
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, result);
  }
  return result;
}
