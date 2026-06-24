/** Left panel: spec parameter sliders + playground controls + config IO. */

import {
  ALGORITHM_V1,
  defaultConfig,
  defaultSketchOutline,
  PARAM_RANGES_V2,
  PARAM_RANGES_V3,
  parseConfig,
  serializeConfig,
  SKETCH_RANGES,
} from "../core/config";
import type { OrganicParams, SketchOutline } from "../core/types";
import { outline } from "./cache";
import { h } from "./dom";
import { PARAM_LABELS, TEXT } from "./labels";
import {
  loadPresets,
  PRESETS_KEY,
  removePreset,
  savePresets,
  upsertPreset,
} from "./presets";
import { exportSvgMarkup } from "./render";
import { currentShape, type AppState, type Store } from "./store";

interface Sync {
  (state: AppState): void;
}

interface SliderRowOpts {
  label: string;
  subKey?: string;
  hint?: string;
  /** Slider-track scale. */
  min: number;
  max: number;
  step: number;
  /** Track position → value (default identity) and inverse. */
  toValue?: (s: number) => number;
  toSlider?: (v: number) => number;
  decimals: number;
  get: (s: AppState) => number;
  set: (v: number) => void;
  /** Double-click on the label resets to this value. */
  resetTo?: number;
}

function sliderRow(opts: SliderRowOpts): { el: HTMLElement; sync: Sync } {
  const toValue = opts.toValue ?? ((s: number) => s);
  const toSlider = opts.toSlider ?? ((v: number) => v);
  const valueMin = toValue(opts.min);
  const valueMax = toValue(opts.max);

  const slider = h("input", {
    type: "range",
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
  });
  const num = h("input", {
    type: "number",
    class: "num",
    step: String(10 ** -opts.decimals),
  });
  const label = h(
    "label",
    { class: "param-label", title: opts.hint ?? "" },
    opts.label,
    opts.subKey ? h("code", {}, opts.subKey) : "",
  );

  slider.addEventListener("input", () => {
    opts.set(toValue(Number(slider.value)));
  });
  num.addEventListener("change", () => {
    if (num.value.trim() === "") return;
    const v = Number(num.value);
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(valueMax, Math.max(valueMin, v));
    opts.set(clamped);
    // Write the canonical value back: sync skips focused inputs, so an
    // Enter-commit would otherwise keep showing the raw out-of-range text.
    num.value = clamped.toFixed(opts.decimals);
  });
  if (opts.resetTo !== undefined) {
    label.addEventListener("dblclick", () => {
      opts.set(opts.resetTo!);
      // Labels are now text-selectable, so the reset double-click also triggers
      // native word-selection; clear it so a reset never leaves a stray highlight.
      window.getSelection()?.removeAllRanges();
    });
    label.classList.add("resettable");
  }

  const el = h(
    "div",
    { class: "row" },
    label,
    h("div", { class: "row-inputs" }, slider, num),
  );
  const sync: Sync = (state) => {
    const v = opts.get(state);
    if (document.activeElement !== slider) slider.value = String(toSlider(v));
    if (document.activeElement !== num) num.value = v.toFixed(opts.decimals);
  };
  return { el, sync };
}

function segmented<T extends string>(
  options: Array<[T, string]>,
  get: (s: AppState) => T,
  set: (v: T) => void,
): { el: HTMLElement; sync: Sync } {
  const buttons = options.map(([value, text]) => {
    const b = h("button", { class: "seg", type: "button" }, text);
    b.addEventListener("click", () => set(value));
    return [value, b] as const;
  });
  const el = h("div", { class: "segmented" }, ...buttons.map(([, b]) => b));
  const sync: Sync = (state) => {
    const cur = get(state);
    for (const [value, b] of buttons)
      b.classList.toggle("active", value === cur);
  };
  return { el, sync };
}

function section(
  title: string,
  ...children: Array<HTMLElement | string>
): HTMLElement {
  return h(
    "section",
    { class: "panel-section" },
    h("h2", {}, title),
    ...children,
  );
}

