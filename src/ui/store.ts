/** Minimal pub/sub store for the playground (vanilla TS, no framework). */

import type { OrganicConfig, Shape, SketchOutline } from "../core/types";
import {
  ALGORITHM_V2,
  ALGORITHM_V3,
  defaultConfig,
  defaultSketchOutline,
  PARAM_RANGES_V2,
} from "../core/config";

export type RenderMode = "fill" | "stroke" | "fillStroke";
export type CompareMode = "single" | "sideBySide" | "overlay";
export type ViewId = "grid" | "tune" | "ladder" | "fillStroke";

export interface AppState {
  config: OrganicConfig;
  shapeKind: Shape["kind"];
  /** Rounded-rect playground geometry (px). */
  rectWidth: number;
  rectHeight: number;
  cornerRadius: number;
  /** Circle playground geometry (px). */
  diameter: number;
  renderMode: RenderMode;
  baseStrokeWidth: number;
  compareMode: CompareMode;
  view: ViewId;
  zoom: number;
  /** Overlay-mode layers. */
  overlayGhost: boolean;
  overlayDiff: boolean;
  overlayExaggerate: boolean;
  /** Hold-Space blink comparator: render the pure prototype while held (transient). */
  blink: boolean;
  /** Dark background toggle (fill×stroke view). */
  darkBg: boolean;
  /** Recent seeds, newest first (Shift+R steps back). */
  seedHistory: number[];
}

export function initialState(): AppState {
  return {
    config: defaultConfig(),
    shapeKind: "roundedRect",
    rectWidth: 200,
    rectHeight: 64,
    cornerRadius: 16,
    diameter: 120,
    renderMode: "stroke",
    baseStrokeWidth: 2,
    compareMode: "overlay",
    view: "grid",
    zoom: 1,
    overlayGhost: true,
    overlayDiff: false,
    overlayExaggerate: false,
    blink: false,
    darkBg: false,
    seedHistory: [],
  };
}

/** Current shape derived from playground geometry controls. */
export function currentShape(s: AppState): Shape {
  return s.shapeKind === "circle"
    ? { kind: "circle", diameter: s.diameter }
    : {
        kind: "roundedRect",
        width: s.rectWidth,
        height: s.rectHeight,
        cornerRadius: s.cornerRadius,
      };
}

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private scheduled = false;

  constructor(state: AppState = initialState()) {
    this.state = state;
  }

  get(): AppState {
    return this.state;
  }

  /** Shallow-merge a partial state and schedule one re-render per frame. */
  set(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      for (const fn of this.listeners) fn(this.state);
    });
  }

  /** Update nested config fields conveniently. */
  setConfig(partial: Partial<OrganicConfig>): void {
    this.set({ config: { ...this.state.config, ...partial } });
  }

  /**
   * Fork the config to the minimal version these params require, never
   * downgrading. A param edit on a frozen @1 config moves it to @2 (the @2
   * ranges are a superset; the imported file is untouched). Pushing wavelength
   * past @2's cap moves it to @3 (the k=1 "blob" regime). Already being @3
   * keeps @3 even when wavelength drops back: @3's lower frequency floor
   * changed the shape, so an edit must not silently snap that energy away.
   */
  private forked(params: OrganicConfig["params"]): OrganicConfig {
    const base = this.state.config;
    const wantV3 =
      base.algorithm === ALGORITHM_V3 ||
      params.wavelength > PARAM_RANGES_V2.wavelength.max;
    return {
      ...base,
      algorithm: wantV3 ? ALGORITHM_V3 : ALGORITHM_V2,
      specVersion: wantV3 ? "0.3" : "0.2",
      params,
      sketchOutline: base.sketchOutline ?? null,
    };
  }

  setParam(key: keyof OrganicConfig["params"], value: number): void {
    const p = this.state.config.params;
    this.set({ config: this.forked({ ...p, [key]: value }) });
  }

  /** Bulk param edit (zero-all). Forks the version monotonically like any param edit. */
  setParams(partial: Partial<OrganicConfig["params"]>): void {
    const p = this.state.config.params;
    this.set({ config: this.forked({ ...p, ...partial }) });
  }

  /**
   * Apply a regime preset — an EXPLICIT version choice that bypasses forked()'s
   * monotonic no-downgrade rule. The slider rule keeps @3 when you nudge
   * wavelength back down, but clicking 大膽/微妙預設 must drop @3 → @2 outright;
   * 極限預設 selects @3.
   */
  setRegime(
    extreme: boolean,
    params: OrganicConfig["params"],
    sketch: SketchOutline | null,
  ): void {
    this.set({
      config: {
        ...this.state.config,
        algorithm: extreme ? ALGORITHM_V3 : ALGORITHM_V2,
        specVersion: extreme ? "0.3" : "0.2",
        params,
        sketchOutline: sketch,
      },
    });
  }

  /** Replace the sketch outline (null = off). Implies at least @2. */
  setSketch(sketch: SketchOutline | null): void {
    this.set({
      config: {
        ...this.forked(this.state.config.params),
        sketchOutline: sketch,
      },
    });
  }

  patchSketch(partial: Partial<SketchOutline>): void {
    const current = this.state.config.sketchOutline ?? defaultSketchOutline();
    this.setSketch({ ...current, ...partial });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
