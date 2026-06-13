import { describe, expect, it } from "vitest";

import {
  ALGORITHM_V1,
  ALGORITHM_V2,
  ALGORITHM_V3,
  defaultConfig,
  defaultSketchOutline,
  parseConfig,
  serializeConfig,
} from "../src/core/config";
import { dcos, dsin, TWO_PI } from "../src/core/dmath";
import {
  normalizationScale,
  radialSpectrum,
  radialWeights,
  radialWeightsV2,
  radialWeightsV3,
  evaluateFieldOnGrid,
  KMIN,
  KMIN_V2,
  KMIN_V3,
} from "../src/core/field";
import { generateOutline } from "../src/core/outline";
import { prototypePathD, resolveCornerRadii } from "../src/core/prototypes";
import {
  channelSeed,
  instanceSeed,
  mix32,
  CHANNEL,
  Prng,
} from "../src/core/prng";
import type { OrganicConfig, Shape } from "../src/core/types";

const RECT: Shape = {
  kind: "roundedRect",
  width: 200,
  height: 64,
  cornerRadius: 16,
};
const CIRCLE: Shape = { kind: "circle", diameter: 120 };

/**
 * Test baseline params are FROZEN literals (not defaultConfig()): the golden
 * conformance vectors must stay pinned even when the playground's tuned
 * defaults evolve.
 */
const BASELINE: OrganicConfig["params"] = {
  amplitude: 0.012,
  wavelength: 0.18,
  detail: 0.3,
  asymmetry: 0.15,
  cornerRadiusVariation: 0.1,
  strokeWidthVariation: 0.08,
};

/** An @1 config — the frozen algorithm this suite (and its golden vectors) pins. */
function config(
  overrides: Partial<OrganicConfig["params"]> = {},
  seed = 42,
): OrganicConfig {
  const c = defaultConfig();
  c.algorithm = ALGORITHM_V1;
  c.specVersion = "0.1";
  c.sketchOutline = null;
  c.seed = seed;
  c.params = { ...BASELINE, ...overrides };
  // Frozen literals, NOT defaultConfig()'s tuned values: both affect generator
  // output, and golden vectors must never break because a playground default
  // was retuned.
  c.seedPolicy = "fixed";
  c.clamps = { maxAmplitudePx: null };
  return c;
}

/** An @2 config (bold regime + optional sketch outline). */
function configV2(
  overrides: Partial<OrganicConfig["params"]> = {},
  seed = 42,
  sketch: OrganicConfig["sketchOutline"] = null,
): OrganicConfig {
  const c = config(overrides, seed);
  c.algorithm = ALGORITHM_V2;
  c.specVersion = "0.2";
  c.sketchOutline = sketch;
  return c;
}

/** An @3 config (extreme/blob regime: envelope floor k0 = 1). */
function configV3(
  overrides: Partial<OrganicConfig["params"]> = {},
  seed = 42,
  sketch: OrganicConfig["sketchOutline"] = null,
): OrganicConfig {
  const c = configV2(overrides, seed, sketch);
  c.algorithm = ALGORITHM_V3;
  c.specVersion = "0.3";
  return c;
}

describe("deterministic math", () => {
  it("dcos/dsin agree with Math.cos/sin to ~1e-10 over the working range", () => {
    for (let i = 0; i <= 1000; i++) {
      const x = (i / 1000) * TWO_PI * 64;
      expect(dcos(x)).toBeCloseTo(Math.cos(x), 9);
      expect(dsin(x)).toBeCloseTo(Math.sin(x), 9);
    }
  });

  it("PRNG is stable and uniform-ish", () => {
    const rng = new Prng(42);
    const first = [rng.next(), rng.next(), rng.next()];
    const rng2 = new Prng(42);
    expect([rng2.next(), rng2.next(), rng2.next()]).toEqual(first);
    let sum = 0;
    const rng3 = new Prng(7);
    for (let i = 0; i < 10000; i++) sum += rng3.next();
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
  });
});