function download(filename: string, text: string): void {
  const a = h("a", {
    href: URL.createObjectURL(new Blob([text], { type: "application/json" })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function rerollSeed(store: Store): void {
  const s = store.get();
  const history = [s.config.seed, ...s.seedHistory].slice(0, 20);
  store.set({
    config: { ...s.config, seed: Math.floor(Math.random() * 0x7fffffff) },
    seedHistory: history,
  });
}

export function undoSeed(store: Store): void {
  const s = store.get();
  const [prev, ...rest] = s.seedHistory;
  if (prev === undefined) return;
  store.set({ config: { ...s.config, seed: prev }, seedHistory: rest });
}

export function buildPanel(store: Store): { el: HTMLElement; sync: Sync } {
  const syncs: Sync[] = [];
  const add = <T extends { el: HTMLElement; sync: Sync }>(
    x: T,
  ): HTMLElement => {
    syncs.push(x.sync);
    return x.el;
  };

  // --- Shape ---
  const shapeSeg = segmented(
    [
      ["roundedRect", TEXT.roundedRect],
      ["circle", TEXT.circle],
    ],
    (s) => s.shapeKind,
    (v) => store.set({ shapeKind: v }),
  );
  const rectRows = h(
    "div",
    {},
    add(
      sliderRow({
        label: TEXT.width,
        min: 48,
        max: 400,
        step: 1,
        decimals: 0,
        get: (s) => s.rectWidth,
        set: (v) => store.set({ rectWidth: v }),
      }),
    ),
    add(
      sliderRow({
        label: TEXT.height,
        min: 32,
        max: 240,
        step: 1,
        decimals: 0,
        get: (s) => s.rectHeight,
        set: (v) => store.set({ rectHeight: v }),
      }),
    ),
    add(
      sliderRow({
        label: TEXT.cornerRadius,
        min: 2,
        max: 120,
        step: 1,
        decimals: 0,
        get: (s) => s.cornerRadius,
        set: (v) => store.set({ cornerRadius: v }),
      }),
    ),
  );
  const circleRows = h(
    "div",
    {},
    add(
      sliderRow({
        label: TEXT.diameter,
        min: 32,
        max: 320,
        step: 1,
        decimals: 0,
        get: (s) => s.diameter,
        set: (v) => store.set({ diameter: v }),
      }),
    ),
  );
  syncs.push((s) => {
    rectRows.style.display = s.shapeKind === "roundedRect" ? "" : "none";
    circleRows.style.display = s.shapeKind === "circle" ? "" : "none";
  });

  // --- Spec params ---
  // Double-clicking a param label resets it to the center-point value (not 0):
  // the center is the home base the user adjusts around. "全部歸零" still zeroes.
  const CENTER = defaultConfig().params;
  const paramRow = (
    key: keyof OrganicParams,
    extra: Partial<SliderRowOpts> & { decimals: number },
  ) =>
    add(
      sliderRow({
        label: PARAM_LABELS[key].zh,
        subKey: key,
        hint: PARAM_LABELS[key].hint,
        min: PARAM_RANGES_V2[key].min,
        max: PARAM_RANGES_V2[key].max,
        step: PARAM_RANGES_V2[key].step,
        get: (s) => s.config.params[key],
        set: (v) => store.setParam(key, v),
        resetTo: CENTER[key],
        ...extra,
      }),
    );

  // Amplitude: quadratic taper — the perceptual sweet spot lives in the bottom third.
  const ampMax = PARAM_RANGES_V2.amplitude.max;
  const amplitudeRow = paramRow("amplitude", {
    min: 0,
    max: 1,
    step: 0.002,
    toValue: (s) => ampMax * s * s,
    toSlider: (v) => Math.sqrt(Math.max(0, v) / ampMax),
    decimals: 4,
  });
  // Wavelength: log scale — equal perceptual steps are frequency ratios. The
  // track always spans the widest (@3) range; editing past @2's 0.5 cap forks
  // the config to @3 (mirrors how any edit forks a frozen @1 up to @2).
  const wavMin = PARAM_RANGES_V2.wavelength.min;
  const wavRatio = PARAM_RANGES_V3.wavelength.max / wavMin;
  const wavelengthRow = paramRow("wavelength", {
    min: 0,
    max: 1,
    step: 0.005,
    toValue: (s) => wavMin * Math.pow(wavRatio, s),
    toSlider: (v) =>
      Math.log(Math.max(wavMin, v) / wavMin) / Math.log(wavRatio),
    decimals: 3,
  });
  const detailRow = paramRow("detail", { decimals: 2 });
  const asymmetryRow = paramRow("asymmetry", { decimals: 2 });
  const crvRow = paramRow("cornerRadiusVariation", { decimals: 3 });
  const swvRow = paramRow("strokeWidthVariation", { decimals: 3 });
  syncs.push((s) => {
    crvRow.classList.toggle("dimmed", s.shapeKind !== "roundedRect");
    swvRow.classList.toggle("dimmed", s.renderMode === "fill");
  });

  const zeroAll = h("button", { class: "btn", type: "button" }, TEXT.zeroAll);
  zeroAll.addEventListener("click", () => {
    // setParams (not setConfig): every param edit forks @1 → @2, including bulk ones.
    store.setParams({
      amplitude: 0,
      detail: 0,
      asymmetry: 0,
      cornerRadiusVariation: 0,
      strokeWidthVariation: 0,
    });
  });

  // --- Regime presets (one click into either end of the spectrum) ---
  const presetSubtle = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.presetSubtle,
  );
  presetSubtle.addEventListener("click", () => {
    store.setRegime(
      false,
      {
        amplitude: 0.01,
        wavelength: 0.22,
        detail: 0.3,
        asymmetry: 0.12,
        cornerRadiusVariation: 0.1,
        strokeWidthVariation: 0.08,
      },
      null,
    );
  });
  const presetBold = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.presetBold,
  );
  presetBold.addEventListener("click", () => {
    store.setRegime(
      false,
      {
        amplitude: 0.18,
        wavelength: 0.5,
        detail: 0.15,
        asymmetry: 0.2,
        cornerRadiusVariation: 0.1,
        strokeWidthVariation: 0,
      },
      defaultSketchOutline(),
    );
  });
  // Extreme/blob regime: wavelength past 0.5 forks the config to @3 (k0 = 1, a
  // single off-center egg/pear lobe).
  const presetExtreme = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.presetExtreme,
  );
  presetExtreme.addEventListener("click", () => {
    store.setRegime(
      true,
      {
        amplitude: 0.24,
        wavelength: 0.85,
        detail: 0.1,
        asymmetry: 0.18,
        cornerRadiusVariation: 0.12,
        strokeWidthVariation: 0,
      },
      defaultSketchOutline(),
    );
  });
  const algBadge = h("span", { class: "alg-badge" });
  syncs.push((s) => {
    algBadge.textContent = s.config.algorithm;
    algBadge.classList.toggle("frozen", s.config.algorithm === ALGORITHM_V1);
  });

  // --- Seed ---
  const seedInput = h("input", {
    type: "number",
    class: "num seed-num",
    step: "1",
  });
  seedInput.addEventListener("change", () => {
    if (seedInput.value.trim() === "") return;
    const v = Number(seedInput.value);
    if (!Number.isInteger(v)) return;
    const coerced = v >>> 0;
    store.setConfig({ seed: coerced });
    seedInput.value = String(coerced);
  });
  const rerollBtn = h(
    "button",
    { class: "btn", type: "button", title: "R" },
    `🎲 ${TEXT.reroll}`,
  );
  rerollBtn.addEventListener("click", () => rerollSeed(store));
  const historyChips = h("div", { class: "chips" });
  syncs.push((s) => {
    if (document.activeElement !== seedInput)
      seedInput.value = String(s.config.seed);
    historyChips.replaceChildren(
      ...s.seedHistory.slice(0, 5).map((seed) => {
        const chip = h(
          "button",
          { class: "chip", type: "button" },
          String(seed),
        );
        chip.addEventListener("click", () => store.setConfig({ seed }));
        return chip;
      }),
    );
  });

  // --- Render ---
  const modeSeg = segmented(
    [
      ["fill", TEXT.fill],
      ["stroke", TEXT.stroke],
      ["fillStroke", TEXT.fillStroke],
    ],
    (s) => s.renderMode,
    (v) => store.set({ renderMode: v }),
  );
  const strokeWidthRow = add(
    sliderRow({
      label: TEXT.strokeWidth,
      min: 0.5,
      max: 8,
      step: 0.5,
      decimals: 1,
      get: (s) => s.baseStrokeWidth,
      set: (v) => store.set({ baseStrokeWidth: v }),
    }),
  );
  syncs.push((s) =>
    strokeWidthRow.classList.toggle("dimmed", s.renderMode === "fill"),
  );
  const clampCheck = h("input", { type: "checkbox" });
  const clampNum = h("input", {
    type: "number",
    class: "num",
    step: "0.1",
    min: "0",
  });
  const applyClamp = () => {
    // 0 is a legal clamp value (fully flattened), so no `|| 1` shortcut here.
    const raw = Number(clampNum.value);
    const px = Number.isFinite(raw) && raw >= 0 ? raw : 1;
    store.setConfig({
      clamps: { maxAmplitudePx: clampCheck.checked ? px : null },
    });
    if (clampCheck.checked) clampNum.value = String(px);
  };
  clampCheck.addEventListener("change", applyClamp);
  clampNum.addEventListener("change", applyClamp);
  syncs.push((s) => {
    const v = s.config.clamps.maxAmplitudePx;
    clampCheck.checked = v !== null;
    clampNum.disabled = v === null;
    if (document.activeElement !== clampNum && v !== null)
      clampNum.value = String(v);
  });

  // --- Config IO ---
  const exportBtn = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.exportConfig,
  );
  exportBtn.addEventListener("click", () => {
    download("organic-line.config.json", serializeConfig(store.get().config));
  });
  const importInput = h("input", {
    type: "file",
    accept: ".json,application/json",
    hidden: "",
  });
  const importBtn = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.importConfig,
  );
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      store.setConfig(parseConfig(await file.text()));
    } catch (e) {
      alert(`匯入失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const copySvgBtn = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.copySvg,
  );
  const copyPathBtn = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.copyPath,
  );
  const flash = (btn: HTMLButtonElement) => {
    const old = btn.textContent;
    btn.textContent = "已複製 ✓";
    setTimeout(() => (btn.textContent = old), 900);
  };
  copySvgBtn.addEventListener("click", () => {
    const s = store.get();
    void navigator.clipboard
      .writeText(
        exportSvgMarkup({
          shape: currentShape(s),
          config: s.config,
          mode: s.renderMode,
          strokeWidth: s.baseStrokeWidth,
        }),
      )
      .then(() => flash(copySvgBtn));
  });
  copyPathBtn.addEventListener("click", () => {
    const s = store.get();
    const r = outline(currentShape(s), s.config, {
      strokeWidth: s.renderMode === "fill" ? undefined : s.baseStrokeWidth,
    });
    void navigator.clipboard.writeText(r.pathD).then(() => flash(copyPathBtn));
  });

  // --- Sketch outline (@2) ---
  const sketchCheck = h("input", { type: "checkbox" });
  sketchCheck.addEventListener("change", () => {
    store.setSketch(sketchCheck.checked ? defaultSketchOutline() : null);
  });
  const sketchValue = (key: "scale" | "amplitudeScale" | "widthRel") =>
    sliderRow({
      label:
        key === "scale"
          ? TEXT.sketchScale
          : key === "amplitudeScale"
            ? TEXT.sketchAmpScale
            : TEXT.sketchWidth,
      subKey: key,
      min: SKETCH_RANGES[key].min,
      max: SKETCH_RANGES[key].max,
      step: SKETCH_RANGES[key].step,
      decimals: 3,
      get: (s) => (s.config.sketchOutline ?? defaultSketchOutline())[key],
      set: (v) => store.patchSketch({ [key]: v }),
    });
  const sketchAxis = (axis: 0 | 1) =>
    sliderRow({
      label: axis === 0 ? TEXT.sketchOffsetX : TEXT.sketchOffsetY,
      min: SKETCH_RANGES.offset.min,
      max: SKETCH_RANGES.offset.max,
      step: SKETCH_RANGES.offset.step,
      decimals: 3,
      get: (s) =>
        (s.config.sketchOutline ?? defaultSketchOutline()).offset[axis],
      set: (v) => {
        const cur = (store.get().config.sketchOutline ?? defaultSketchOutline())
          .offset;
        const offset: SketchOutline["offset"] =
          axis === 0 ? [v, cur[1]] : [cur[0], v];
        store.patchSketch({ offset });
      },
    });
  const sketchRerollBtn = h(
    "button",
    { class: "btn", type: "button" },
    `🎲 ${TEXT.sketchReroll}`,
  );
  sketchRerollBtn.addEventListener("click", () => {
    const cur = store.get().config.sketchOutline ?? defaultSketchOutline();
    store.patchSketch({ seedShift: (cur.seedShift % 999) + 1 });
  });
  const sketchRows = h(
    "div",
    {},
    add(sketchValue("scale")),
    add(sketchAxis(0)),
    add(sketchAxis(1)),
    add(sketchValue("amplitudeScale")),
    add(sketchValue("widthRel")),
    sketchRerollBtn,
  );
  syncs.push((s) => {
    const on = s.config.sketchOutline != null;
    sketchCheck.checked = on;
    sketchRows.classList.toggle("dimmed", !on);
    // .dimmed only styles opacity — actually disable, or a drag on a "dimmed"
    // slider would silently enable the sketch (and fork @1 → @2).
    for (const input of sketchRows.querySelectorAll("input, button")) {
      (input as HTMLInputElement | HTMLButtonElement).disabled = !on;
    }
  });

  // --- My presets (localStorage) ---
  // presets live outside AppState: they are a user library, not part of the
  // single live config the store persists.
  let presets = loadPresets();
  // Canonical serialization of each preset's config, cached so the per-frame
  // active-match check (run on every slider drag) serializes only the live
  // config; rebuilt whenever the list changes.
  let presetSerials = presets.map((p) => serializeConfig(p.config));
  const presetList = h("div", { class: "preset-list" });

  // The saved preset (if any) whose config matches the live config exactly —
  // serializeConfig is the canonical form, so this is a robust equality check.
  const activeName = (state: AppState): string | null => {
    const i = presetSerials.indexOf(serializeConfig(state.config));
    return i === -1 ? null : presets[i]!.name;
  };

  const renderPresetList = (): void => {
    presetSerials = presets.map((p) => serializeConfig(p.config));
    if (presets.length === 0) {
      presetList.replaceChildren(h("p", { class: "hint" }, TEXT.noPresets));
      return;
    }
    presetList.replaceChildren(
      ...presets.map((p) => {
        const nameBtn = h(
          "button",
          { class: "preset-name", type: "button", title: TEXT.applyPreset },
          p.name,
        );
        nameBtn.addEventListener("click", () => store.setConfig(p.config));
        const delBtn = h(
          "button",
          { class: "preset-del", type: "button", title: TEXT.deletePreset },
          "×",
        );
        delBtn.addEventListener("click", () => {
          if (!confirm(`${TEXT.deletePreset}「${p.name}」？`)) return;
          presets = removePreset(presets, p.name);
          savePresets(presets);
          renderPresetList();
          syncPresetActive(store.get());
        });
        const item = h("div", { class: "preset-item" }, nameBtn, delBtn);
        item.dataset.name = p.name;
        return item;
      }),
    );
  };

  // Highlight EVERY preset whose stored config matches the live one (not just
  // the first): the same config can be saved under two names. DOM order tracks
  // presets / presetSerials order, both rebuilt together in renderPresetList.
  const syncPresetActive: Sync = (state) => {
    const current = serializeConfig(state.config);
    presetList
      .querySelectorAll<HTMLElement>(".preset-item")
      .forEach((item, i) =>
        item.classList.toggle("active", presetSerials[i] === current),
      );
  };

  const savePresetBtn = h(
    "button",
    { class: "btn", type: "button" },
    TEXT.savePreset,
  );
  savePresetBtn.addEventListener("click", () => {
    const input = prompt(TEXT.namePrompt, activeName(store.get()) ?? "");
    if (input === null) return;
    const name = input.trim();
    if (name === "") return;
    if (
      presets.some((p) => p.name === name) &&
      !confirm(`已存在「${name}」，要覆蓋嗎？`)
    )
      return;
    // Snapshot via the export round-trip: an independent, normalized,
    // already-validated copy that survives later edits to the live config.
    const config = parseConfig(serializeConfig(store.get().config));
    const next = upsertPreset(presets, { name, config });
    // Commit to the UI only if it actually persisted — otherwise the user
    // would see a saved-looking row that silently disappears on reload.
    if (!savePresets(next)) {
      alert(TEXT.presetSaveFailed);
      return;
    }
    presets = next;
    renderPresetList();
    syncPresetActive(store.get());
  });
  renderPresetList();
  syncs.push(syncPresetActive);

  // Cross-tab sync: another tab editing the library would otherwise be blindly
  // overwritten by this tab's stale in-memory list on its next save.
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== PRESETS_KEY) return;
    presets = loadPresets();
    renderPresetList();
    syncPresetActive(store.get());
  });

  const el = h(
    "aside",
    { class: "panel" },
    section(TEXT.shape, shapeSeg.el, rectRows, circleRows),
    section(
      TEXT.params,
      h(
        "div",
        { class: "row preset-row" },
        presetSubtle,
        presetBold,
        presetExtreme,
        algBadge,
      ),
      amplitudeRow,
      wavelengthRow,
      detailRow,
      asymmetryRow,
      crvRow,
      swvRow,
      h(
        "div",
        { class: "row seed-row" },
        h("label", { class: "param-label" }, TEXT.seed, h("code", {}, "seed")),
        h("div", { class: "row-inputs" }, seedInput, rerollBtn),
      ),
      historyChips,
      zeroAll,
      h("p", { class: "hint" }, TEXT.blinkHint),
    ),
    section(
      TEXT.sketch,
      h(
        "div",
        { class: "row" },
        h(
          "label",
          { class: "param-label" },
          sketchCheck,
          ` ${TEXT.sketchEnable} `,
          h("code", {}, "sketchOutline"),
        ),
      ),
      sketchRows,
    ),
    section(
      TEXT.render,
      modeSeg.el,
      strokeWidthRow,
      h(
        "div",
        { class: "row" },
        h("label", { class: "param-label" }, TEXT.clampLabel),
        h("div", { class: "row-inputs" }, clampCheck, clampNum),
      ),
    ),
    section(
      TEXT.config,
      h(
        "div",
        { class: "btn-grid" },
        exportBtn,
        importBtn,
        copySvgBtn,
        copyPathBtn,
      ),
      importInput,
      h("p", { class: "hint" }, TEXT.upgradeHint),
    ),
    section(
      TEXT.myPresets,
      savePresetBtn,
      presetList,
      h("p", { class: "hint" }, TEXT.presetHint),
    ),
  );
  syncs.push(shapeSeg.sync, modeSeg.sync);

  return { el, sync: (state) => syncs.forEach((fn) => fn(state)) };
}
