/**
 * The four experiment views + the tune view. All are live layouts over the
 * single store — the param panel stays mounted and every slider drag
 * re-renders the active view (the convergence loop is "drag while staring").
 */

import { prototypePathD, prototypePerimeter } from "../core/prototypes";
import { instanceSeed } from "../core/prng";
import {
  ALGORITHM_V1,
  ALGORITHM_V2,
  SUBTLE_AMPLITUDE_MAX,
} from "../core/config";
import type { Shape } from "../core/types";
import { clear, h, svg } from "./dom";
import { TEXT } from "./labels";
import {
  DARK,
  DIFF_COLOR,
  EXAGGERATE_COLOR,
  GHOST_COLOR,
  LIGHT,
  renderShape,
  sketchPadPx,
  type Palette,
} from "./render";
import { currentShape, type AppState, type Store } from "./store";

export type ViewUpdate = (state: AppState) => void;

const LINEUP_SIZES = [32, 44, 88, 200];
const ANCHOR_SIZE = 44;

function shapeSize(shape: Shape): { w: number; h: number } {
  return shape.kind === "circle"
    ? { w: shape.diameter, h: shape.diameter }
    : { w: shape.width, h: shape.height };
}

/** Shape at the playground aspect ratio scaled so refSize = `refSize`. */
function scaledShape(state: AppState, refSize: number): Shape {
  if (state.shapeKind === "circle")
    return { kind: "circle", diameter: refSize };
  const k = refSize / Math.min(state.rectWidth, state.rectHeight);
  return {
    kind: "roundedRect",
    width: state.rectWidth * k,
    height: state.rectHeight * k,
    cornerRadius: state.cornerRadius * k,
  };
}

interface CardOpts {
  seed?: number;
  amplitude?: number;
  caption?: string[];
  captionClass?: string;
  palette?: Palette;
  onClick?: () => void;
  highlight?: boolean;
}

/** One shape rendered 1:1 px in its own <svg>, plus caption lines. */
function shapeCard(
  state: AppState,
  shape: Shape,
  opts: CardOpts = {},
): HTMLElement {
  const pal = opts.palette ?? LIGHT;
  const { node, result } = renderShape({
    shape,
    config: state.config,
    mode: state.renderMode,
    strokeWidth: state.baseStrokeWidth,
    seed: opts.seed,
    amplitude: opts.amplitude,
    blink: state.blink,
    palette: pal,
  });
  const { w, h: sh } = shapeSize(shape);
  const pad =
    Math.ceil(
      result.maxTotalDevPx +
        (state.renderMode === "fill" ? 0 : state.baseStrokeWidth),
    ) +
    sketchPadPx(shape, state.config, opts.amplitude) +
    4;
  const el = svg("svg", {
    width: String(Math.ceil(w + 2 * pad)),
    height: String(Math.ceil(sh + 2 * pad)),
    viewBox: `${-w / 2 - pad} ${-sh / 2 - pad} ${w + 2 * pad} ${sh + 2 * pad}`,
  });
  el.append(node);
  const card = h(
    "div",
    { class: "card" + (opts.highlight ? " highlight" : "") },
    el,
  );
  for (const line of opts.caption ?? []) {
    card.append(
      h("div", { class: `caption ${opts.captionClass ?? ""}` }, line),
    );
  }
  if (opts.onClick) {
    card.classList.add("clickable");
    card.addEventListener("click", opts.onClick);
  }
  return card;
}

// ---------------------------------------------------------------- tune view

