// Dev-only: capture candidate-config screenshots for Phase 4 visual tuning.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] ?? "shots-tune";
const base = "http://localhost:5199/";
mkdirSync(outDir, { recursive: true });

const candidates = {
  calm: "amp=0.009&wav=0.25&det=0.25&asym=0.1&crv=0.08&swv=0.06",
  current: "amp=0.012&wav=0.18&det=0.3&asym=0.15&crv=0.1&swv=0.08",
  lively: "amp=0.015&wav=0.12&det=0.45&asym=0.2&crv=0.15&swv=0.1",
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();

for (const [name, params] of Object.entries(candidates)) {
  for (const [shape, view] of [
    ["rect", "lineup"],
    ["rect", "grid"],
    ["circle", "tune"],
  ]) {
    await page.goto(`${base}#${params}&seed=42&shape=${shape}&view=${view}`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".panel");
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${outDir}/${name}-${shape}-${view}.png` });
  }
}
console.log("DONE");
await browser.close();