describe("requirement 1.6 — determinism", () => {
  it("same config + seed ⇒ identical output (rect and circle, with band)", () => {
    for (const shape of [RECT, CIRCLE]) {
      const a = generateOutline(shape, config(), { strokeWidth: 2 });
      const b = generateOutline(shape, config(), { strokeWidth: 2 });
      expect(a.pathD).toEqual(b.pathD);
      expect(a.bandPathD).toEqual(b.bandPathD);
      expect(a.maxRadialDevPx).toEqual(b.maxRadialDevPx);
    }
  });

  it("different seeds ⇒ different outlines", () => {
    const a = generateOutline(RECT, config({}, 1));
    const b = generateOutline(RECT, config({}, 2));
    expect(a.pathD).not.toEqual(b.pathD);
  });

  it("per-instance seed derivation is stable", () => {
    expect(instanceSeed(42, 0)).toEqual(instanceSeed(42, 0));
    expect(instanceSeed(42, 0)).not.toEqual(instanceSeed(42, 1));
    expect(instanceSeed(42, 5)).not.toEqual(instanceSeed(43, 5));
  });
});

describe("requirement 1.5 — degeneration to zero", () => {
  it("all params zero ⇒ exact analytic prototype", () => {
    const zero = config({
      amplitude: 0,
      asymmetry: 0,
      cornerRadiusVariation: 0,
      strokeWidthVariation: 0,
    });
    for (const shape of [RECT, CIRCLE]) {
      const r = generateOutline(shape, zero);
      expect(r.degenerate).toBe(true);
      expect(r.pathD).toEqual(prototypePathD(shape));
      expect(r.maxRadialDevPx).toBe(0);
      expect(r.bandPathD).toBeNull();
    }
  });

  it("near-zero amplitude stays within a sub-pixel of the prototype", () => {
    const r = generateOutline(
      CIRCLE,
      config({ amplitude: 0.0005, asymmetry: 0, cornerRadiusVariation: 0 }),
    );
    expect(r.degenerate).toBe(false);
    expect(r.maxRadialDevPx).toBeLessThanOrEqual(0.0005 * 120 * 1.001);
  });
});

describe("amplitude budget", () => {
  it("max radial deviation ≤ amplitude·refSize (normalized field, attenuation only shrinks)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const wavelength of [0.05, 0.18, 1 / 3]) {
        for (const detail of [0, 0.5, 1]) {
          const c = config(
            { wavelength, detail, asymmetry: 0, cornerRadiusVariation: 0 },
            seed,
          );
          const r = generateOutline(RECT, c);
          expect(r.maxRadialDevPx).toBeLessThanOrEqual(
            c.params.amplitude * 64 * 1.003,
          );
        }
      }
    }
  });

  it("n=2048 shapes may overshoot the budget by the documented ≤ ~2% (off-norm-grid sampling)", () => {
    // 400×240 rect with r=2 forces n=2048, whose t-grid falls between the
    // 1024-point normalization grid samples. Frozen @1 behavior.
    const c = config({ asymmetry: 0, cornerRadiusVariation: 0 });
    const r = generateOutline(
      { kind: "roundedRect", width: 400, height: 240, cornerRadius: 2 },
      c,
    );
    expect(r.n).toBe(2048);
    expect(r.maxRadialDevPx).toBeLessThanOrEqual(
      c.params.amplitude * 240 * 1.02,
    );
  });

  it("clamps.maxAmplitudePx caps the deviation", () => {
    const c = config({ asymmetry: 0, cornerRadiusVariation: 0 });
    c.clamps.maxAmplitudePx = 0.3;
    const r = generateOutline(RECT, c);
    expect(r.maxRadialDevPx).toBeLessThanOrEqual(0.3 * 1.003);
  });

  it("field normalization puts max|D| at exactly 1 on the norm grid", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const spectrum = radialSpectrum(channelSeed(seed, CHANNEL.radial));
      const weights = radialWeights(0.18, 0.3);
      const scale = normalizationScale(spectrum, weights);
      const vals = evaluateFieldOnGrid(spectrum, weights, 1024);
      let m = 0;
      for (const v of vals) m = Math.max(m, Math.abs(v));
      expect(m * scale).toBeCloseTo(1, 12);
    }
  });

  it("radial envelope has no energy below KMIN (asymmetry's exclusive band)", () => {
    const w = radialWeights(1 / 3, 1);
    for (let k = 0; k < KMIN; k++) expect(w[k]).toBe(0);
  });
});

