/** Shared shape rendering: one place that turns (shape, config, mode) into SVG nodes. */

import { prototypePathD } from "../core/prototypes";
import type { OrganicConfig, Shape } from "../core/types";
import type { OutlineResult } from "../core/outline";
import { outline } from "./cache";
import { svg } from "./dom";
import type { RenderMode } from "./store";

export interface Palette {
  /** Page/panel background. */
  bg: string;
  /** Fill color in fill-only mode (high contrast vs bg — edges are what's being tuned). */
  ink: string;
  /** Fill color when a stroke is also present. */
  fill: string;
  stroke: string;
  /** Sketch outline color (wine on light; lighter rose on dark — #8e3b47 is ~2.4:1 there). */
  sketch: string;
}

export const LIGHT: Palette = {
  bg: "#f6f5f2",
  ink: "#23211d",
  fill: "#e9e4da",
  stroke: "#1b1b1b",
  sketch: "#8e3b47",
};
export const DARK: Palette = {
  bg: "#1a1814",
  ink: "#ece9e2",
  fill: "#33302a",
  stroke: "#f1efe9",
  sketch: "#d98a95",
};

export const GHOST_COLOR = "#3b82f6";
export const DIFF_COLOR = "#e11d48";
export const EXAGGERATE_COLOR = "#d97706";

export interface ShapeRenderSpec {
  shape: Shape;
  config: OrganicConfig;
  mode: RenderMode;
  strokeWidth: number;
  seed?: number;
  amplitude?: number;
  /** Render the pure geometric prototype instead (hold-Space blink). */
  blink?: boolean;
  palette?: Palette;
}

export interface ShapeRender {
  node: SVGElement;
  result: OutlineResult;
  ghostD: string;
}

/** Build the layered SVG group of one shape instance. */
export function renderShape(spec: ShapeRenderSpec): ShapeRender {
  const pal = spec.palette ?? LIGHT;
  const wantsStroke = spec.mode !== "fill";
  const result = outline(spec.shape, spec.config, {
    seed: spec.seed,
    amplitude: spec.amplitude,
    strokeWidth: wantsStroke ? spec.strokeWidth : undefined,
  });
  const ghostD = prototypePathD(spec.shape);
  const g = svg("g");

  const fillD = spec.blink ? ghostD : result.pathD;
  if (spec.mode === "fill") {
    g.append(svg("path", { d: fillD, fill: pal.ink }));
  } else {
    if (spec.mode === "fillStroke") {
      g.append(svg("path", { d: fillD, fill: pal.fill }));
    }
    if (!spec.blink && result.bandPathD) {
      // Variable-width stroke as a filled ring band (nonzero: overlaps overpaint, never holes).
      g.append(
        svg("path", {
          d: result.bandPathD,
          fill: pal.stroke,
          "fill-rule": "nonzero",
        }),
      );
    } else {
      g.append(
        svg("path", {
          d: fillD,
          fill: "none",
          stroke: pal.stroke,
          "stroke-width": String(spec.strokeWidth),
        }),
      );
    }
  }
  // Floating sketch outline (@2): a layer above the fill, hidden during blink.
  if (!spec.blink && result.sketchPathD) {
    g.append(
      svg("path", {
        d: result.sketchPathD,
        fill: "none",
        stroke: pal.sketch,
        "stroke-width": String(result.sketchStrokeWidthPx ?? 2),
        "stroke-linejoin": "round",
      }),
    );
  }
  return { node: g, result, ghostD };
}

/**
 * Extra padding (px) a sketch outline needs beyond the shape box:
 * scale growth of the half-diagonal + offset + its own deviation + width.
 * `amplitude` overrides config.params.amplitude (ladder/lineup cards render
 * per-cell amplitudes — the sketch scales with them).
 */
export function sketchPadPx(
  shape: Shape,
  config: OrganicConfig,
  amplitude?: number,
): number {
  const sk = config.sketchOutline;
  if (!sk || config.algorithm === "organic-outline@1") return 0;
  const w = shape.kind === "circle" ? shape.diameter : shape.width;
  const h = shape.kind === "circle" ? shape.diameter : shape.height;
  const refSize = Math.min(w, h);
  const half = Math.max(w, h) / 2;
  const amp = amplitude ?? config.params.amplitude;
  return Math.ceil(
    Math.max(0, sk.scale - 1) * half +
      Math.max(Math.abs(sk.offset[0]), Math.abs(sk.offset[1])) * refSize +
      (amp * sk.amplitudeScale * sk.scale + sk.widthRel) * refSize,
  );
}

/** Standalone SVG markup of the current shape (clipboard export; carries spec metadata). */
export function exportSvgMarkup(spec: ShapeRenderSpec): string {
  const { node, result } = renderShape(spec);
  const pad =
    Math.ceil(
      result.maxTotalDevPx + (spec.mode === "fill" ? 0 : spec.strokeWidth),
    ) +
    sketchPadPx(spec.shape, spec.config, spec.amplitude) +
    2;
  const w =
    spec.shape.kind === "circle" ? spec.shape.diameter : spec.shape.width;
  const h =
    spec.shape.kind === "circle" ? spec.shape.diameter : spec.shape.height;
  const vb = `${-w / 2 - pad} ${-h / 2 - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  const root = svg("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: vb,
    width: String(w + 2 * pad),
    height: String(h + 2 * pad),
  });
  const meta = document.createComment(
    ` ${spec.config.spec}@${spec.config.specVersion} | ${spec.config.algorithm} | seed=${spec.seed ?? spec.config.seed} | params=${JSON.stringify(spec.config.params)} | sketch=${JSON.stringify(spec.config.sketchOutline ?? null)} | NOT the spec artifact — the config JSON is `,
  );
  root.append(meta, node);
  return new XMLSerializer().serializeToString(root);
}
