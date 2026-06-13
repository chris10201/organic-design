/**
 * Named config presets saved to localStorage — the user's own "good config
 * combinations" found by tuning, recalled with one click.
 *
 * A preset stores the OrganicConfig (the spec carrier) only — the same payload
 * as file export/import; playground geometry and render mode are not part of
 * the spec and stay out (consistent with the built-in subtle/bold presets).
 *
 * Pure transforms (parse/serialize/upsert/remove) are kept free of any DOM/
 * storage dependency so they can be unit-tested without a browser; the
 * localStorage I/O lives in the thin load/save wrappers.
 */

import { parseConfig, serializeConfig } from "../core/config";
import type { OrganicConfig } from "../core/types";

/** localStorage key for the preset library (exported so the panel can match `storage` events). */
export const PRESETS_KEY = "organic-design:v1:presets";

export interface Preset {
  /** User-given name; also the identity — saving under an existing name overwrites it. */
  name: string;
  config: OrganicConfig;
}

/**
 * Validate raw parsed JSON into Presets. Every config is round-tripped through
 * parseConfig — the same validation as file import — so a stale or hand-edited
 * localStorage entry can never feed an out-of-range config into the app;
 * nameless, unparseable, or duplicate-named entries are dropped rather than
 * bricking the panel.
 */
export function parsePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (name === "" || seen.has(name)) continue;
    try {
      // parseConfig takes a JSON string; the stored config is a plain object.
      out.push({ name, config: parseConfig(JSON.stringify(rec.config)) });
      seen.add(name);
    } catch {
      // Drop the invalid entry; the rest of the list survives.
    }
  }
  return out;
}

/** Canonical JSON for storage — each config normalized exactly like file export. */
export function serializePresets(presets: Preset[]): string {
  return JSON.stringify(
    presets.map((p) => ({
      name: p.name,
      config: JSON.parse(serializeConfig(p.config)),
    })),
  );
}

/** Add a preset, or overwrite the same-named one in place (preserving order). */
export function upsertPreset(presets: Preset[], preset: Preset): Preset[] {
  const i = presets.findIndex((p) => p.name === preset.name);
  if (i === -1) return [...presets, preset];
  const next = presets.slice();
  next[i] = preset;
  return next;
}

export function removePreset(presets: Preset[], name: string): Preset[] {
  return presets.filter((p) => p.name !== name);
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? parsePresets(JSON.parse(raw)) : [];
  } catch {
    // Corrupt/unavailable storage: start from an empty list.
    return [];
  }
}

/**
 * Returns false if the write was rejected (quota exceeded, private-mode
 * denial, storage disabled). Unlike persist()'s background autosave of a
 * regenerable config, saving a named preset is an explicit durability action —
 * the caller surfaces failure rather than presenting a saved-looking row that
 * would vanish on reload.
 */
export function savePresets(presets: Preset[]): boolean {
  try {
    localStorage.setItem(PRESETS_KEY, serializePresets(presets));
    return true;
  } catch {
    return false;
  }
}