describe("channel independence", () => {
  it("strokeWidthVariation does not change the outline", () => {
    const a = generateOutline(RECT, config({ strokeWidthVariation: 0 }));
    const b = generateOutline(RECT, config({ strokeWidthVariation: 0.2 }));
    expect(a.pathD).toEqual(b.pathD);
  });

  it("cornerRadiusVariation does not re-randomize the radial texture (circle unaffected)", () => {
    const a = generateOutline(CIRCLE, config({ cornerRadiusVariation: 0 }));
    const b = generateOutline(CIRCLE, config({ cornerRadiusVariation: 0.3 }));
    expect(a.pathD).toEqual(b.pathD);
  });

  it("amplitude does not change the stroke width profile", () => {
    const a = generateOutline(CIRCLE, config({ amplitude: 0 }), {
      strokeWidth: 2,
    });
    const b = generateOutline(CIRCLE, config({ amplitude: 0.02 }), {
      strokeWidth: 2,
    });
    expect(a.strokeWidthRange).toEqual(b.strokeWidthRange);
  });
});

describe("outline structure", () => {
  it("path is closed and starts/ends at the same point", () => {
    const r = generateOutline(RECT, config());
    expect(r.pathD.endsWith("Z")).toBe(true);
    const m = r.pathD.match(/^M ([-\d.]+) ([-\d.]+)/)!;
    const lastC = r.pathD
      .match(/C [^C]*Z$/)![0]!
      .trim()
      .split(/\s+/);
    expect(lastC[lastC.length - 3]).toEqual(m[1]);
    expect(lastC[lastC.length - 2]).toEqual(m[2]);
  });

  it("band is emitted only when strokeWidthVariation > 0 and width range matches ±variation", () => {
    const none = generateOutline(RECT, config({ strokeWidthVariation: 0 }), {
      strokeWidth: 2,
    });
    expect(none.bandPathD).toBeNull();
    const band = generateOutline(RECT, config({ strokeWidthVariation: 0.2 }), {
      strokeWidth: 2,
    });
    expect(band.bandPathD).not.toBeNull();
    const [lo, hi] = band.strokeWidthRange!;
    expect(lo).toBeGreaterThanOrEqual(2 * 0.8 - 1e-9);
    expect(hi).toBeLessThanOrEqual(2 * 1.2 + 1e-9);
    expect(hi).toBeGreaterThan(lo);
  });

  it("corner radii respect the CSS overlap rule", () => {
    const r = resolveCornerRadii(100, 40, [30, 30, 30, 30]);
    expect(r[0] + r[3]).toBeLessThanOrEqual(40 + 1e-9);
    const c = config({ cornerRadiusVariation: 0.3 });
    const out = generateOutline(
      { kind: "roundedRect", width: 80, height: 40, cornerRadius: 20 },
      c,
    );
    const [tl, tr, br, bl] = out.cornerRadii!;
    expect(tl + tr).toBeLessThanOrEqual(80 + 1e-9);
    expect(tr + br).toBeLessThanOrEqual(40 + 1e-9);
    expect(br + bl).toBeLessThanOrEqual(80 + 1e-9);
    expect(bl + tl).toBeLessThanOrEqual(40 + 1e-9);
  });
});

