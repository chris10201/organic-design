// Dev-only: capture v2 (bold + sketch outline) verification screenshots.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] ?? "shots-v2";
const base = "http://localhost:5199/";
mkdirSync(outDir, { recursive: true });

const SKETCH = "sketch=1,1.08,0.08,-0.05,0.9,0.018";
const BOLD = `alg=2&amp=0.18&wav=0.5&det=0.15&asym=0.2&crv=0.1&swv=0&seed=42&${SKETCH}`;

const shots = [
  ["bold-circle-tune", `${BOLD}&shape=circle&view=tune`],
  ["bold-rect-tune", `${BOLD}&shape=rect&view=tune`],
  ["bold-circle-grid", `${BOLD.replace("policy=", "")}&policy=per-instance&shape=circle&view=grid`],
  ["bold-ladder", `alg=2&wav=0.5&det=0.15&asym=0.2&seed=42&shape=circle&view=ladder`],
  ["subtle-default-tune", `alg=2&amp=0.01&wav=0.22&det=0.3&asym=0.12&crv=0.1&swv=0.08&seed=42&shape=rect&view=tune`],
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

for (const [name, hash] of shots) {
  await page.goto(`${base}#${hash}`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".panel");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "NO-CONSOLE-ERRORS");
await browser.close();
