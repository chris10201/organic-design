/** State persistence: shareable URL hash + localStorage, precedence hash > localStorage > defaults. */

import {
  ALGORITHM_V1,
  ALGORITHM_V2,
  ALGORITHM_V3,
  defaultConfig,
  rangesFor,
  sanitizeSketchOutline,
} from "../core/config";
import type { OrganicParams } from "../core/types";
import { initialState, type AppState, type ViewId } from "./store";

// v2: the center-point default changed (config.ts). Bumping the key drops stale
// v1 working state so a fresh load opens on the new center, not the old default.
const LS_KEY = "organic-design:v2:state";

const HASH_PARAM_KEYS: Array<[string, keyof OrganicParams]> = [
  ["amp", "amplitude"],
  ["wav", "wavelength"],
  ["det", "detail"],
  ["asym", "asymmetry"],
  ["crv", "cornerRadiusVariation"],
  ["swv", "strokeWidthVariation"],
];

const VIEWS: ViewId[] = ["grid", "tune", "ladder", "fillStroke"];

export function toHash(s: AppState): string {
  const parts: string[] = [];
  const algNum =
    s.config.algorithm === ALGORITHM_V1
      ? 1
      : s.config.algorithm === ALGORITHM_V3
        ? 3
        : 2;
  parts.push(`alg=${algNum}`);
  for (const [short, key] of HASH_PARAM_KEYS)
    parts.push(`${short}=${s.config.params[key]}`);
  parts.push(`seed=${s.config.seed}`);
  parts.push(`policy=${s.config.seedPolicy}`);
  parts.push(`shape=${s.shapeKind === "circle" ? "circle" : "rect"}`);
  parts.push(`view=${s.view}`);
  if (s.config.algorithm !== ALGORITHM_V1) {
    const sk = s.config.sketchOutline;
    // "off" is a real state: without an explicit token, a shared sketch-off
    // URL would keep the recipient's localStorage sketch (hash must win).
    parts.push(
      sk
        ? `sketch=${sk.seedShift},${sk.scale},${sk.offset[0]},${sk.offset[1]},${sk.amplitudeScale},${sk.widthRel}`
        : "sketch=off",
    );
  }
  return "#" + parts.join("&");
}

function clampParam(
  algorithm: string,
  key: keyof OrganicParams,
  v: number,
): number {
  const { min, max } = rangesFor(algorithm)[key];
  return Math.min(max, Math.max(min, v));
}

function applyHash(state: AppState, hash: string): AppState {
  if (!hash.startsWith("#") || hash.length < 2) return state;
  const pairs = new Map<string, string>();
  for (const pair of hash.slice(1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq > 0) pairs.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const out = {
    ...state,
    config: { ...state.config, params: { ...state.config.params } },
  };

  // Algorithm first — it decides the clamping ranges for everything after.
  if (pairs.get("alg") === "1") {
    out.config.algorithm = ALGORITHM_V1;
    out.config.specVersion = "0.1";
    out.config.sketchOutline = null;
  } else if (pairs.get("alg") === "3") {
    out.config.algorithm = ALGORITHM_V3;
    out.config.specVersion = "0.3";
  } else if (pairs.get("alg") === "2") {
    out.config.algorithm = ALGORITHM_V2;
    out.config.specVersion = "0.2";
  }

  for (const [short, key] of HASH_PARAM_KEYS) {
    const v = pairs.get(short);
    if (v !== undefined) {
      const num = Number(v);
      if (Number.isFinite(num)) out.config.params[key] = num;
    }
    // Re-clamp even params absent from the hash: "#alg=1" over a stored bold
    // @2 state must not leave out-of-range @1 params for the session.
    out.config.params[key] = clampParam(
      out.config.algorithm,
      key,
      out.config.params[key],
    );
  }

  const seed = Number(pairs.get("seed"));
  if (Number.isInteger(seed)) out.config.seed = seed >>> 0;
  const policy = pairs.get("policy");
  if (policy === "fixed" || policy === "per-instance")
    out.config.seedPolicy = policy;
  if (pairs.has("shape"))
    out.shapeKind = pairs.get("shape") === "circle" ? "circle" : "roundedRect";
  const view = pairs.get("view");
  if (view !== undefined && (VIEWS as string[]).includes(view))
    out.view = view as ViewId;

  const sketch = pairs.get("sketch");
  if (sketch !== undefined && out.config.algorithm !== ALGORITHM_V1) {
    if (sketch === "off") {
      out.config.sketchOutline = null;
    } else {
      const nums = sketch.split(",").map(Number);
      out.config.sketchOutline = sanitizeSketchOutline({
        seedShift: nums[0],
        scale: nums[1],
        offset: [nums[2], nums[3]],
        amplitudeScale: nums[4],
        widthRel: nums[5],
      });
    }
  }
  return out;
}

export function loadInitialState(): AppState {
  let state = initialState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>;
      const base = initialState();
      state = {
        ...base,
        ...saved,
        config: {
          ...base.config,
          ...(saved.config ?? {}),
          params: { ...base.config.params, ...(saved.config?.params ?? {}) },
          clamps: { ...base.config.clamps, ...(saved.config?.clamps ?? {}) },
        },
      };
      // Never trust persisted identity fields; the algorithm/specVersion PAIR
      // is a validated variable (an @1 config must survive a reload as @1).
      state.config.spec = defaultConfig().spec;
      if (state.config.algorithm === ALGORITHM_V1) {
        state.config.specVersion = "0.1";
        state.config.sketchOutline = null;
      } else if (state.config.algorithm === ALGORITHM_V3) {
        state.config.specVersion = "0.3";
        state.config.sketchOutline = sanitizeSketchOutline(
          state.config.sketchOutline,
        );
      } else {
        state.config.algorithm = ALGORITHM_V2;
        state.config.specVersion = "0.2";
        state.config.sketchOutline = sanitizeSketchOutline(
          state.config.sketchOutline,
        );
      }
      for (const key of HASH_PARAM_KEYS.map(([, k]) => k)) {
        state.config.params[key] = clampParam(
          state.config.algorithm,
          key,
          Number(state.config.params[key]) || 0,
        );
      }
    }
  } catch {
    // Corrupt storage: fall back to defaults.
  }
  state = applyHash(state, location.hash);
  // Transient fields never come back from storage, and enum-ish fields are
  // whitelisted — a drifted/tampered value must not brick the first render.
  const base = initialState();
  state.blink = false;
  if (!VIEWS.includes(state.view)) state.view = base.view;
  if (!["single", "sideBySide", "overlay"].includes(state.compareMode))
    state.compareMode = base.compareMode;
  if (!["fill", "stroke", "fillStroke"].includes(state.renderMode))
    state.renderMode = base.renderMode;
  if (state.shapeKind !== "roundedRect" && state.shapeKind !== "circle")
    state.shapeKind = base.shapeKind;
  state.seedHistory = Array.isArray(state.seedHistory)
    ? state.seedHistory
        .filter((s): s is number => Number.isInteger(s))
        .slice(0, 20)
    : [];
  state.zoom = Math.min(8, Math.max(0.5, Number(state.zoom) || 1));
  return state;
}

let saveTimer: number | undefined;
let hashTimer: number | undefined;

export function persist(state: AppState): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // Storage full/unavailable: persistence is best-effort.
    }
  }, 300);
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    history.replaceState(null, "", toHash(state));
  }, 250);
}