describe("config schema v0.1 + v0.2", () => {
  it("v0.1 roundtrip", () => {
    const c = config();
    c.seed = 1234;
    c.seedPolicy = "per-instance";
    c.clamps.maxAmplitudePx = 1.5;
    expect(parseConfig(serializeConfig(c))).toEqual(c);
  });

  it("v0.2 roundtrip with sketch outline", () => {
    const c = configV2({}, 1234, defaultSketchOutline());
    c.clamps.maxAmplitudePx = 1.5;
    expect(parseConfig(serializeConfig(c))).toEqual(c);
    const noSketch = configV2();
    expect(parseConfig(serializeConfig(noSketch))).toEqual(noSketch);
  });

  it("clamps params to the ranges of the config's OWN version", () => {
    const v1 = config({ amplitude: 0.012 });
    (v1.params as { amplitude: number }).amplitude = 99;
    expect(parseConfig(serializeConfig(v1)).params.amplitude).toBe(0.03);
    const v2 = configV2();
    (v2.params as { amplitude: number }).amplitude = 99;
    expect(parseConfig(serializeConfig(v2)).params.amplitude).toBe(0.4);
  });

  it("rejects wrong spec, mismatched version/algorithm pairs, and v0.1 sketches", () => {
    expect(() => parseConfig('{"spec":"other"}')).toThrow();
    const mismatch = config() as unknown as Record<string, unknown>;
    mismatch["algorithm"] = ALGORITHM_V2; // specVersion still 0.1
    expect(() => parseConfig(JSON.stringify(mismatch))).toThrow();
    const sketchOnV1 = JSON.parse(serializeConfig(config())) as Record<
      string,
      unknown
    >;
    sketchOnV1["sketchOutline"] = defaultSketchOutline();
    expect(() => parseConfig(JSON.stringify(sketchOnV1))).toThrow();
    expect(() =>
      parseConfig(serializeConfig(config()).replace('"0.1"', '"0.9"')),
    ).toThrow();
  });

  it("v0.3 roundtrip with sketch outline (extreme regime)", () => {
    const c = configV3({ wavelength: 0.85 }, 1234, defaultSketchOutline());
    c.clamps.maxAmplitudePx = 1.5;
    expect(parseConfig(serializeConfig(c))).toEqual(c);
    const noSketch = configV3({ wavelength: 0.85 });
    expect(parseConfig(serializeConfig(noSketch))).toEqual(noSketch);
  });

  it("clamps @3 wavelength to its widened 1.0 cap", () => {
    const v3 = configV3();
    (v3.params as { wavelength: number }).wavelength = 99;
    expect(parseConfig(serializeConfig(v3)).params.wavelength).toBe(1);
    // The same value is clamped to 0.5 under @2 (its own version's range).
    const v2 = configV2();
    (v2.params as { wavelength: number }).wavelength = 99;
    expect(parseConfig(serializeConfig(v2)).params.wavelength).toBe(0.5);
  });
});