export function tuneView(container: HTMLElement, store: Store): ViewUpdate {
  const toolbar = h("div", { class: "view-toolbar" });
  const compareBtns = (["single", "sideBySide", "overlay"] as const).map(
    (mode) => {
      const label =
        mode === "single"
          ? TEXT.compareSingle
          : mode === "sideBySide"
            ? TEXT.compareSide
            : TEXT.compareOverlay;
      const b = h("button", { class: "seg", type: "button" }, label);
      b.addEventListener("click", () => store.set({ compareMode: mode }));
      return [mode, b] as const;
    },
  );
  const overlayToggles = (
    [
      ["overlayGhost", TEXT.ghost],
      ["overlayDiff", TEXT.diff],
      ["overlayExaggerate", TEXT.exaggerate],
    ] as const
  ).map(([key, label]) => {
    const cb = h("input", { type: "checkbox" });
    cb.addEventListener("change", () => store.set({ [key]: cb.checked }));
    return [key, cb, h("label", { class: "toggle" }, cb, label)] as const;
  });
  const zoom = h("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.01",
    class: "zoom",
  });
  zoom.addEventListener("input", () =>
    store.set({ zoom: 0.5 * Math.pow(16, Number(zoom.value)) }),
  );
  toolbar.append(
    h("div", { class: "segmented" }, ...compareBtns.map(([, b]) => b)),
    ...overlayToggles.map(([, , el]) => el),
    h("label", { class: "toggle" }, `${TEXT.zoom} `, zoom),
  );

  const stage = h("div", { class: "stage" });
  const readout = h("div", { class: "readout" });
  const wrap = h("div", { class: "stage-wrap" }, stage, readout);
  container.append(toolbar, wrap);

  return (state) => {
    for (const [mode, b] of compareBtns)
      b.classList.toggle("active", state.compareMode === mode);
    for (const [key, cb] of overlayToggles) cb.checked = state[key];
    if (document.activeElement !== zoom) {
      zoom.value = String(Math.log(state.zoom / 0.5) / Math.log(16));
    }

    const shape = currentShape(state);
    const { w, h: sh } = shapeSize(shape);
    const refSize = Math.min(w, sh);
    const ghostD = prototypePathD(shape);

    const organic = renderShape({
      shape,
      config: state.config,
      mode: state.renderMode,
      strokeWidth: state.baseStrokeWidth,
      blink: state.blink && state.compareMode !== "sideBySide",
      palette: LIGHT,
    });

    // Geometry-derived extent: fixed factors clipped @2 bold shapes/sketches.
    const overhang =
      organic.result.maxTotalDevPx +
      sketchPadPx(shape, state.config) +
      (state.renderMode === "fill" ? 0 : state.baseStrokeWidth);
    const extent = ((Math.max(w, sh) / 2 + overhang) * 2 * 1.25) / state.zoom;
    const vb = `${-extent / 2} ${-extent / 2} ${extent} ${extent}`;
    const mkSvg = () => svg("svg", { class: "stage-svg", viewBox: vb });

    clear(stage);
    if (state.compareMode === "sideBySide") {
      const left = mkSvg();
      left.append(organic.node);
      const pure = renderShape({
        shape,
        config: state.config,
        mode: state.renderMode,
        strokeWidth: state.baseStrokeWidth,
        blink: true,
        palette: LIGHT,
      });
      const right = mkSvg();
      right.append(pure.node);
      stage.append(
        h(
          "div",
          { class: "side" },
          left,
          h("div", { class: "caption" }, "有機 organic"),
        ),
        h(
          "div",
          { class: "side" },
          right,
          h("div", { class: "caption" }, "純幾何 geometric"),
        ),
      );
    } else {
      const s = mkSvg();
      s.append(organic.node);
      if (state.compareMode === "overlay" && !state.blink) {
        if (state.overlayDiff) {
          s.append(
            svg("path", {
              d: `${organic.result.pathD} ${ghostD}`,
              "fill-rule": "evenodd",
              fill: DIFF_COLOR,
              opacity: "0.45",
            }),
          );
        }
        if (state.overlayGhost) {
          s.append(
            svg("path", {
              d: ghostD,
              fill: "none",
              stroke: GHOST_COLOR,
              "stroke-width": "1",
              "vector-effect": "non-scaling-stroke",
              opacity: "0.55",
            }),
          );
        }
        if (state.overlayExaggerate) {
          // Magnify the CLAMPED effective amplitude with the clamp bypassed —
          // passing the clamp through would cap the ghost back onto the
          // outline and silently neutralize the lens.
          const clampPx = state.config.clamps.maxAmplitudePx;
          const effAmp =
            clampPx === null
              ? state.config.params.amplitude
              : Math.min(state.config.params.amplitude, clampPx / refSize);
          const ex = renderShape({
            shape,
            config: { ...state.config, clamps: { maxAmplitudePx: null } },
            mode: "fill",
            strokeWidth: 0,
            amplitude: effAmp * 5,
            palette: LIGHT,
          });
          s.append(
            svg("path", {
              d: ex.result.pathD,
              fill: "none",
              stroke: EXAGGERATE_COLOR,
              "stroke-width": "1",
              "vector-effect": "non-scaling-stroke",
              opacity: "0.8",
            }),
          );
        }
      }
      stage.append(s);
    }

    // Readouts + perception warnings.
    const p = state.config.params;
    const dev = organic.result.maxRadialDevPx;
    const perimeter = prototypePerimeter(shape);
    const period = perimeter * p.wavelength;
    const lines: Array<[string, string]> = [
      [
        TEXT.maxDev,
        `${dev.toFixed(2)} px（refSize 的 ${((dev / refSize) * 100).toFixed(2)}%）`,
      ],
    ];
    if (organic.result.maxTotalDevPx > dev + 0.005) {
      lines.push([
        TEXT.totalDev,
        `${organic.result.maxTotalDevPx.toFixed(2)} px`,
      ]);
    }
    if (shape.kind === "roundedRect" && p.amplitude > 0) {
      lines.push([
        "佔圓角",
        `${((dev / Math.max(1e-6, shape.cornerRadius)) * 100).toFixed(1)}%`,
      ]);
    }
    if (p.amplitude > 0)
      lines.push([TEXT.undulation, `約每 ${period.toFixed(0)} px`]);
    if (organic.result.strokeWidthRange) {
      const [lo, hi] = organic.result.strokeWidthRange;
      lines.push(["描邊寬", `${lo.toFixed(2)}–${hi.toFixed(2)} px`]);
    }
    lines.push([
      TEXT.zone,
      p.amplitude <= SUBTLE_AMPLITUDE_MAX ? TEXT.zoneSubtle : TEXT.zoneBold,
    ]);
    lines.push(["seed", String(state.config.seed)]);

    const warnings: string[] = [];
    if (p.amplitude > 0 && dev < 0.5) warnings.push(TEXT.warnSubpixel);
    const kTop =
      p.detail > 0.05
        ? 64
        : Math.min(64, Math.ceil(2.5 / Math.max(p.wavelength, 0.01)));
    if (p.amplitude > 0 && perimeter / kTop < 2)
      warnings.push(TEXT.warnAliasing);
    if (
      state.renderMode !== "fill" &&
      state.baseStrokeWidth < 1.5 &&
      p.strokeWidthVariation > 0
    ) {
      warnings.push(TEXT.warnHairline);
    }
    if (shape.kind === "roundedRect" && organic.result.cornerRadii) {
      const rMin = Math.min(...organic.result.cornerRadii);
      if (p.amplitude * refSize > 0.7 * rMin) warnings.push(TEXT.warnFoldRisk);
    }

    readout.replaceChildren(
      ...lines.map(([k, v]) =>
        h("div", { class: "readout-line" }, h("span", {}, k), " ", v),
      ),
      ...warnings.map((t) => h("div", { class: "readout-warn" }, `⚠ ${t}`)),
    );
  };
}

