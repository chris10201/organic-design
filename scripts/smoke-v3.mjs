// Dev-only end-to-end smoke test for the organic-outline@3 (extreme/blob) regime
// + the slider-label text-selection fix. Verifies: 極限預設 enters @3, the
// wavelength slider reaches 1.0, auto-fork @2→@3 on pushing past 0.5, no
// downgrade when dragging back, @3 persistence across reload, labels selectable.
// Captures a screenshot of the @3 blob. Exits non-zero on failure.
// Usage: node scripts/smoke-v3.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5199/";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  errors.push(msg);
};
const settle = () => page.waitForTimeout(450);
const badge = () => page.textContent(".alg-badge");
const wavNum = () =>
  page.evaluate(() => {
    // The wavelength row is the 2nd spec-param row; read its number input.
    const rows = [...document.querySelectorAll(".panel-section")].find((s) =>
      s.querySelector("h2")?.textContent?.includes("線條參數"),
    );
    const labels = [...rows.querySelectorAll(".param-label")];
    const wlLabel = labels.find((l) => l.textContent.includes("wavelength"));
    const row = wlLabel.closest(".row");
    return Number(row.querySelector('input[type="number"]').value);
  });
const wavSlider = () =>
  page.evaluateHandle(() => {
    const rows = [...document.querySelectorAll(".panel-section")].find((s) =>
      s.querySelector("h2")?.textContent?.includes("線條參數"),
    );
    const labels = [...rows.querySelectorAll(".param-label")];
    const wlLabel = labels.find((l) => l.textContent.includes("wavelength"));
    return wlLabel.closest(".row").querySelector('input[type="range"]');
  });

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".panel");
await settle();

// 0. Default is @2.
if ((await badge())?.trim() !== "organic-outline@2")
  fail(`expected default @2, got ${await badge()}`);

// 1. 極限預設 enters @3.
await page.click(".panel .btn:has-text('極限預設')");
await settle();
if ((await badge())?.trim() !== "organic-outline@3")
  fail(`極限預設 should enter @3, got ${await badge()}`);
const wlPreset = await wavNum();
if (Math.abs(wlPreset - 0.85) > 1e-6)
  fail(`極限預設 wavelength should be 0.85, got ${wlPreset}`);

// 2. Wavelength slider reaches 1.0 in @3.
const slider = await wavSlider();
await slider.evaluate((el) => {
  el.value = el.max;
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
const wlMax = await wavNum();
if (Math.abs(wlMax - 1.0) > 1e-6)
  fail(`wavelength slider should reach 1.0, got ${wlMax}`);

// 3. Screenshot of the @3 blob at wavelength 1.0.
await page.screenshot({ path: "scripts/v3-blob.png", fullPage: false });

// 4. No downgrade: drag wavelength back below 0.5, must stay @3.
await slider.evaluate((el) => {
  el.value = "0.3"; // track is normalized 0..1; 0.3 maps below 0.5 wavelength
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
if ((await badge())?.trim() !== "organic-outline@3")
  fail(`@3 must not downgrade when wavelength drops back, got ${await badge()}`);

// 5. @3 persists across reload (hash + localStorage).
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".panel");
await settle();
if ((await badge())?.trim() !== "organic-outline@3")
  fail(`@3 did not persist across reload, got ${await badge()}`);

// 6. Auto-fork @2 -> @3: reset to bold (@2), nudge wavelength past 0.5.
await page.click(".panel .btn:has-text('大膽預設')");
await settle();
if ((await badge())?.trim() !== "organic-outline@2")
  fail(`大膽預設 should be @2, got ${await badge()}`);
const slider2 = await wavSlider();
await slider2.evaluate((el) => {
  el.value = el.max; // past 0.5 -> should fork to @3
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
if ((await badge())?.trim() !== "organic-outline@3")
  fail(`pushing wavelength past 0.5 should fork @2->@3, got ${await badge()}`);

// 7. Slider labels are selectable (text-selection fix).
const userSelect = await page.evaluate(() => {
  const lbl = document.querySelector(".param-label");
  return getComputedStyle(lbl).userSelect;
});
if (userSelect === "none")
  fail(`.param-label should be selectable, user-select=${userSelect}`);

// 8. Double-clicking a resettable label resets WITHOUT leaving a stray selection.
const resettable = page.locator(".param-label.resettable").first();
await resettable.dblclick();
await settle();
const lingering = await page.evaluate(() =>
  (window.getSelection()?.toString() ?? "").trim(),
);
if (lingering !== "")
  fail(`dblclick-reset left a stray text selection: "${lingering}"`);

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "SMOKE-V3-OK");
process.exit(errors.length ? 1 : 0);