describe("organic-outline@2 (bold regime + sketch outline)", () => {
  it("@1 output is bit-stable regardless of @2's existence (same config ⇒ same anchors)", () => {
    const a = generateOutline(RECT, config());
    const b = generateOutline(RECT, config());
    expect(a.anchors).toEqual(b.anchors);
    expect(a.sketchPathD).toBeNull();
  });

  it("@2 differs from @1 only through the envelope floor (k=2 energy present)", () => {
    const w1 = radialWeights(0.3, 0.5);
    const w2 = radialWeightsV2(0.3, 0.5);
    expect(w1[2]).toBe(0);
    expect(w2[2]).toBeGreaterThan(0);
    for (let k = KMIN; k <= 20; k++) {
      // Same k0 (1/0.3 > 3 so no floor clamping) ⇒ identical weights above k=2.
      expect(w2[k]).toBe(w1[k]);
    }
    expect(KMIN_V2).toBe(2);
  });

  it("@3 differs from @2 only through the envelope floor (k=1 energy present)", () => {
    const w2 = radialWeightsV2(0.3, 0.5);
    const w3 = radialWeightsV3(0.3, 0.5);
    expect(w2[1]).toBe(0);
    expect(w3[1]).toBeGreaterThan(0);
    for (let k = KMIN_V2; k <= 20; k++) {
      // k0 = 1/0.3 > 2 so no floor clamping ⇒ identical weights at k ≥ 2.
      expect(w3[k]).toBe(w2[k]);
    }
    expect(KMIN_V3).toBe(1);
  });

  it("@3 wavelength 1.0 puts the dominant energy at k=1 (the egg/pear lobe)", () => {
    const w = radialWeightsV3(1, 0);
    for (let k = 2; k <= 20; k++) expect(w[1]).toBeGreaterThan(w[k]!);
  });

  it("@3 outline generates and stays within the amplitude budget", () => {
    const c = configV3({ amplitude: 0.24, wavelength: 0.85, asymmetry: 0 });
    const r = generateOutline(CIRCLE, c);
    expect(r.maxRadialDevPx).toBeGreaterThan(0.1 * 120);
    expect(r.maxRadialDevPx).toBeLessThanOrEqual(0.24 * 120 * 1.003);
  });

  it("@2 accepts bold amplitudes and stays within budget (guard only shrinks)", () => {
    const c = configV2({
      amplitude: 0.3,
      wavelength: 0.5,
      asymmetry: 0,
      cornerRadiusVariation: 0,
    });
    const r = generateOutline(CIRCLE, c);
    expect(r.maxRadialDevPx).toBeGreaterThan(0.1 * 120); // genuinely bold
    expect(r.maxRadialDevPx).toBeLessThanOrEqual(0.3 * 120 * 1.003);
  });

  it("sketch outline: deterministic, independent of the fill seed shift only", () => {
    const sk = defaultSketchOutline();
    const a = generateOutline(CIRCLE, configV2({}, 42, sk));
    const b = generateOutline(CIRCLE, configV2({}, 42, sk));
    expect(a.sketchPathD).not.toBeNull();
    expect(a.sketchAnchors).toEqual(b.sketchAnchors);
    expect(a.pathD).toEqual(generateOutline(CIRCLE, configV2()).pathD); // fill unchanged by sketch
    const shifted = generateOutline(
      CIRCLE,
      configV2({}, 42, { ...sk, seedShift: 2 }),
    );
    expect(shifted.sketchPathD).not.toEqual(a.sketchPathD);
    expect(shifted.pathD).toEqual(a.pathD);
  });

  it("sketch outline affine: scale + offset move the anchors exactly", () => {
    const sk = {
      ...defaultSketchOutline(),
      scale: 1.1,
      offset: [0.1, 0] as [number, number],
    };
    const base = generateOutline(
      CIRCLE,
      configV2({}, 42, { ...sk, scale: 1, offset: [0, 0] }),
    );
    const moved = generateOutline(CIRCLE, configV2({}, 42, sk));
    const b = base.sketchAnchors!;
    const m = moved.sketchAnchors!;
    expect(m.length).toBe(b.length);
    expect(m[0]).toBeCloseTo(b[0]! * 1.1 + 0.1 * 120, 9);
    expect(m[1]).toBeCloseTo(b[1]! * 1.1, 9);
  });

  it("sketch outline survives degenerate-to-zero (outline around pure geometry)", () => {
    const c = configV2(
      {
        amplitude: 0,
        asymmetry: 0,
        cornerRadiusVariation: 0,
        strokeWidthVariation: 0,
      },
      42,
      defaultSketchOutline(),
    );
    const r = generateOutline(CIRCLE, c);
    expect(r.degenerate).toBe(true);
    expect(r.pathD).toEqual(prototypePathD(CIRCLE));
    expect(r.sketchPathD).not.toBeNull();
  });

  it("@1 configs never grow a sketch even if the field is present", () => {
    const c = config();
    (c as { sketchOutline?: unknown }).sketchOutline = defaultSketchOutline();
    const r = generateOutline(RECT, c);
    expect(r.sketchPathD).toBeNull();
  });
});