// -------------------------------------------------------------- lineup view

export function lineupView(container: HTMLElement, store: Store): ViewUpdate {
  const root = h("div", { class: "lineup" });
  container.append(
    h(
      "p",
      { class: "view-note" },
      "三種尺度律 × 四種尺寸，1:1 像素呈現。若「等比例」在小尺寸過躁或大尺寸過平，即是啟用 clamps.maxAmplitudePx 的證據。",
    ),
    root,
  );
  void store;
  return (state) => {
    const amp = state.config.params.amplitude;
    const rows: Array<{ label: string; ampFor: (s: number) => number }> = [
      { label: TEXT.rowProportional, ampFor: () => amp },
      { label: TEXT.rowConstPx, ampFor: (s) => (amp * ANCHOR_SIZE) / s },
      { label: TEXT.rowSqrt, ampFor: (s) => amp * Math.sqrt(ANCHOR_SIZE / s) },
    ];
    const clampPx = state.config.clamps.maxAmplitudePx;
    clear(root);
    for (const row of rows) {
      const cells = h("div", { class: "lineup-row-cells" });
      for (const size of LINEUP_SIZES) {
        const shape = scaledShape(state, size);
        const a = row.ampFor(size);
        // The caption must report what is actually rendered: the generator
        // caps the effective amplitude at maxAmplitudePx when the fuse is on.
        const rawDelta = Math.max(0, a * size);
        const delta = clampPx === null ? rawDelta : Math.min(rawDelta, clampPx);
        const clamped = clampPx !== null && rawDelta > clampPx + 1e-9;
        const card = shapeCard(state, shape, {
          amplitude: a,
          caption: [
            `${size}px · Δ${delta.toFixed(2)}px${clamped ? "（受鉗）" : ""}`,
          ],
        });
        cells.append(card);
      }
      root.append(
        h("div", { class: "lineup-row" }, h("h3", {}, row.label), cells),
      );
    }
  };
}

