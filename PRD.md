# Product Requirements Document (PRD) — Organic Design: Organic Line Tuning Tool

> Status: **Implemented (v1 + v2 core)** — `organic-outline@1` (frozen, subtle
> UI specs) and `organic-outline@2` (bold regime + floating sketch outline,
> schema v0.2) both ship; specs delivered: `button.organic.json`,
> `circle.organic.json` (@1), `blob.bold.organic.json` (@2). Remaining v2
> candidates (triangle / palette / composition view) are listed under "v2
> Candidates". Vision: In 2013, Apple defined an era with Flat Design. The
> long-term vision of Organic Design is to define the next era with an entirely
> new design language. This repo is the first step toward that vision: building
> a tuning tool to find the line parameters that make shapes "look natural to
> the human eye."

# Objective

## Vision & Philosophy

Build a brand-new, original design system — **Organic Design**.

Looking back at existing design languages — skeuomorphism, flat design,
Material, or any derivative school — their skeleton is fundamentally the same:
**geometric design**. Straight lines, perfect circles, grids, regular rounded
rectangles — everything is constructed with rulers and coordinates; the
interface is "drawn."

The opposite of organic is precisely geometric.

Organic Design chooses to stand at the other end of this axis: taking forms from
nature as prototypes, using irregular contours, growth-like curves, and flowing
boundaries to replace ruler-drawn lines, making the interface look not drawn,
but **grown**.

The system encompasses its philosophy, visual principles, and reusable
components, so that products built with it exhibit a distinctive, instantly
recognizable style.

## Goal of This Repo: A Line Tuning Tool

To realize the vision above, the first problem that must be solved is: **how to
imitate geometry with the organic** — e.g., how can a button with a corner
radius, or a perfectly circular button, be reinterpreted with organic lines
while still looking natural to humans?

Therefore this repo is an **organic line tuning tool** (Web playground): it
translates geometric primitives into organic shapes with a natural sense of
imperfection via adjustable parameters; through live preview and A/B comparison
it is tuned iteratively, ultimately producing a set of **config / specs** —
defining the line parameters that "look natural to humans," serving as the line
foundation of the Organic Design language.

**The tool is the experimental instrument**: the perceptual questions about
"naturalness" (how much to deviate, how to scale across sizes, whether instances
should differ slightly, fill vs. stroke) cannot be answered on paper — the
tool's reason for existence is to turn these questions into operable experiment
views and answer them by eye.

### Core Thesis

**"Geometric silhouette, organic stroke."**

Nature has no perfect circles or straight lines; mathematically perfect shapes
look cold and digital to the human eye. But deviate too far from geometry, and a
button no longer reads as a button. The tool's mission is to **find the
perceptual sweet spot** — the shape is still recognized as its geometric
prototype (affordance unchanged) yet radiates a sense of life; the specs'
mission is to **pin that sweet spot down**.

### Three-Layer Positioning