describe("fold-over guard at bold amplitudes", () => {
  /** Does the closed anchor polyline self-intersect? O(n²) segment sweep with neighbor exclusion. */
  function selfIntersects(anchors: Float64Array): boolean {
    const n = anchors.length / 2;
    const px = (i: number) => anchors[2 * (i % n)]!;
    const py = (i: number) => anchors[2 * (i % n) + 1]!;
    const orient = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      cx: number,
      cy: number,
    ) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    for (let i = 0; i < n; i++) {
      const ax = px(i),
        ay = py(i),
        bx = px(i + 1),
        by = py(i + 1);
      const minX = Math.min(ax, bx),
        maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by),
        maxY = Math.max(ay, by);
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent across the seam
        const cx = px(j),
          cy = py(j),
          dx = px(j + 1),
          dy = py(j + 1);
        if (
          Math.max(cx, dx) < minX ||
          Math.min(cx, dx) > maxX ||
          Math.max(cy, dy) < minY ||
          Math.min(cy, dy) > maxY
        )
          continue;
        if (
          orient(ax, ay, bx, by, cx, cy) !== orient(ax, ay, bx, by, dx, dy) &&
          orient(cx, cy, dx, dy, ax, ay) !== orient(cx, cy, dx, dy, bx, by)
        )
          return true;
      }
    }
    return false;
  }

  const SMALL_R: Shape = {
    kind: "roundedRect",
    width: 200,
    height: 64,
    cornerRadius: 2,
  };

  it("@2 rects with small corners stay simple at bold amplitudes (review found 47/60 failures pre-fix)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const amplitude of [0.2, 0.4]) {
        const r = generateOutline(
          SMALL_R,
          configV2(
            {
              amplitude,
              wavelength: 0.5,
              detail: 0.15,
              asymmetry: 0,
              cornerRadiusVariation: 0,
            },
            seed,
          ),
        );
        expect(
          selfIntersects(r.anchors),
          `seed ${seed} amplitude ${amplitude}`,
        ).toBe(false);
      }
    }
  });

  it("@2 circles stay simple at the amplitude ceiling", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = generateOutline(
        CIRCLE,
        configV2(
          { amplitude: 0.4, wavelength: 0.5, detail: 0.15, asymmetry: 0 },
          seed,
        ),
      );
      expect(selfIntersects(r.anchors), `seed ${seed}`).toBe(false);
    }
  });

  it("@1 subtle regime stays simple (control)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = generateOutline(
        SMALL_R,
        config(
          {
            amplitude: 0.03,
            wavelength: 0.05,
            detail: 1,
            asymmetry: 0,
            cornerRadiusVariation: 0,
          },
          seed,
        ),
      );
      expect(selfIntersects(r.anchors), `seed ${seed}`).toBe(false);
    }
  });
});

describe("shipped spec files", () => {
  it("every specs/*.json validates and roundtrips unchanged", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(__dirname, "..", "specs");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = parseConfig(text);
      // Clamping must be a no-op: shipped values are already in range.
      expect(JSON.parse(serializeConfig(parsed))).toEqual(JSON.parse(text));
    }
  });
});