// ---------------------------------------------------------------- grid view

export function gridView(container: HTMLElement, store: Store): ViewUpdate {
  const COLS = 6;
  const ROWS = 4;
  const GAP = 12;
  let swapped = false;

  const toolbar = h("div", { class: "view-toolbar" });
  const swapBtn = h("button", { class: "btn", type: "button" }, TEXT.swapSides);
  swapBtn.addEventListener("click", () => {
    swapped = !swapped;
    update(store.get());
  });
  toolbar.append(
    swapBtn,
    h(
      "p",
      { class: "view-note inline" },
      "同一 config 鋪排成網格：左右兩種 seedPolicy，何者該為規格預設？",
    ),
  );
  const panels = h("div", { class: "grid-panels" });
  container.append(toolbar, panels);

  const update = (state: AppState) => {
    const shape = scaledShape(state, ANCHOR_SIZE);
    const { w, h: sh } = shapeSize(shape);
    const pad =
      Math.ceil(
        state.config.params.amplitude * ANCHOR_SIZE + state.baseStrokeWidth,
      ) +
      sketchPadPx(shape, state.config) +
      3;
    const cellW = w + 2 * pad + GAP;
    const cellH = sh + 2 * pad + GAP;

    const makePanel = (perInstance: boolean) => {
      const el = svg("svg", {
        width: String(COLS * cellW),
        height: String(ROWS * cellH),
        viewBox: `0 0 ${COLS * cellW} ${ROWS * cellH}`,
      });
      for (let i = 0; i < COLS * ROWS; i++) {
        const cx = (i % COLS) * cellW + cellW / 2;
        const cy = Math.floor(i / COLS) * cellH + cellH / 2;
        const { node } = renderShape({
          shape,
          config: state.config,
          mode: state.renderMode,
          strokeWidth: state.baseStrokeWidth,
          seed: perInstance ? instanceSeed(state.config.seed, i) : undefined,
          blink: state.blink,
          palette: LIGHT,
        });
        node.setAttribute("transform", `translate(${cx} ${cy})`);
        el.append(node);
      }
      const title = perInstance ? TEXT.gridPerInstance : TEXT.gridFixed;
      const active =
        (perInstance && state.config.seedPolicy === "per-instance") ||
        (!perInstance && state.config.seedPolicy === "fixed");
      return h(
        "div",
        { class: "grid-panel" + (active ? " active-policy" : "") },
        h("h3", {}, title + (active ? "（目前規格預設）" : "")),
        el,
      );
    };

    clear(panels);
    const fixed = makePanel(false);
    const per = makePanel(true);
    panels.append(...(swapped ? [per, fixed] : [fixed, per]));
  };
  return update;
}

// -------------------------------------------------------------- ladder view