1. **Vision**: the Organic Design language (long-term, beyond this repo's scope)
2. **This repo**: the organic line tuning tool (Web playground)
3. **Deliverable**: the tuned config / specs

# Goals and Non-Goals

### Goals

- Goal 1: Build an **organic line generator** — input geometric primitives and
  parameters, output organicized shapes
- Goal 2: Provide a **Web playground** — parameter sliders, live preview,
  "organic vs. pure geometry" A/B comparison, four experiment views
- Goal 3: Produce the **first version of the specs** — finalized "subtly
  organic" parameters for the rounded-rectangle button and circular button,
  exportable as config

### Non-Goals

- Non-Goal 1: **Overtly hand-drawn style** (e.g., Excalidraw / rough.js) — the
  target is "subtle organic": at first glance it still reads as standard
  geometry, with imperfections only noticeable on close inspection — not an
  instantly recognizable hand-drawn look
  - **Revised 2026-06-13** by the user-provided reference (see "Look-and-feel
    Reference v2"): **bold, blob-level deformation is now in scope** as the
    desired look. What remains a non-goal is the rough.js-style _sketchy line
    texture_ (jitter, double-stroking, scratchy strokes) — the reference's lines
    are smooth and confident; the deformation is large, the line quality is
    clean
- Non-Goal 2: **Motion** (breathing, trembling) — the first version covers
  static outlines only; motion is a later phase
- Non-Goal 3: **A complete design system** (color, typography, component
  library) — that is the vision layer; this repo only solves lines
- Non-Goal 4: **Multi-person blind-testing platform** — the first version is
  finalized via subjective tuning; blind testing is a later validation option

# Requirements

_What any successful version of the tuning tool must provide._

- [x] Requirement 1: **Organic line generator** — converts geometric shapes
      (rounded rectangle, circle) into organicized shapes; output for the same
      config + seed must be reproducible (deterministic)
- [x] Requirement 2: **Parameter panel** — perturbation-related parameters can
      be adjusted in real time with immediate visual feedback
- [x] Requirement 3: **A/B comparison** — the organic shape and its pure
      geometric prototype can be compared side by side or as an overlay
- [x] Requirement 4: **Config export / import** — tuning results can be saved as
      a versioned, parameters-only file (the carrier of the specs)
- [x] Requirement 5: **Two shapes supported initially** — a button with corner
      radius, and a circular button
- [x] Requirement 6: **Algorithm as spec** — the generation algorithm is defined
      as "reference implementation + version number"; any renderer using the
      same algorithm version + same config + same seed must reproduce the
      identical outline
- [x] Requirement 7: **Experiment views** — built-in views answering the four
      perceptual questions: multi-size lineup (size dependency), repeated
      instance grid with both fixed and per-instance seed modes (instance
      uniqueness), intensity ladder (intensity anchoring), and fill vs. stroke
      side by side (fill and stroke)

### User Stories

- As a **tuner (designer)**, I want to drag sliders and see the button outline's
  organic variation in real time, and compare against the pure geometric version
  at any moment, so that I can converge by eye on the "natural but not sloppy"
  sweet spot.
- As a **tuner (designer)**, I want to lay out the same config across multiple
  sizes, multiple repeated instances, and multiple intensity steps at once, so
  that I can answer the perceptual questions of size, uniqueness, and intensity
  by eye.
- As a **future front-end developer**, I want a machine-readable config / specs,
  so that I can reproduce exactly the same organic lines in a component library
  with any rendering technology.

# Design

## Overview

**Subtle organic**: a single shape looks like a standard geometric button at
first glance, with imperfections only noticeable on close inspection — it
conveys warmth and a sense of life, not a hand-drawn style. "Distinctive and
instantly recognizable" emerges from accumulation: when every line in the
interface carries the same set of controlled imperfections, the whole exudes a
recognizable organic character, rather than relying on the exaggerated
distortion of any single shape.

Contrast with flat design: Flat eliminates ornament through mathematical purity;
Organic preserves the recognizability of geometry but replaces mathematical
perfection with **controlled imperfection** — the interface is not drawn, but
grown.

## Look-and-feel Reference v2 (2026-06-13, user-provided)

> Reference:
> [Colorful organic shapes seamless pattern — Vecteezy #1255622](https://www.vecteezy.com/vector-art/1255622-colorful-organic-shapes-seamless-pattern)
> ("我想要的是像這樣" — recorded before any implementation change.)

What the reference shows (observed characteristics, to become capabilities):

1. **Bold deformation, smooth lines**: deviation visually ≈ 10–40% of shape size
   — far beyond v1's `amplitude` range (0–0.03) and squarely in the zone the v1
   intensity ladder marked "out of spec" (the "blob cliff"). Deformation energy
   is **low-frequency** (≈ k 2–5) with little high-frequency content: blobby and
   confident, never shaky or sketchy. Prototypes stay recognizable (circle,
   rounded square, triangle, bean/blob).
2. **Floating sketch outline**: a thin outline that _loosely_ follows its fill
   shape — offset, differently deformed (different seed / scale / position),
   sometimes around an empty area. The fill↔outline mismatch is a signature
   element, not an error. v1 has no such layer (its stroke hugs the fill).
3. **New prototypes**: triangle appears; some shapes are free-form blobs with no
   geometric prototype at all.
4. **Flat warm fills**: cream background; orange / coral / maroon / dusty-pink
   solids. No gradients, shadows, or texture. (Color was explicitly out of scope
   for this repo in v1 — bringing palette presets in is a scope change to
   confirm.)
5. **Context is decorative composition** (scattered pattern / illustration), not
   UI controls — unlike v1's button-affordance framing.

**Open questions raised by this revision (to adjudicate before implementing):**

- Does bold organic **replace** subtle organic, or do the two become **modes**
  of one system (bold = illustration/brand graphics, subtle = UI components,
  sharing the same algorithm at different operating points)? Core Thesis ("a
  button still reads as a button") and Design Principle 1 currently assume the
  subtle end.
- The bold regime stresses v1's frozen constraints: `amplitude` range, the KMIN
  = 3 floor (bean/kidney shapes are k≈2-dominant), the ≤2% `asymmetry` budget,
  and concavity (which the fold-over guard intentionally suppresses inward).
  Reaching the reference look likely means **organic-outline@2** rather than
  stretching @1's ranges.
- The floating sketch outline needs a layer model (per-layer seed/transform),
  which touches the config schema.

## Design Principles

1. **Geometry stays legible**: after organicization the prototype must still be
   read at a glance — a button is still a button, a circle is still a circle
   (affordance unchanged)
2. **Imperfection is controlled**: the amount of deviation is a parameter with a
   budget; there is a clear line between "natural" and "sloppy"
3. **Reproducible**: the same config + seed always produces the same shape —
   otherwise specs are meaningless

## Visual Foundations

This repo handles only "shape & form" (the rest belongs to the vision layer, out
of scope):

- Shape & form: geometric primitives + controlled perturbation; implementation
  detailed in "Parameter Set v1"
- Color / typography / depth / motion / texture & materials: **out of scope for
  this repo**

## Parameter Set v1

_Finalized (designed by AI on commission). Principle: minimal but sufficient;
range values are starting points, revisable during tuning._

| #   | Parameter (key)         | Slider label            | Range            | What it controls                                                                        | Perceptual mapping                                                                          |
| --- | ----------------------- | ----------------------- | ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `amplitude`             | Perturbation amplitude  | 0–0.03           | Maximum deviation from the geometric prototype (relative to reference size)             | Master knob of "total organic feel"; too high reads as sloppy                               |
| 2   | `wavelength`            | Perturbation wavelength | 0.05–1/3         | Density of undulation (relative to perimeter); revised from 0.05–0.5 — see decision log | Long waves = slow hand-shaped drift; short waves = trembling, roughness                     |
| 3   | `detail`                | Detail                  | 0–1              | Blend weight of high-frequency noise layers (octaves)                                   | Micro texture; low values recommended for subtle organic                                    |
| 4   | `asymmetry`             | Global asymmetry        | 0–1              | Global low-order deformation (slight ellipticization / tilt, ≤ ~2%)                     | Breaks the perfect symmetry of the overall mass — natural objects are never perfectly round |
| 5   | `cornerRadiusVariation` | Corner variation        | 0–0.3            | ± relative difference among the four corner radii (seeded; rectangles only)             | The four corners of a handmade object are never equal                                       |
| 6   | `strokeWidthVariation`  | Stroke width variation  | 0–0.2            | Relative variation of stroke width along the path (stroke mode only)                    | A sense of pen pressure; uniform stroke width is a major source of digital feel             |
| 7   | `seed`                  | Seed                    | Integer + reroll | The concrete shape instance under the same parameters                                   | Anchor of reproducibility                                                                   |

**Shared properties**:

- All parameters are in **relative units** (dimensionless): amplitude relative
  to reference size (min(width, height) for rectangles, diameter for circles),
  wavelength relative to perimeter — so one spec applies across sizes (built-in
  assumption, to be validated by the experiment views)
- All randomness is determined by `seed` — same config + same seed always yields
  the same shape
- **Degenerates to zero**: with all parameters at zero, the output must
  degenerate to the exact geometric prototype — pure geometry is the origin of
  the parameter space

**Playground controls (not spec parameters)**: shape switch (rounded rectangle /
circle), size, base corner radius, stroke / fill toggle and base stroke width,
A/B comparison mode (side-by-side / overlay), experiment view switch, zoom,
maximum deviation readout (px), seed reroll, config export / import.

## Experiment Views

_Four perceptual questions, one view each, answered by eye:_

| View                   | Content                                                                                 | Question answered   |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------- |
| Multi-size lineup      | The same config rendered at multiple sizes simultaneously (e.g., 32 / 44 / 88 / 200px)  | Size dependency     |
| Repeated instance grid | The same button tiled into a grid, fixed-seed and per-instance-seed modes side by side  | Instance uniqueness |
| Intensity ladder       | amplitude stepped from 0 to its max, side by side (other parameters fixed)              | Intensity anchoring |
| Fill vs. stroke lineup | The same config rendered three ways side by side: fill only, stroke only, fill + stroke | Fill and stroke     |

## Output & Consumption Model (Finalized)

- **config / spec = parameters only**: contains no baked coordinates or SVG
  paths
- **Components consume parameters and draw themselves**: the component library
  receives a config and runs the generation algorithm with a technology of its
  choice (SVG path is the default recommendation; Canvas or other rendering
  methods are fine)
- **The algorithm is part of the spec**: the config carries an `algorithm`
  version field; the generator inside the playground is the reference
  implementation — any renderer with the same algorithm version, same
  parameters, and same seed must produce the same shape
- **Benefits**: the spec is decoupled from rendering technology, files are tiny,
  and reproduction is cross-platform

### Config Schema Draft (v0.1)

```jsonc
{
  "spec": "organic-line",
  "specVersion": "0.1",
  "algorithm": "organic-outline@1", // algorithm name + version: part of the spec
  "params": {
    "amplitude": 0.012,
    "wavelength": 0.18,
    "detail": 0.25,
    "asymmetry": 0.15,
    "cornerRadiusVariation": 0.1,
    "strokeWidthVariation": 0.08,
  },
  "seed": 42,
  "seedPolicy": "fixed", // "fixed" | "per-instance", both implemented; default decided via experiment views
  "clamps": { "maxAmplitudePx": null }, // size-dependency fuse, disabled by default, validated via experiment views
}
```

### Config Schema v0.2 (organic-outline@2: bold regime + sketch outline)

```jsonc
{
  "spec": "organic-line",
  "specVersion": "0.2",
  "algorithm": "organic-outline@2", // pairs strictly with specVersion 0.2
  "params": {
    // same six param keys (seed stays a sibling field); ranges widen:
    // amplitude ≤ 0.4, wavelength ≤ 0.5 (k0 ≥ 2)
    "amplitude": 0.2,
    "wavelength": 0.5,
    "detail": 0.12,
    "asymmetry": 0.2,
    "cornerRadiusVariation": 0.1,
    "strokeWidthVariation": 0,
  },
  "seed": 42,
  "seedPolicy": "per-instance",
  "clamps": { "maxAmplitudePx": null },
  "sketchOutline": {
    // the floating outline of the bold reference; null = off; refSize-relative
    "seedShift": 1, // outline seed = instanceSeed(seed, seedShift)
    "scale": 1.08,
    "offset": [0.08, -0.05],
    "amplitudeScale": 0.7,
    "widthRel": 0.018,
  },
}
```

## Tuning Targets (Initial Scope)

- [x] Button with corner radius (rounded rectangle)
- [x] Circular button
- [ ] (Later) straight lines / dividers, cards, navigation, form controls

## References

- Apple Flat Design (iOS 7, 2013): the control group — a mathematically pure
  design language
- rough.js / Excalidraw: existing implementations of overt hand-drawn style (the
  reference point for this project's "non-goals")
- Apple's continuous-curvature corners (squircle / superellipse): a precedent
  for optimizing perception through geometric means

---

# Pre Implementation

## Perceptual Questions (Answered by the Tool, Not Implementation Blockers)

_The following questions are not answered at the PRD level — the doubts are
built into experiment views, finalized by eye once the tool is built, with
conclusions recorded in the decision log:_

- [x] **Size dependency**: does the "proportional scaling" assumption of
      relative units hold? → multi-size lineup view; if small sizes get too busy
      or large sizes too flat, enable `clamps.maxAmplitudePx`
- [x] **Instance uniqueness**: both fixed and per-instance seedPolicy are
      implemented (finalized); which becomes the spec default → repeated
      instance grid view
- [x] **Intensity anchoring**: how subtle should "subtle organic" be? →
      intensity ladder view
- [x] **Fill and stroke**: which rendering scenarios does the final spec cover?
      → fill vs. stroke lineup view

## Decision Log

| Date       | Decision                                     | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-13 | Look-and-feel target                         | Subtle organic — still reads as geometry at first glance, imperfections only on close inspection; overt hand-drawn style is a non-goal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-06-13 | Tool form                                    | Web playground (live preview + sliders + config export)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-06-13 | Motion scope                                 | First version is static only; motion (breathing, trembling) is a later phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-06-13 | Acceptance criteria                          | Subjective tuning + built-in "organic vs. pure geometry" A/B comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-06-13 | Parameter set                                | v1 with seven parameters (designed by AI on the user's commission, see "Parameter Set v1")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-06-13 | Output format                                | Config is parameters only; components consume parameters and draw themselves (SVG or other); the algorithm version is part of the spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-06-13 | Tech stack                                   | Vite + vanilla TypeScript (no UI framework)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-06-13 | Instance uniqueness                          | Both fixed and per-instance seedPolicy are implemented; the default is decided via experiment views                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-06-13 | Perceptual question positioning              | Perceptual questions about size, intensity, fill/stroke etc. are not answered on paper — they become experiment views; the tool is the experimental instrument                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-06-13 | Algorithm basis (**overturn**)               | Simplex-on-a-circle replaced by a **seeded harmonic spectrum + spectral envelope**: Gaussian coefficients (Irwin–Hall) for every integer harmonic k=1..64 drawn once per channel; `wavelength`/`detail` act purely through a smooth envelope w(k) (Lorentzian bump at k0=1/wavelength, half-width k0/2, plus a detail-weighted 1/f tail); field normalized on a fixed 1024-point grid so `amplitude` is an exact max-deviation budget. Rationale (8-analyst deep-dive + 3-lens judge panel, unanimous): simplex's un-normalized loop max varies 0.40–1.00 across seeds — it breaks the amplitude budget that the intensity ladder, px readout and clamps depend on — and carries a heavy porting surface (permutation tables, skew constants); the harmonic field is a one-page bit-portable formula, continuous in every slider, and never re-randomizes on parameter change |
| 2026-06-13 | Wavelength range (revision)                  | Capped at 1/3 (base harmonic k0 ≥ 3): k=2 radial energy is pure ovalization, which is `asymmetry`'s exclusive job — at 0.5 the two sliders fight each other                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-06-13 | Corner fold-over guard                       | Inward displacement is soft-capped at 0.7/κ (curvature-aware, eroded + smoothed, saturation x/√√(1+x⁴)): without it 17–49% of seeds self-intersect at amplitude 0.03 with small corner radii. Playground floors base radius at 2px; r=0 is documented as outside @1's guarantee                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-06-13 | Determinism hardening                        | In-house deterministic cos/sin (range reduction + degree-22 Maclaurin) and splitmix32 PRNG with fixed per-channel salts (radial/stroke/corners/asym) — changing one parameter never re-randomizes another channel; conformance is defined over output doubles (`anchors`), pinned by golden FNV-1a hashes + cross-port unit vectors in CI; **bugs in @1 are spec — fixes go to organic-outline@2**                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-06-13 | Variable-width stroke rendering              | SVG has no variable-width stroke: `strokeWidthVariation` renders as a filled ring band (outer + reversed inner offset of the displaced midline, fill-rule nonzero, normals recomputed from the midline); native stroke when variation = 0. The stroke field uses a fixed low-frequency "pen pressure" envelope (bump at k=2, harmonics 1–8), independent of the outline channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-06-13 | Size dependency (experiment)                 | Answered by the 3-scaling-law lineup: pure proportional overshoots at large sizes (Δ2.4px @200px reads wavy at first glance) while constant-px reads dead at 200px → keep relative `amplitude` and **enable `clamps.maxAmplitudePx: 1.5` in the shipped specs**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-06-13 | Instance uniqueness (experiment)             | **`seedPolicy: "fixed"` is the spec default** — repeated UI components should stamp identically; per-instance reads subtly restless in the 6×4 grid and remains available for decorative contexts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-06-13 | Intensity anchoring (experiment)             | Subtle zone ≈ amplitude 0.008–0.015 (specs: 0.010 button / 0.009 circle); 0.015+ with short wavelength reads hand-drawn; the "blob cliff" (prototype identity loss) starts ≈ 0.03+ — the ladder keeps two out-of-spec cells (0.06 / 0.10) as anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-06-13 | Fill & stroke (experiment)                   | The spec covers all three renderings (fill / stroke / fill+stroke), verified at 44 & 88px on light and dark backgrounds; hairline guard: warn when base stroke < 1.5px with width variation on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-06-13 | First specs delivered                        | `specs/button.organic.json` (amplitude 0.01, wavelength 0.22) and `specs/circle.organic.json` (amplitude 0.009, wavelength 0.25), both schema v0.1, `organic-outline@1`, seed 42, fixed policy, clamp 1.5px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-06-13 | Dev-only dependency additions                | `vitest` (unit + golden conformance tests) and `playwright` (headless visual verification, `scripts/shoot.mjs`); runtime remains zero-dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-06-13 | Look-and-feel target (v2 revision, recorded) | User-provided reference ([Vecteezy #1255622](https://www.vecteezy.com/vector-art/1255622-colorful-organic-shapes-seamless-pattern)): the desired look is **bold organic** — blob-level low-frequency deformation (≈10–40% of size, k ≈ 2–5, smooth not sketchy), flat warm fills, and a thin **floating sketch outline** offset from the fill. This is the regime v1 marked as the out-of-spec "blob cliff"; it revises Non-Goal 1 and stresses @1's frozen constraints (amplitude range, KMIN=3, asymmetry ≤2%, inward fold guard) — likely `organic-outline@2`. Details and open questions in "Look-and-feel Reference v2". **Recorded only; implementation and subtle-vs-bold scoping not yet decided**                                                                                                                                                                    |
| 2026-06-13 | organic-outline@2 (bold regime)              | Implemented as a strict superset with exactly TWO algorithmic differences from @1: (a) harmonic floor 3 → 2 (k0 = 1/wavelength ∈ [2, 20]); (b) fold-guard erosion window widened from ±n/128 to the inward displacement's arc-length reach, max(n/128, ⌈1.5·amplitude·refSize·n/perimeter⌉) — adversarial review found the @1 window let perpendicular edge bands cross near small-radius rect corners at bold amplitudes (47/60 seeds at amplitude 0.2, r=2); after the fix a 30-case self-intersection sweep is clean and pinned in CI. Ranges widen to amplitude ≤ 0.4, wavelength ≤ 0.5; concavity reachable (bean/kidney). **@1 stays frozen** — all four @1 golden vectors bit-identical; the playground dual-renders by `config.algorithm`, and param edits on an @1 config fork it to @2 (one-way, file untouched)                                                    |
| 2026-06-13 | Sketch outline layer (schema v0.2)           | `sketchOutline: { seedShift, scale, offset[2], amplitudeScale, widthRel }` (refSize-relative); outline = full independent generation with seed `instanceSeed(seed, seedShift)`, then p′ = p·scale + offset·refSize; conformance over `sketchAnchors` doubles, covered by two @2 golden vectors. Tuned by eye: amplitudeScale ≈ 0.7 — the reference's outlines are calmer than their fills                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-06-13 | Subtle-vs-bold positioning (default)         | **Two regimes of one system**: @2 spans subtle → bold continuously (presets jump to either end; ladder shows both bands); @1 remains the frozen carrier of the shipped UI specs. Replacing subtle outright remains open to user override                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-06-13 | Bold example spec delivered                  | `specs/blob.bold.organic.json` (amplitude 0.2, wavelength 0.5, per-instance seeds, sketch outline on) — validated in CI with the other specs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Technical Approach Options

- Noise: ~~periodic noise on a closed loop — sample 2D simplex along a circle in
  noise space~~ **overturned during implementation** → seeded harmonic
  spectrum + smooth spectral envelope (periodic by construction, exact amplitude
  budget, one-page portable spec); see the decision log entry "Algorithm basis"
- Outline construction: sample the geometric prototype at equal arc lengths →
  displace each point along its normal (with curvature-aware inward attenuation)
  → Catmull-Rom smoothing → convert to a closed cubic Bézier path
- Rendering (playground reference implementation): SVG path; the component
  library side is free to choose SVG / Canvas / other, as long as it implements
  the same algorithm version
- Front-end framework: **finalized — Vite + vanilla TypeScript** (no UI
  framework dependency, staying minimal; the generation algorithm itself has
  zero dependencies, easing future porting)

## Dependencies to Install

| Package      | Version    | Purpose                  | Install command       | Link                         |
| ------------ | ---------- | ------------------------ | --------------------- | ---------------------------- |
| `vite`       | latest     | Dev server + build (dev) | `npm i -D vite`       | <https://vite.dev>           |
| `typescript` | latest 5.x | Type checking (dev)      | `npm i -D typescript` | <https://typescriptlang.org> |

_Zero runtime dependencies: the harmonic field, deterministic trig and the
seeded PRNG are implemented in-house — the algorithm is part of the spec and
must not depend on a third-party library's internals (version upgrades could
change the output and break reproducibility). Added during implementation as
dev-only tooling: `vitest` (tests), `playwright` (headless visual
verification)._

---

# Implementation Tasks

### Phase 0: Project Skeleton

- [x] 0.1 Set up the Vite + vanilla TypeScript project skeleton (dev
      dependencies only: vite, typescript)
- [x] 0.2 Basic page layout: parameter panel on the left, preview canvas on the
      right

### Phase 1: Generator Core (Reference Implementation `organic-outline@1`, Zero Runtime Dependencies)

- [x] 1.1 Implement a seeded PRNG and periodic simplex noise in-house (closed
      and seamless; output permanently stable, no third-party libraries)
- [x] 1.2 Geometric prototypes: equal-arc-length sampling of closed paths for
      the rounded rectangle and circle (with normals)
- [x] 1.3 Normal displacement → Catmull-Rom smoothing → closed cubic Bézier path
- [x] 1.4 Wire up all seven parameters (including `asymmetry` low-order
      deformation, `cornerRadiusVariation`, `strokeWidthVariation`)
- [x] 1.5 Verify **degeneration to zero**: all parameters at zero = exact
      geometric prototype
- [x] 1.6 Verify **determinism**: repeated generation with the same config +
      same seed produces identical output

### Phase 2: Playground

- [x] 2.1 Seven-parameter slider panel with live SVG preview
- [x] 2.2 A/B comparison: side-by-side mode and overlay mode (geometric
      prototype shown as a ghost line)
- [x] 2.3 Shape switch, size, base corner radius, stroke / fill toggle with base
      stroke width, zoom
- [x] 2.4 Maximum deviation readout (px)
- [x] 2.5 Config export / import (schema v0.1)

### Phase 3: Experiment Views (Answering the Four Perceptual Questions)

- [x] 3.1 Multi-size lineup (e.g., 32 / 44 / 88 / 200px) → size dependency
- [x] 3.2 Repeated instance grid: fixed vs. per-instance seed side by side →
      instance uniqueness
- [x] 3.3 Intensity ladder (amplitude sweep side by side) → intensity anchoring
- [x] 3.4 Fill / stroke / fill + stroke in three columns side by side → fill and
      stroke

### Phase 4: Tuning & Finalization

- [x] 4.1 Tune with the experiment views in practice, answer the four perceptual
      questions, record conclusions in the decision log
- [x] 4.2 Produce the first version of the specs: `specs/button.organic.json`,
      `specs/circle.organic.json` (tentative names)

# Post Implementation

_(Candidates for later phases: motion / breathing feel, more shapes (straight
lines, cards), multi-person blind testing to validate the specs.)_

## v2 Candidates (from the 2026-06-13 bold-organic reference)

- [x] Decide subtle-vs-bold positioning → **two regimes of one system**
      (implemented default, open to user override): `organic-outline@2` spans
      subtle → bold on one continuous parameter space; `organic-outline@1` stays
      frozen as the carrier of the shipped subtle UI specs. The playground
      renders whichever algorithm a config names; editing an @1 config's params
      forks it to @2 (the file itself is untouched).
- [x] Bold deformation regime → `organic-outline@2`: amplitude ≤ 0.4, wavelength
      ≤ 0.5 (k floor lowered 3 → 2), concavity reachable. The fold guard's
      erosion window is widened at bold amplitudes (the @1 window let
      perpendicular edge bands cross near small rect corners — caught in
      adversarial review, fixed, pinned by a 30-case self-intersection sweep in
      CI). @1 bit-stability proven: all four @1 golden vectors unchanged.
- [x] Floating sketch outline layer → `sketchOutline` in schema v0.2:
      `{ seedShift, scale, offset[2], amplitudeScale, widthRel }`, all
      refSize-relative; outline seed = `instanceSeed(seed, seedShift)`, affine
      p′ = p·scale + offset·refSize. Out-of-range values are clamped at parse
      time to: seedShift 1–999, scale 0.9–1.3, offset ±0.2, amplitudeScale 0–2,
      widthRel 0.005–0.06 (clamped configs are non-conformant as shipped specs —
      ports must treat these ranges as the valid domain). Delivered example:
      `specs/blob.bold.organic.json` (amplitudeScale 0.7 — the reference's
      outlines are calmer than their fills).
- [ ] New prototypes: triangle; free-form blob (no geometric prototype)
- [ ] Flat-fill palette presets (cream / orange / coral / maroon / dusty pink) —
      confirms a scope change: color enters the repo
- [ ] Composition/pattern view: scattered multi-shape arrangement like the
      reference, for judging the look in context
