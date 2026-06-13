// Dev-only end-to-end smoke test for the "My Presets" localStorage feature.
// Drives the playground headlessly: save → highlight → edit clears highlight →
// apply restores → reload persists → delete. Exits non-zero on any failure.
// Usage: node scripts/smoke-presets.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5199/";
const NAME = "smoke-test-preset";
const LS_PRESETS = "organic-design:v1:presets";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
// Accept prompts with the preset name; accept confirms (overwrite/delete).
page.on("dialog", (d) =>
  d.type() === "prompt" ? d.accept(NAME) : d.accept(),
);

const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  errors.push(msg);
};
const settle = () => page.waitForTimeout(450); // store rAF + persist debounce

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".panel");
await settle();

// 1. Empty state.
const emptyHint = await page.textContent(".preset-list .hint");
if (!emptyHint || !emptyHint.includes("尚無")) fail(`empty-state hint missing (got: ${emptyHint})`);

const hashBefore = await page.evaluate(() => location.hash);

// 2. Save current config.
await page.click(".panel .btn:has-text('儲存目前 config')");
await settle();
const item = page.locator(`.preset-item[data-name="${NAME}"]`);
if ((await item.count()) !== 1) fail("preset item not rendered after save");
const stored = await page.evaluate((k) => localStorage.getItem(k), LS_PRESETS);
if (!stored || !stored.includes(NAME)) fail("preset not written to localStorage");

// 3. Active highlight present (live config == saved preset).
if (!(await item.evaluate((el) => el.classList.contains("active"))))
  fail("saved preset should be highlighted active immediately after save");

// 4. Edit config (reroll seed) -> highlight clears, hash changes.
await page.click("body");
await page.keyboard.press("r");
await settle();
if (await item.evaluate((el) => el.classList.contains("active")))
  fail("highlight should clear after editing the config");
const hashAfterEdit = await page.evaluate(() => location.hash);
if (hashAfterEdit === hashBefore) fail("reroll did not change the config hash");

// 5. Apply preset -> config restored, highlight returns.
await item.locator(".preset-name").click();
await settle();
const hashAfterApply = await page.evaluate(() => location.hash);
if (hashAfterApply !== hashBefore) fail(`apply did not restore config (${hashAfterApply} != ${hashBefore})`);
if (!(await item.evaluate((el) => el.classList.contains("active"))))
  fail("highlight should return after applying the preset");

// 6. Persistence across reload.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".panel");
await settle();
if ((await page.locator(`.preset-item[data-name="${NAME}"]`).count()) !== 1)
  fail("preset did not persist across reload");

// 7. Delete.
await page.locator(`.preset-item[data-name="${NAME}"] .preset-del`).click();
await settle();
if ((await page.locator(`.preset-item[data-name="${NAME}"]`).count()) !== 0)
  fail("preset still present after delete");
const afterDelete = await page.evaluate((k) => localStorage.getItem(k), LS_PRESETS);
if (afterDelete && afterDelete.includes(NAME)) fail("deleted preset still in localStorage");

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "SMOKE-OK");
process.exit(errors.length ? 1 : 0);