describe("golden conformance vectors (bugs in a released version are spec: fixes go to the NEXT version)", () => {
  /**
   * Conformance is defined over the output DOUBLES (anchors + stroke widths),
   * never the 3-decimal path strings — string quantization would mask sub-5e-4
   * drift and couple the hash to JS rounding/ToString semantics.
   * FNV-1a over each double's little-endian uint32 halves.
   */
  function hashDoubles(values: ArrayLike<number>): number {
    const f = Float64Array.from(values as number[]);
    const dv = new DataView(f.buffer);
    let h = 0x811c9dc5;
    for (let i = 0; i < f.length; i++) {
      h = Math.imul(h ^ dv.getUint32(i * 8, true), 0x01000193) >>> 0;
      h = Math.imul(h ^ dv.getUint32(i * 8 + 4, true), 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  it("pinned cross-port unit vectors (PRNG / trig layers)", () => {
    expect(new Prng(42).nextU32()).toBe(551831576);
    expect(mix32(1)).toBe(2261973619);
    expect(channelSeed(42, CHANNEL.radial)).toBe(3219145548);
    expect(instanceSeed(42, 0)).toBe(551831576);
    expect(dcos(1)).toBe(0.5403023058681398);
  });

  it("outputs match committed golden hashes", async () => {
    const golden = (await import("./golden.json")).default as Record<
      string,
      number
    >;
    const cases: Array<[string, Shape, OrganicConfig]> = [
      ["rect-default-42", RECT, config()],
      ["circle-default-42", CIRCLE, config()],
      [
        "rect-extreme-7",
        RECT,
        config(
          {
            amplitude: 0.03,
            wavelength: 0.05,
            detail: 1,
            asymmetry: 1,
            cornerRadiusVariation: 0.3,
          },
          7,
        ),
      ],
      [
        "circle-longwave-99",
        CIRCLE,
        config({ amplitude: 0.02, wavelength: 1 / 3, detail: 0 }, 99),
      ],
      [
        "v2-rect-bold-7",
        RECT,
        // Sketch is a frozen LITERAL (not defaultSketchOutline()) so retuning
        // the playground default can never break this vector.
        configV2(
          { amplitude: 0.18, wavelength: 0.5, detail: 0.15, asymmetry: 0.2 },
          7,
          {
            seedShift: 1,
            scale: 1.08,
            offset: [0.08, -0.05],
            amplitudeScale: 0.9,
            widthRel: 0.018,
          },
        ),
      ],
      [
        "v2-circle-bean-42",
        CIRCLE,
        configV2({ amplitude: 0.22, wavelength: 0.5, detail: 0.1 }, 42, {
          seedShift: 3,
          scale: 1.12,
          offset: [0.08, -0.06],
          amplitudeScale: 0.9,
          widthRel: 0.02,
        }),
      ],
      [
        "v3-circle-blob-42",
        CIRCLE,
        // Extreme regime: wavelength 0.85 (k0 ≈ 1.18) ⇒ dominant k=1 lobe.
        configV3({ amplitude: 0.24, wavelength: 0.85, detail: 0.1 }, 42, {
          seedShift: 3,
          scale: 1.12,
          offset: [0.08, -0.06],
          amplitudeScale: 0.9,
          widthRel: 0.02,
        }),
      ],
      [
        "v3-rect-blob-7",
        RECT,
        configV3(
          { amplitude: 0.2, wavelength: 1, detail: 0.15, asymmetry: 0.2 },
          7,
          {
            seedShift: 1,
            scale: 1.08,
            offset: [0.08, -0.05],
            amplitudeScale: 0.9,
            widthRel: 0.018,
          },
        ),
      ],
    ];
    const actual: Record<string, number> = {};
    for (const [name, shape, c] of cases) {
      const r = generateOutline(shape, c, { strokeWidth: 2 });
      // Anchors cover the radial/corners/asym channels; sketch anchors cover
      // the @2 sketch layer; the stroke width range covers the stroke channel
      // (band geometry derives from both).
      const values = [
        ...r.anchors,
        ...(r.sketchAnchors ?? []),
        ...(r.strokeWidthRange ?? [0, 0]),
      ];
      actual[name] = hashDoubles(values);
    }
    if (Object.keys(golden).length === 0) {
      // Bootstrap mode: print the vectors to commit.
      console.log("GOLDEN BOOTSTRAP:", JSON.stringify(actual));
    }
    expect(Object.keys(golden).length).toBeGreaterThan(0);
    expect(actual).toEqual(golden);
  });
});
