// Throwaway proof-of-concept: can organic-outline's engine reach the
// bold-organic reference look (Vecteezy #1255622)? Bypasses @1's frozen
// guard rails (KMIN=3, amplitude<=0.03, inward fold guard) by composing the
// exported primitives directly with a k0~2 envelope and big amplitudes.
// Usage: node scripts/poc-bold.mjs <out.svg>
import { writeFileSync } from "node:fs";
import { sampleCircle, sampleRoundedRect, resolveCornerRadii } from "../src/core/prototypes.ts";
import { evaluateFieldOnGrid, normalizationScale, radialSpectrum } from "../src/core/field.ts";
import { channelSeed, CHANNEL } from "../src/core/prng.ts";
import { catmullRomPathD } from "../src/core/outline.ts";

const N = 256;

function blobPath({ shape, seed, amplitude, k0 = 2.2, kmax = 8, offset = [0, 0], scale = 1 }) {
  const sampled =
    shape.kind === "circle"
      ? sampleCircle(shape.d, N)
      : sampleRoundedRect(
          shape.w,
          shape.h,
          resolveCornerRadii(shape.w, shape.h, shape.radii),
          N,
        );
  // Bold envelope: Lorentzian bump at k0, harmonics 2..kmax (k=2 allowed —
  // bean/kidney energy that @1 reserves for asymmetry).
  const weights = new Float64Array(kmax + 1);
  for (let k = 2; k <= kmax; k++) {
    const d = 2 * (k / k0 - 1);
    weights[k] = 1 / (1 + d * d);
  }
  const spectrum = radialSpectrum(channelSeed(seed, CHANNEL.radial));
  const s = normalizationScale(spectrum, weights) * amplitude * sampled.refSize;
  const field = evaluateFieldOnGrid(spectrum, weights, N);
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = sampled.points[i];
    xs[i] = (p.x + s * field[i] * p.nx) * scale + offset[0];
    ys[i] = (p.y + s * field[i] * p.ny) * scale + offset[1];
  }
  return catmullRomPathD(xs, ys);
}

const fill = (d, color, x, y) =>
  `<path d="${d}" fill="${color}" transform="translate(${x} ${y})"/>`;
const line = (d, color, x, y, w = 2.5) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" transform="translate(${x} ${y})"/>`;

// Palette sampled from the reference: cream bg, coral, orange, maroon, dusty pink.
const CREAM = "#faebdd";
const CORAL = "#f2705b";
const ORANGE = "#f69a4d";
const MAROON = "#9e3a3f";
const WINE = "#8e3b47";
const PINK = "#e8c9bf";

const shapes = [];

// 1. Coral splat (strong k=2/3 → lobed splash) + nothing.
shapes.push(
  fill(blobPath({ shape: { kind: "circle", d: 190 }, seed: 11, amplitude: 0.3, k0: 2.6 }), CORAL, 170, 470),
);
// 2. Orange bean with a floating outline that loosely follows it.
shapes.push(
  fill(blobPath({ shape: { kind: "circle", d: 170 }, seed: 26, amplitude: 0.18, k0: 2.0, kmax: 4 }), ORANGE, 700, 160),
  line(blobPath({ shape: { kind: "circle", d: 170 }, seed: 87, amplitude: 0.16, k0: 2.0, kmax: 4, scale: 1.12, offset: [14, -10] }), WINE, 700, 160),
);
// 3. Maroon pebble + offset outline ring beside it (outline around emptiness).
shapes.push(
  fill(blobPath({ shape: { kind: "circle", d: 120 }, seed: 5, amplitude: 0.14, k0: 2.4 }), MAROON, 280, 130),
  line(blobPath({ shape: { kind: "circle", d: 120 }, seed: 41, amplitude: 0.12, k0: 2.2, offset: [-46, -28] }), WINE, 280, 130),
);
// 4. Dusty-pink rounded square with mismatched sketch outline.
shapes.push(
  fill(blobPath({ shape: { kind: "roundedRect", w: 170, h: 160, radii: [48, 48, 48, 48] }, seed: 31, amplitude: 0.07, k0: 3 }), PINK, 120, 300),
  line(blobPath({ shape: { kind: "roundedRect", w: 170, h: 160, radii: [48, 48, 48, 48] }, seed: 64, amplitude: 0.08, k0: 2.6, scale: 1.05, offset: [12, 10] }), WINE, 120, 300),
);
// 5. Orange gumdrop (trapezoid-ish prototype via asymmetric radii).
shapes.push(
  fill(blobPath({ shape: { kind: "roundedRect", w: 190, h: 170, radii: [72, 72, 26, 26] }, seed: 47, amplitude: 0.06, k0: 3 }), ORANGE, 460, 280),
  line(blobPath({ shape: { kind: "roundedRect", w: 190, h: 170, radii: [72, 72, 26, 26] }, seed: 90, amplitude: 0.07, k0: 2.8, scale: 1.06, offset: [-10, -12] }), WINE, 460, 280),
);
// 6. Big maroon blob, plain.
shapes.push(
  fill(blobPath({ shape: { kind: "circle", d: 150 }, seed: 73, amplitude: 0.18, k0: 2.1 }), MAROON, 800, 470),
);
// 7. Small coral kidney.
shapes.push(
  fill(blobPath({ shape: { kind: "circle", d: 100 }, seed: 58, amplitude: 0.26, k0: 2.0 }), CORAL, 530, 540),
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="660" viewBox="0 0 960 660">
<rect width="960" height="660" fill="${CREAM}"/>
${shapes.join("\n")}
</svg>`;

writeFileSync(process.argv[2] ?? "poc-bold.svg", svg);
console.log("written", process.argv[2] ?? "poc-bold.svg");
