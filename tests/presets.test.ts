import { describe, expect, it } from "vitest";

import { defaultConfig, serializeConfig } from "../src/core/config";
import {
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
  type Preset,
} from "../src/ui/presets";

/** A plain-object form of a valid config, as it sits inside stored JSON. */
function rawConfig(): Record<string, unknown> {
  return JSON.parse(serializeConfig(defaultConfig()));
}

function preset(name: string): Preset {
  return { name, config: defaultConfig() };
}

describe("presets serialize/parse round-trip", () => {
  it("survives a serialize → JSON.parse → parsePresets round-trip", () => {
    const list = [preset("alpha"), preset("beta")];
    const back = parsePresets(JSON.parse(serializePresets(list)));
    expect(back.map((p) => p.name)).toEqual(["alpha", "beta"]);
    expect(serializeConfig(back[0]!.config)).toBe(
      serializeConfig(list[0]!.config),
    );
  });
});

describe("parsePresets defends against bad storage", () => {
  it("returns [] for non-array input", () => {
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets({})).toEqual([]);
    expect(parsePresets("nope")).toEqual([]);
  });

  it("drops nameless, blank-named, and non-object entries", () => {
    const out = parsePresets([
      null,
      42,
      { config: rawConfig() }, // no name
      { name: "   ", config: rawConfig() }, // blank name
      { name: "ok", config: rawConfig() },
    ]);
    expect(out.map((p) => p.name)).toEqual(["ok"]);
  });

  it("trims names and drops later duplicates", () => {
    const out = parsePresets([
      { name: " dup ", config: rawConfig() },
      { name: "dup", config: rawConfig() },
    ]);
    expect(out.map((p) => p.name)).toEqual(["dup"]);
  });

  it("drops entries whose config fails validation", () => {
    const bad = rawConfig();
    bad.spec = "not-organic-line";
    const out = parsePresets([
      { name: "good", config: rawConfig() },
      { name: "bad", config: bad },
      { name: "missing" }, // no config at all
    ]);
    expect(out.map((p) => p.name)).toEqual(["good"]);
  });

  it("clamps out-of-range params via parseConfig", () => {
    const cfg = rawConfig();
    (cfg.params as Record<string, number>).amplitude = 999;
    const [p] = parsePresets([{ name: "huge", config: cfg }]);
    // @2 amplitude max is 0.4.
    expect(p!.config.params.amplitude).toBe(0.4);
  });
});

describe("upsertPreset / removePreset", () => {
  it("appends a new name", () => {
    const out = upsertPreset([preset("a")], preset("b"));
    expect(out.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("overwrites an existing name in place (preserving order)", () => {
    const base = [preset("a"), preset("b"), preset("c")];
    const replacement: Preset = {
      name: "b",
      config: { ...defaultConfig(), seed: 7 },
    };
    const out = upsertPreset(base, replacement);
    expect(out.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(out[1]!.config.seed).toBe(7);
  });

  it("does not mutate the input array", () => {
    const base = [preset("a")];
    upsertPreset(base, preset("b"));
    expect(base.map((p) => p.name)).toEqual(["a"]);
  });

  it("removes by name", () => {
    const out = removePreset([preset("a"), preset("b")], "a");
    expect(out.map((p) => p.name)).toEqual(["b"]);
  });
});
