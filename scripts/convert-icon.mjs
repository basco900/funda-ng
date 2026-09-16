import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const svgPath = path.resolve("app/icon.svg");
const svgContent = fs.readFileSync(svgPath, "utf8");

const artifactDir = "C:/Users/HP/.gemini/antigravity-ide/brain/ea859c0b-e766-49bc-97b8-c601894a2b61";
const publicDir = path.resolve("public");
const rootDir = path.resolve(".");

const outputs = [
  path.join(rootDir, "icon.jpg"),
  path.join(publicDir, "icon.jpg"),
  path.join(artifactDir, "icon.jpg"),
];

async function run() {
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge" });
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }

  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 2, // 1024x1024 high resolution
  });

  // 1. Standard version (white background around rounded corners)
  const htmlWhite = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 512px;
            height: 512px;
            overflow: hidden;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          svg {
            width: 512px;
            height: 512px;
            display: block;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;

  await page.setContent(htmlWhite, { waitUntil: "load" });
  await page.waitForTimeout(200);

  const bufferWhite = await page.screenshot({
    type: "jpeg",
    quality: 98,
  });

  for (const outPath of outputs) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, bufferWhite);
    console.log("Saved JPEG to:", outPath);
  }

  // 2. Full-bleed dark version (#111313 background around rounded corners)
  const htmlDark = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 512px;
            height: 512px;
            overflow: hidden;
            background: #111313;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          svg {
            width: 512px;
            height: 512px;
            display: block;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;

  await page.setContent(htmlDark, { waitUntil: "load" });
  await page.waitForTimeout(200);

  const bufferDark = await page.screenshot({
    type: "jpeg",
    quality: 98,
  });

  const darkOutputs = [
    path.join(rootDir, "icon-dark.jpg"),
    path.join(publicDir, "icon-dark.jpg"),
    path.join(artifactDir, "icon-dark.jpg"),
  ];

  for (const outPath of darkOutputs) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, bufferDark);
    console.log("Saved Dark JPEG to:", outPath);
  }

  await browser.close();
  console.log("Conversion completed successfully!");
}

run().catch((err) => {
  console.error("Error converting SVG to JPG:", err);
  process.exit(1);
});
