// Dev-only: drive the playground headlessly and capture screenshots of every view.
// Usage: node scripts/shoot.mjs <outDir> [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:5199/";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".panel");

const views = ["tune", "lineup", "grid", "ladder", "fillStroke"];
for (const view of views) {
  await page.evaluate((v) => {
    location.hash = `#view=${v}`;
    location.reload();
  }, view);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(".panel");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${view}.png` });
}

// Interactions on the tune view: side-by-side, then blink held.
await page.evaluate(() => {
  location.hash = "#view=tune";
  location.reload();
});
await page.waitForLoadState("networkidle");
await page.waitForSelector(".view-toolbar");
await page.click('button.seg:has-text("並排")');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/tune-sidebyside.png` });
await page.click('button.seg:has-text("疊加")');
await page.keyboard.down(" ");
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/tune-blink-held.png` });
await page.keyboard.up(" ");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "NO-CONSOLE-ERRORS");
await browser.close();
