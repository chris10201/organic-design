/**
 * Geometric prototypes: equal-arc-length sampling of closed paths with
 * outward normals, plus the analytic SVG path of the pure prototype.
 *
 * Conventions (part of the spec):
 * - Coordinates are screen-space (y down), shape centered at the origin.
 * - Traversal is clockwise on screen.
 * - Circle starts at the top point (angle -π/2).
 * - Rounded rect starts at the left end of the top edge, i.e. (x0 + rTL, y0).
 * - Sample i of N sits at arc length s = i / N · perimeter (i = 0 … N-1).
 */

import { dcos, dsin, PI, TWO_PI, HALF_PI } from "./dmath";
import type { SamplePoint, SampledPrototype, Shape } from "./types";

/** Per-corner radii in traversal order: top-left, top-right, bottom-right, bottom-left. */
export type CornerRadii = [number, number, number, number];

/**
 * Apply the CSS border-radius overlap rule: if the radii of two adjacent
 * corners would overlap on a shared edge, scale ALL radii by the smallest
 * edge/sum ratio. Keeps the prototype valid for any variation.
 */
export function resolveCornerRadii(
  width: number,
  height: number,
  radii: CornerRadii,
): CornerRadii {
  const [tl, tr, br, bl] = radii;
  let f = 1;
  const edges: Array<[number, number]> = [
    [tl + tr, width], // top
    [tr + br, height], // right
    [br + bl, width], // bottom
    [bl + tl, height], // left
  ];
  for (const [sum, edge] of edges) {
    if (sum > edge) f = Math.min(f, edge / sum);
  }
  return [tl * f, tr * f, br * f, bl * f];
}

interface Segment {
  length: number;
  /** Point + outward normal at arc length s ∈ [0, length] into the segment. */
  at(s: number): SamplePoint;
}

function lineSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  nx: number,
  ny: number,
): Segment {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    length,
    at(s: number): SamplePoint {
      const t = length === 0 ? 0 : s / length;
      return { x: x0 + dx * t, y: y0 + dy * t, nx, ny, curvature: 0 };
    },
  };
}

/** Arc of radius r around (cx, cy), from angle a0 over `sweep` radians (clockwise on screen = increasing angle in y-down coords). */
function arcSegment(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  sweep: number,
): Segment {
  const length = r * sweep;
  return {
    length,
    at(s: number): SamplePoint {
      const a = a0 + (length === 0 ? 0 : (s / length) * sweep);
      const nx = dcos(a);
      const ny = dsin(a);
      return {
        x: cx + r * nx,
        y: cy + r * ny,
        nx,
        ny,
        curvature: r === 0 ? 0 : 1 / r,
      };
    },
  };
}

function sampleSegments(
  segments: Segment[],
  n: number,
): { points: SamplePoint[]; perimeter: number } {
  const cumulative: number[] = [];
  let perimeter = 0;
  for (const seg of segments) {
    perimeter += seg.length;
    cumulative.push(perimeter);
  }
  const points: SamplePoint[] = [];
  let segIndex = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * perimeter;
    while (segIndex < segments.length - 1 && s >= cumulative[segIndex]!)
      segIndex++;
    const segStart = segIndex === 0 ? 0 : cumulative[segIndex - 1]!;
    points.push(segments[segIndex]!.at(s - segStart));
  }
  return { points, perimeter };
}

/** Build the segment list of a rounded rect (centered, clockwise, starting at top edge's left end). */
function roundedRectSegments(
  width: number,
  height: number,
  radii: CornerRadii,
): Segment[] {
  const [tl, tr, br, bl] = radii;
  const x0 = -width / 2;
  const y0 = -height / 2;
  const x1 = width / 2;
  const y1 = height / 2;
  return [
    lineSegment(x0 + tl, y0, x1 - tr, y0, 0, -1), // top edge →
    arcSegment(x1 - tr, y0 + tr, tr, -HALF_PI, HALF_PI), // top-right corner
    lineSegment(x1, y0 + tr, x1, y1 - br, 1, 0), // right edge ↓
    arcSegment(x1 - br, y1 - br, br, 0, HALF_PI), // bottom-right corner
    lineSegment(x1 - br, y1, x0 + bl, y1, 0, 1), // bottom edge ←
    arcSegment(x0 + bl, y1 - bl, bl, HALF_PI, HALF_PI), // bottom-left corner
    lineSegment(x0, y1 - bl, x0, y0 + tl, -1, 0), // left edge ↑
    arcSegment(x0 + tl, y0 + tl, tl, PI, HALF_PI), // top-left corner
  ];
}

/** Equal-arc-length sample a rounded rect with (already resolved) per-corner radii. */
export function sampleRoundedRect(
  width: number,
  height: number,
  radii: CornerRadii,
  n: number,
): SampledPrototype {
  const { points, perimeter } = sampleSegments(
    roundedRectSegments(width, height, radii),
    n,
  );
  return { points, perimeter, refSize: Math.min(width, height) };
}

/** Equal-arc-length sample a circle of the given diameter. */
export function sampleCircle(diameter: number, n: number): SampledPrototype {
  const r = diameter / 2;
  const points: SamplePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = -HALF_PI + (i / n) * TWO_PI;
    const nx = dcos(a);
    const ny = dsin(a);
    points.push({
      x: r * nx,
      y: r * ny,
      nx,
      ny,
      curvature: r === 0 ? 0 : 1 / r,
    });
  }
  return { points, perimeter: PI * diameter, refSize: diameter };
}

/** Perimeter of the pure prototype (equal corner radii), used for wavelength scaling. */
export function prototypePerimeter(shape: Shape): number {
  if (shape.kind === "circle") return PI * shape.diameter;
  const r = Math.min(shape.cornerRadius, shape.width / 2, shape.height / 2);
  return 2 * (shape.width + shape.height) - 8 * r + TWO_PI * r;
}

/**
 * Analytic SVG path of the prototype (lines + circular arcs) — exact, used
 * both for the A/B ghost and as the degenerate-to-zero output.
 * Radii may be per-corner (organic base) or all equal (pure geometry).
 */
export function prototypePathD(shape: Shape, radii?: CornerRadii): string {
  if (shape.kind === "circle") {
    const r = shape.diameter / 2;
    // Two half-circle arcs, starting at the top point, clockwise.
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  }
  const { width: w, height: h } = shape;
  const base = Math.min(shape.cornerRadius, w / 2, h / 2);
  const [tl, tr, br, bl] = resolveCornerRadii(
    w,
    h,
    radii ?? [base, base, base, base],
  );
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const y1 = h / 2;
  const parts = [
    `M ${x0 + tl} ${y0}`,
    `L ${x1 - tr} ${y0}`,
    tr > 0 ? `A ${tr} ${tr} 0 0 1 ${x1} ${y0 + tr}` : "",
    `L ${x1} ${y1 - br}`,
    br > 0 ? `A ${br} ${br} 0 0 1 ${x1 - br} ${y1}` : "",
    `L ${x0 + bl} ${y1}`,
    bl > 0 ? `A ${bl} ${bl} 0 0 1 ${x0} ${y1 - bl}` : "",
    `L ${x0} ${y0 + tl}`,
    tl > 0 ? `A ${tl} ${tl} 0 0 1 ${x0 + tl} ${y0}` : "",
    "Z",
  ];
  return parts.filter(Boolean).join(" ");
}
