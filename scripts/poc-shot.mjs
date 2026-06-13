// Dev-only: screenshot an SVG file via headless Chromium.
// Usage: node scripts/poc-shot.mjs <in.svg> <out.png>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync(process.argv[2], "utf8");
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 980, height: 680 } })).newPage();
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: process.argv[3] });
await browser.close();
console.log("shot", process.argv[3]);