export function ladderView(container: HTMLElement, store: Store): ViewUpdate {
  const root = h("div", {});
  container.append(
    h(
      "p",
      { class: "view-note" },
      "兩條強度帶：微妙帶（@1 規格範圍，二次間距）與大膽帶（@2 的 blob 區）。在 @1 config 上點擊大膽帶會升級為 @2。點擊任一格採用該振幅。",
    ),
    root,
  );
  return (state) => {
    const isV1 = state.config.algorithm === ALGORITHM_V1;
    const bands: Array<{ label: string; steps: number[]; bold: boolean }> = [
      {
        label: `${TEXT.zoneSubtle}（amplitude ≤ ${SUBTLE_AMPLITUDE_MAX}）`,
        steps: [0, 1, 2, 3, 4, 5, 6].map(
          (i) => SUBTLE_AMPLITUDE_MAX * (i / 6) * (i / 6),
        ),
        bold: false,
      },
      {
        label: `${TEXT.zoneBold}（organic-outline@2）`,
        steps: [0.05, 0.09, 0.14, 0.2, 0.28, 0.4],
        bold: true,
      },
    ];
    const all = bands.flatMap((b) => b.steps);
    const current = state.config.params.amplitude;
    let nearest = all[0]!;
    for (const a of all)
      if (Math.abs(a - current) < Math.abs(nearest - current)) nearest = a;
    const clampPx = state.config.clamps.maxAmplitudePx;

    clear(root);
    for (const band of bands) {
      const row = h("div", { class: "ladder" });
      for (const a of band.steps) {
        const shape = scaledShape(state, 88);
        // With the fuse on, every step above clamp/88 renders identically —
        // say so instead of advertising a Δ that is not on screen.
        const rawDelta = a * 88;
        const clamped = clampPx !== null && rawDelta > clampPx + 1e-9;
        const delta = clamped ? clampPx : rawDelta;
        const v1OutOfSpec = isV1 && a > SUBTLE_AMPLITUDE_MAX + 1e-9;
        // Bold-band cells preview with @2 even under an @1 config — clicking
        // forks to @2, so the preview must match the post-click result.
        const cellState: AppState =
          band.bold && isV1
            ? {
                ...state,
                config: {
                  ...state.config,
                  algorithm: ALGORITHM_V2,
                  specVersion: "0.2",
                  sketchOutline: state.config.sketchOutline ?? null,
                },
              }
            : state;
        row.append(
          shapeCard(cellState, shape, {
            amplitude: a,
            caption: [
              `amplitude ${a.toFixed(4)} · Δ${delta.toFixed(1)}px${clamped ? "（受鉗）" : ""}`,
              ...(v1OutOfSpec ? [`@1 ${TEXT.outOfSpec}`] : []),
            ],
            captionClass: v1OutOfSpec ? "out-of-spec" : "",
            highlight: a === nearest,
            onClick: () => store.setParam("amplitude", a),
          }),
        );
      }
      root.append(
        h("div", { class: "lineup-row" }, h("h3", {}, band.label), row),
      );
    }
  };
}

// --------------------------------------------------------- fill/stroke view

export function fillStrokeView(
  container: HTMLElement,
  store: Store,
): ViewUpdate {
  const toolbar = h("div", { class: "view-toolbar" });
  const darkBtn = h("button", { class: "btn", type: "button" }, TEXT.darkBg);
  darkBtn.addEventListener("click", () =>
    store.set({ darkBg: !store.get().darkBg }),
  );
  toolbar.append(
    darkBtn,
    h(
      "p",
      { class: "view-note inline" },
      "同一 config 的三種渲染 × 兩種尺寸：規格最終要涵蓋哪些情境？",
    ),
  );
  const root = h("div", { class: "fillstroke" });
  container.append(toolbar, root);

  return (state) => {
    const pal = state.darkBg ? DARK : LIGHT;
    root.classList.toggle("dark", state.darkBg);
    darkBtn.classList.toggle("active", state.darkBg);
    clear(root);
    for (const size of [ANCHOR_SIZE, 88]) {
      const shape = scaledShape(state, size);
      const rowEl = h("div", { class: "fs-row" });
      for (const mode of ["fill", "stroke", "fillStroke"] as const) {
        const stateForCell: AppState = { ...state, renderMode: mode };
        const label =
          mode === "fill"
            ? TEXT.fill
            : mode === "stroke"
              ? TEXT.stroke
              : TEXT.fillStroke;
        const band =
          mode !== "fill" && state.config.params.strokeWidthVariation > 0
            ? "（帶狀描邊）"
            : "";
        rowEl.append(
          shapeCard(stateForCell, shape, {
            palette: pal,
            caption: [`${label} · ${size}px ${band}`],
          }),
        );
      }
      root.append(rowEl);
    }
    if (
      state.baseStrokeWidth < 1.5 &&
      state.config.params.strokeWidthVariation > 0
    ) {
      root.append(h("p", { class: "readout-warn" }, `⚠ ${TEXT.warnHairline}`));
    }
  };
}
